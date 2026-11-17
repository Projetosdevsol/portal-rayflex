import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Upload, 
  ArrowRight, 
  Check, 
  AlertCircle, 
  Table as TableIcon,
  ChevronRight,
  ChevronLeft,
  Settings2,
  FileSpreadsheet,
  Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useData } from '../contexts/DataContext';
import { logAction } from '../utils/audit';
import { encryptData } from '../utils/crypto';
import { getStatusLabel, normalizeStatusValue } from '../utils/status';
import { getErrorMessage } from '../utils/api';

interface DataImporterProps {
  isOpen: boolean;
  onClose: () => void;
  collectionName: string;
  title: string;
  schema: any;
  onImportComplete: (count: number) => void;
}

type Step = 'upload' | 'sheets' | 'mapping' | 'preview' | 'importing';

/** Accent/punctuation-insensitive key used to compare labels and headers. */
const normalizeImportKey = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * Extra header aliases seen in real spreadsheets. The field label and key are
 * always accepted too; this only bridges names like "NOME" -> name,
 * "MAC" -> mac_address and "PESSOAS AUTORIZADAS" -> authorized_people.
 */
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['nome', 'name', 'nome do ativo', 'nome do equipamento', 'nome da impressora', 'nome do nobreak', 'descricao', 'equipamento'],
  brand: ['marca', 'brand', 'fabricante'],
  model: ['modelo', 'model'],
  connectionType: ['tipo de conexao', 'conexao', 'connection type', 'tipo conexao', 'tipo de rede'],
  ipAddress: ['ip', 'endereco ip', 'ip address', 'endereco ip compartilhamento', 'ipaddress', 'endereco de ip'],
  mac_address: ['mac', 'mac address', 'endereco mac', 'mac_address', 'endereco fisico', 'mac address fisico'],
  authorized_people: ['pessoas autorizadas', 'pessoas autorizadas para uso', 'autorizados', 'usuarios autorizados', 'pessoas', 'colaboradores', 'authorized people', 'authorized_people'],
  assignedUserIds: ['usuarios', 'usuarios atribuidos', 'assigned users', 'assigneduserids', 'colaboradores', 'responsaveis'],
  location: ['localizacao', 'local', 'location', 'sala', 'setor'],
  unit: ['unidade', 'unit', 'filial'],
  status: ['status', 'situacao', 'estado'],
  nextMaintenanceDate: ['proxima manutencao', 'proxima manutencao data', 'next maintenance', 'nextmaintenancedate', 'data da proxima manutencao'],
  powerCapacity: ['potencia', 'potencia va w', 'power capacity', 'powercapacity'],
  serialNumber: ['numero de serie', 'serial', 'serial number', 'serialnumber', 'ns'],
  connectedDevices: ['equipamentos conectados', 'connected devices', 'connecteddevices'],
  batteryChangeDate: ['ultima troca de bateria', 'battery change date', 'batterychangedate', 'troca de bateria'],
  softwareName: ['software', 'nome do software', 'software name', 'softwarename'],
  licenseKey: ['chave de licenca', 'license key', 'licensekey', 'chave'],
  expirationDate: ['data de expiracao', 'expiracao', 'expiration date', 'expirationdate', 'validade'],
  hostname: ['hostname', 'nome da maquina', 'maquina', 'computador'],
  collaborator_id: ['colaborador', 'usuario', 'responsavel', 'collaborator'],
  login: ['login', 'usuario de rede', 'user'],
  email: ['email', 'e mail', 'correio'],
  sector_responsible: ['setor responsavel', 'setor', 'responsavel'],
  photoUrl: ['foto', 'foto do ativo', 'imagem', 'photo', 'photourl'],
};

const getFieldAliases = (field: any): string[] => {
  const lastKey = String(field.key).split('.').pop() || field.key;
  const lastLabel = String(field.label).split(' > ').pop() || field.label;
  const values = [
    field.key,
    lastKey,
    field.label,
    lastLabel,
    ...(HEADER_ALIASES[lastKey] || []),
  ];
  return Array.from(new Set(values.map(normalizeImportKey).filter(Boolean)));
};

/**
 * Picks the real header row. Spreadsheets often start with a title, a logo or
 * an empty line, which used to be captured as the header and broke mapping.
 */
const findHeaderRowIndex = (rows: any[][], fields: any[]): number => {
  const limit = Math.min(rows.length, 12);
  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < limit; i++) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const cells = row.map(normalizeImportKey).filter(Boolean);
    if (cells.length < 2) continue;

    let score = cells.length;
    fields.forEach((field) => {
      const aliases = getFieldAliases(field);
      if (cells.some((cell) => aliases.includes(cell))) score += 5;
    });

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
};

/** Accepts comma, semicolon, pipe and newline separated lists. */
const splitListValue = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value ?? '')
    .split(/[\n,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const resolveCollaboratorId = (token: string, collaborators: any[]): string | null => {
  const cleaned = token.replace(/\([^)]*\)/g, '').trim();
  const normalized = normalizeImportKey(cleaned);
  if (!normalized) return null;

  const match = collaborators.find((collaborator: any) =>
    collaborator.id === token ||
    normalizeImportKey(collaborator.name) === normalized ||
    normalizeImportKey(collaborator.login) === normalized ||
    normalizeImportKey(collaborator.email) === normalized
  );

  return match?.id || null;
};

const STATUS_GROUPS: Record<string, string[]> = {
  active: ['active', 'available', 'online', 'in-use'],
  inactive: ['inactive', 'offline', 'deactivated', 'retired'],
  maintenance: ['maintenance', 'pending'],
};

/** Normalizes enum values, including PT-BR status names and connection types. */
const normalizeEnumValue = (field: any, value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw || !Array.isArray(field.enum)) return raw;

  const normalized = normalizeImportKey(raw);
  const direct = field.enum.find(
    (option: string) => normalizeImportKey(option) === normalized
  );
  if (direct) return direct;

  if (field.key === 'connectionType' || field.key.endsWith('.connectionType')) {
    if (['wifi', 'wi fi', 'wireless', 'sem fio'].includes(normalized)) return 'WIFI';
    if (['rede', 'cabo', 'cabo de rede', 'ethernet', 'lan', 'rj45'].includes(normalized)) return 'Cabo de rede';
    if (['usb', 'cabo usb'].includes(normalized)) return 'USB';
  }

  if (field.key === 'status' || field.key.endsWith('.status')) {
    const semantic = normalizeStatusValue(raw);
    const group = Object.values(STATUS_GROUPS).find((values) => values.includes(semantic));
    if (group) {
      const match = field.enum.find((option: string) => group.includes(option));
      if (match) return match;
    }
  }

  return raw;
};

export const DataImporter: React.FC<DataImporterProps> = ({ 
  isOpen, 
  onClose, 
  collectionName, 
  title, 
  schema,
  onImportComplete 
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [fileData, setFileData] = useState<any[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fixedValues, setFixedValues] = useState<Record<string, string>>({});
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const { machines, collaborators } = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stepsInfo = [
    { title: 'Upload', desc: 'Selecione seu arquivo Excel (.xlsx ou .xls).' },
    { title: 'Seleção de Planilha', desc: 'Se o arquivo tiver várias abas, escolha a que contém os dados.' },
    { title: 'Mapeamento', desc: 'Associe as colunas da sua planilha aos campos do sistema.' },
    { title: 'Pré-visualização', desc: 'Confira os dados mapeados antes de confirmar.' },
    { title: 'Importação', desc: 'O sistema processará e salvará os dados na base.' }
  ];

  const getSchemaFields = (props: any, required: string[] = [], parentKey = '', parentLabel = '') => {
    let fields: any[] = [];
    Object.entries(props).forEach(([key, prop]: [string, any]) => {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;
      const fullLabel = parentLabel ? `${parentLabel} > ${prop.description || key}` : (prop.description || key);
      
      if (prop.type === 'object' && prop.properties) {
        fields = [...fields, ...getSchemaFields(prop.properties, prop.required || [], fullKey, prop.description || key)];
      } else {
        fields.push({
          key: fullKey,
          label: fullLabel,
          required: required.includes(key),
          enum: prop.enum,
          type: prop.type,
          format: prop.format,
          items: prop.items,
          ref: prop.$ref
        });
      }
    });
    return fields;
  };

  const schemaFields = getSchemaFields(schema.properties, schema.required).filter(field => {
    if (collectionName === 'collaborators') {
      return !['allocation_sector', 'unit', 'office_license', 'autodesk_credentials'].includes(field.key);
    }
    return true;
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        
        setWorkbook(wb);
        setSheetNames(wb.SheetNames);
        
        if (wb.SheetNames.length > 1) {
          setStep('sheets');
        } else {
          processSheet(wb, wb.SheetNames[0]);
        }
        setError(null);
      } catch (err) {
        setError('Erro ao ler o arquivo. Certifique-se de que é um Excel válido.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const processSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    try {
      const worksheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

      const headerRowIndex = findHeaderRowIndex(rows, schemaFields);

      if (rows.length <= headerRowIndex + 1) {
        setError(`A planilha "${sheetName}" deve conter pelo menos uma linha de cabeçalho e uma linha de dados.`);
        return;
      }

      const columnCount = Math.max(
        ...rows.slice(headerRowIndex).map((row) => (Array.isArray(row) ? row.length : 0)),
        0
      );

      // Duplicate/empty headers would collapse columns; give every column a
      // stable unique name so mapping and preview keep them apart.
      const usedHeaders = new Map<string, number>();
      const fileHeaders = Array.from({ length: columnCount }, (_, index) => {
        const raw = String(rows[headerRowIndex]?.[index] ?? '').trim();
        const base = raw || `Coluna ${index + 1}`;
        const seen = usedHeaders.get(base) || 0;
        usedHeaders.set(base, seen + 1);
        return seen === 0 ? base : `${base} (${seen + 1})`;
      });

      const dataRows = rows
        .slice(headerRowIndex + 1)
        .filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));

      setHeaders(fileHeaders);
      setFileData(dataRows);
      setSelectedSheet(sheetName);

      // Auto-mapping with normalized aliases (NOME, MAC, PESSOAS AUTORIZADAS...).
      const initialMapping: Record<string, string> = {};
      schemaFields.forEach(field => {
        const aliases = getFieldAliases(field);
        const match = fileHeaders.find(header => aliases.includes(normalizeImportKey(header)));
        if (match) initialMapping[field.key] = match;
      });

      setMapping(initialMapping);
      setStep('mapping');
    } catch (err) {
      setError('Erro ao processar a planilha selecionada.');
    }
  };

  const handleImport = async () => {
    setStep('importing');
    let count = 0;
    const total = fileData.length;

    try {
      for (let i = 0; i < total; i++) {
        const row = fileData[i];
        const mappedData: any = {};

        const setNestedValue = (target: any, siteKey: string, value: any) => {
          if (siteKey.includes('.')) {
            const [parent, child] = siteKey.split('.');
            if (!target[parent]) target[parent] = {};
            target[parent][child] = value;
          } else {
            target[siteKey] = value;
          }
        };

        /**
         * Converts one spreadsheet cell into the value stored in Firestore:
         * - lists become deduped arrays (comma/newline/semicolon separated);
         * - collaborator names/logins become collaborator IDs (N:N);
         * - status/connection enums are normalized to the stored keys.
         */
        const applyValue = (siteKey: string, rawValue: any, field: any) => {
          if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return;

          if (field?.type === 'array') {
            const tokens = splitListValue(rawValue);
            if (tokens.length === 0) return;

            if (field.items?.$ref === 'collaborator') {
              const ids = tokens
                .map((token) => resolveCollaboratorId(token, collaborators))
                .filter((id): id is string => Boolean(id));
              if (ids.length > 0) setNestedValue(mappedData, siteKey, Array.from(new Set(ids)));
            } else {
              setNestedValue(mappedData, siteKey, Array.from(new Set(tokens)));
            }
            return;
          }

          if (field?.enum) {
            setNestedValue(mappedData, siteKey, normalizeEnumValue(field, rawValue));
            return;
          }

          // Single references (e.g. machine -> collaborator) accept an ID, a
          // name, a login or an e-mail. Unknown text is preserved as typed.
          if (field?.ref === 'collaborator') {
            const raw = String(rawValue).trim();
            setNestedValue(
              mappedData,
              siteKey,
              resolveCollaboratorId(raw, collaborators) || raw
            );
            return;
          }

          setNestedValue(mappedData, siteKey, String(rawValue).trim());
        };

        Object.entries(mapping).forEach(([siteKey, fileHeader]) => {
          const headerIndex = headers.indexOf(fileHeader);
          if (headerIndex === -1) return;
          const field = schemaFields.find(f => f.key === siteKey);
          applyValue(siteKey, row[headerIndex], field);
        });

        // Apply fixed values
        Object.entries(fixedValues).forEach(([siteKey, value]) => {
          const field = schemaFields.find(f => f.key === siteKey);
          applyValue(siteKey, value, field);
        });

        // Add default values for missing required fields if possible
        schemaFields.forEach(field => {
          const value = field.key.includes('.') 
            ? mappedData[field.key.split('.')[0]]?.[field.key.split('.')[1]]
            : mappedData[field.key];

          const isMissing =
            value === undefined ||
            value === null ||
            value === '' ||
            (Array.isArray(value) && value.length === 0);

          if (field.required && isMissing) {
            // Find the property in the schema
            let prop = schema.properties;
            const keys = field.key.split('.');
            keys.forEach(k => {
              if (prop[k]) {
                if (prop[k].properties) prop = prop[k].properties;
                else prop = prop[k];
              }
            });

            if (prop.enum) {
              const defaultValue = normalizeEnumValue(field, prop.enum[0]);
              if (field.key.includes('.')) {
                const [parent, child] = field.key.split('.');
                if (!mappedData[parent]) mappedData[parent] = {};
                mappedData[parent][child] = defaultValue;
              } else {
                mappedData[field.key] = defaultValue;
              }
            }
          }
        });

        // Custom logic for collaborators
        if (collectionName === 'collaborators') {
          // Encrypt passwords
          ['login_password', 'email_password', 'autodesk_credentials'].forEach(field => {
            if (mappedData[field]) {
              mappedData[field] = encryptData(String(mappedData[field]));
            }
          });

          // Link machine by hostname or serial number
          if (mappedData.machine_id) {
            const machineSearchTerm = String(mappedData.machine_id).toLowerCase();
            const matchedMachine = machines.find(m => 
              m.hostname?.toLowerCase() === machineSearchTerm || 
              m.serialNumber?.toLowerCase() === machineSearchTerm ||
              m.id === machineSearchTerm
            );
            if (matchedMachine) {
              mappedData.machine_id = matchedMachine.id;
            } else {
              // If not found, clear it to avoid invalid references
              delete mappedData.machine_id;
            }
          }
        }

        // Custom logic for licenses
        if (collectionName === 'licenses') {
          if (Array.isArray(mappedData.assignedUserIds)) {
            mappedData.assignedUserIds = Array.from(new Set(mappedData.assignedUserIds));
            mappedData.used = mappedData.assignedUserIds.length;
          }
        }

        // Never persist duplicate N:N relations (authorized people, licenses).
        Object.keys(schema.properties || {}).forEach((fieldKey) => {
          const prop = schema.properties[fieldKey];
          if (prop?.type === 'array' && prop.items?.$ref && Array.isArray(mappedData[fieldKey])) {
            mappedData[fieldKey] = Array.from(new Set(mappedData[fieldKey]));
          }
        });

        if (Object.keys(mappedData).length > 0) {
          try {
            const docRef = await addDoc(collection(db, collectionName), mappedData);
            await logAction('import', collectionName, docRef.id, null, mappedData, `Imported ${title} via Excel`);
            count++;
          } catch (docError) {
            handleFirestoreError(docError, OperationType.CREATE, collectionName);
          }
        }
        setImportProgress(Math.round(((i + 1) / total) * 100));
      }
      onImportComplete(count);
      onClose();
      reset();
    } catch (err: any) {
      console.error('Import error:', err);
      setError(
        getErrorMessage(
          err,
          'Erro durante a importação. Algumas linhas podem ter sido processadas.'
        )
      );
      setStep('preview');
    }
  };

  const reset = () => {
    setStep('upload');
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet('');
    setFileData([]);
    setHeaders([]);
    setMapping({});
    setFixedValues({});
    setImportProgress(0);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[var(--ink)]/60 backdrop-blur-sm"
        />
        
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative rounded-[24px] sm:rounded-[32px] shadow-2xl w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden border"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
          >
            {/* Header */}
            <div className="px-4 sm:px-8 py-4 sm:py-6 border-b flex items-center justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}>
                  <Upload size={18} />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold line-clamp-1" style={{ color: 'var(--text-primary)' }}>Importador de {title}</h3>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                      {step === 'upload' && 'Passo 1: Arquivo'}
                      {step === 'sheets' && 'Passo 2: Planilha'}
                      {step === 'mapping' && 'Passo 3: Colunas'}
                      {step === 'preview' && 'Passo 4: Prévia'}
                      {step === 'importing' && 'Passo 5: Importando'}
                    </p>
                    <button onClick={() => setShowHelp(true)} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest hover:opacity-70" style={{ color: 'var(--accent-primary)' }}>
                      <Info size={10} /> Como funciona?
                    </button>
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-full transition-all hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Help Modal */}
            <AnimatePresence>
              {showHelp && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink)]/60 backdrop-blur-sm"
                  onClick={() => setShowHelp(false)}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-[var(--bg-primary)] p-6 rounded-3xl shadow-2xl w-full max-w-md border border-[var(--border-color)]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h4 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Como funciona a importação?</h4>
                    <div className="space-y-4">
                      {stepsInfo.map((s, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold text-xs" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--accent-primary)' }}>{i + 1}</div>
                          <div>
                            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{s.title}</p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setShowHelp(false)} className="w-full mt-6 py-2.5 rounded-xl font-bold text-sm" style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}>Entendido</button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          {error && (
            <div className="mb-6 p-4 rounded-2xl flex items-start gap-3 border" style={{ backgroundColor: 'var(--status-cancelled-bg)', color: 'var(--status-cancelled-text)', borderColor: 'var(--status-cancelled-text)' }}>
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {step === 'upload' && (
            <div className="h-full flex flex-col items-center justify-center py-6 sm:py-12">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-md aspect-video border-2 border-dashed rounded-[24px] sm:rounded-[32px] flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group p-6"
                style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                  <FileSpreadsheet size={28} />
                </div>
                <div className="text-center">
                  <p className="text-base sm:text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Clique para selecionar</p>
                  <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>ou arraste seu arquivo Excel</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept=".xlsx, .xls" 
                  onChange={handleFileUpload} 
                />
              </div>
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 w-full max-w-3xl">
                {[
                  { icon: Check, text: 'Suporta .xlsx e .xls' },
                  { icon: Check, text: 'Mapeamento flexível' },
                  { icon: Check, text: 'Pré-visualização real' }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--status-completed-bg)', color: 'var(--status-completed-text)' }}>
                      <item.icon size={12} />
                    </div>
                    <span className="text-[10px] sm:text-xs font-semibold">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'sheets' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <FileSpreadsheet size={20} style={{ color: 'var(--accent-primary)' }} />
                  Selecionar Planilha
                </h4>
                <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>Escolha qual aba deseja importar.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sheetNames.map((name) => (
                  <button
                    key={name}
                    onClick={() => workbook && processSheet(workbook, name)}
                    className="p-4 sm:p-6 border rounded-[20px] sm:rounded-[24px] transition-all text-left group"
                    style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
                  >
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center mb-3 sm:mb-4 transition-all" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      <TableIcon size={18} />
                    </div>
                    <p className="font-bold truncate text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>{name}</p>
                    <p className="text-[10px] mt-1 uppercase font-bold tracking-widest" style={{ color: 'var(--text-secondary)' }}>Processar aba</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Settings2 size={20} style={{ color: 'var(--accent-primary)' }} />
                  Mapeamento
                </h4>
                <div className="sm:text-right">
                  <p className="text-xs sm:text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Planilha: {selectedSheet}</p>
                  <p className="text-[10px] uppercase font-bold tracking-widest" style={{ color: 'var(--text-secondary)' }}>{fileData.length} registros</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {schemaFields.map((field) => {
                  const mappedHeader = mapping[field.key];
                  const headerIndex = headers.indexOf(mappedHeader);
                  const sampleValue = headerIndex !== -1 ? fileData[0]?.[headerIndex] : null;

                  return (
                    <div key={field.key} className="p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs sm:text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </p>
                          <span className="px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-tighter" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                            {field.key}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Campo do Sistema</p>
                      </div>

                      <div className="flex-1 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <ArrowRight size={14} className="shrink-0 hidden md:block" style={{ color: 'var(--text-secondary)' }} />
                          {field.enum ? (
                            <select 
                              className="flex-1 px-3 py-2 border rounded-xl text-xs sm:text-sm font-medium outline-none transition-all"
                              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                              value={fixedValues[field.key] ? `fixed:${fixedValues[field.key]}` : (mapping[field.key] || '')}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val.startsWith('fixed:')) {
                                  setFixedValues({ ...fixedValues, [field.key]: val.replace('fixed:', '') });
                                  const newMapping = { ...mapping };
                                  delete newMapping[field.key];
                                  setMapping(newMapping);
                                } else {
                                  setMapping({ ...mapping, [field.key]: val });
                                  const newFixed = { ...fixedValues };
                                  delete newFixed[field.key];
                                  setFixedValues(newFixed);
                                }
                              }}
                            >
                              <option value="">Não importar</option>
                              <optgroup label="Valor Fixo para todos">
                                {field.enum.map((opt: string) => (
                                  <option key={`fixed:${opt}`} value={`fixed:${opt}`}>
                                    {field.key === 'status' || field.key.endsWith('.status') ? getStatusLabel(opt) : opt}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Mapear da Planilha">
                                {headers.map(h => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </optgroup>
                            </select>
                          ) : (
                            <select 
                              className="flex-1 px-3 py-2 border rounded-xl text-xs sm:text-sm font-medium outline-none transition-all"
                              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                              value={mapping[field.key] || ''}
                              onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                            >
                              <option value="">Não importar</option>
                              {headers.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          )}
                        </div>
                        {mappedHeader && !fixedValues[field.key] && (
                          <div className="flex items-center gap-2 px-2 py-1 rounded-lg border" style={{ backgroundColor: 'var(--status-progress-bg)', color: 'var(--status-progress-text)', borderColor: 'var(--status-progress-text)' }}>
                            <Info size={10} className="shrink-0" />
                            <p className="text-[9px] font-bold truncate">
                              Exemplo: <span className="font-medium italic opacity-80">"{sampleValue || '(vazio)'}"</span>
                            </p>
                          </div>
                        )}
                        {fixedValues[field.key] && (
                          <div className="flex items-center gap-2 px-2 py-1 rounded-lg border" style={{ backgroundColor: 'var(--status-progress-bg)', color: 'var(--status-progress-text)', borderColor: 'var(--status-progress-text)' }}>
                            <Info size={10} className="shrink-0" />
                            <p className="text-[9px] font-bold truncate">
                              Valor Fixo: <span className="font-medium italic opacity-80">"{fixedValues[field.key]}"</span>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <TableIcon size={20} style={{ color: 'var(--accent-primary)' }} />
                  Pré-visualização
                </h4>
                <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>Mostrando 5 de {fileData.length} registros.</p>
              </div>

              <div className="border rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                <div className="scroll-horizontal">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                        {schemaFields.filter(f => mapping[f.key] || fixedValues[f.key]).map(field => (
                          <th key={field.key} className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest border-b whitespace-nowrap" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}>
                            {field.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]">
                      {fileData.slice(0, 5).map((row, i) => (
                        <tr key={i} className="transition-colors">
                          {schemaFields.filter(f => mapping[f.key] || fixedValues[f.key]).map(field => {
                            const headerIndex = headers.indexOf(mapping[field.key]);
                            const rawValue = fixedValues[field.key] || (headerIndex !== -1 ? row[headerIndex] : '');
                            const value = Array.isArray(rawValue) ? rawValue.join(', ') : rawValue;
                            const displayValue =
                              (field.key === 'status' || field.key.endsWith('.status')) && value
                                ? getStatusLabel(value)
                                : value;
                            return (
                              <td key={field.key} className="px-4 py-3 text-xs truncate max-w-[150px]" style={{ color: 'var(--text-primary)' }}>
                                {String(displayValue || '-')}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {fileData.length > 5 && (
                <p className="text-center text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>... e mais {fileData.length - 5} registros</p>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="h-full flex flex-col items-center justify-center py-12 space-y-8">
              <div className="relative w-24 h-24 sm:w-32 sm:h-32">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle className="stroke-current" style={{ color: 'var(--bg-secondary)' }} strokeWidth="8" cx="50" cy="50" r="40" fill="transparent"></circle>
                  <circle 
                    className="stroke-current transition-all duration-300" 
                    style={{ color: 'var(--accent-primary)' }}
                    strokeWidth="8" 
                    strokeLinecap="round" 
                    cx="50" 
                    cy="50" 
                    r="40" 
                    fill="transparent"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * importProgress) / 100}
                    transform="rotate(-90 50 50)"
                  ></circle>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{importProgress}%</span>
                </div>
              </div>
              <div className="text-center">
                <h4 className="text-lg sm:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Importando Dados</h4>
                <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>Aguarde a conclusão do processo.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-8 py-4 sm:py-6 border-t flex items-center justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
          <button 
            onClick={step === 'upload' ? onClose : () => {
              if (step === 'sheets') setStep('upload');
              else if (step === 'mapping') setStep(sheetNames.length > 1 ? 'sheets' : 'upload');
              else if (step === 'preview') setStep('mapping');
            }}
            disabled={step === 'importing'}
            className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 sm:py-2.5 font-bold rounded-xl transition-all disabled:opacity-50 text-xs sm:text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {step === 'upload' ? 'Cancelar' : <><ChevronLeft size={18} /> Voltar</>}
          </button>

          <div className="flex items-center gap-3">
            {step === 'mapping' && (
              <button 
                onClick={() => setStep('preview')}
                className="flex items-center gap-2 px-6 sm:px-8 py-2 sm:py-2.5 rounded-xl transition-all shadow-lg font-bold text-xs sm:text-sm"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
              >
                <span>Próximo</span>
                <ChevronRight size={18} />
              </button>
            )}
            {step === 'preview' && (
              <button 
                onClick={handleImport}
                className="flex items-center gap-2 px-6 sm:px-8 py-2 sm:py-2.5 rounded-xl transition-all shadow-lg font-bold text-xs sm:text-sm"
                style={{ backgroundColor: 'var(--status-completed-text)', color: 'white' }}
              >
                <Check size={18} />
                <span>IMPORTAR</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
