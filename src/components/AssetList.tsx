import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { logAction } from '../utils/audit';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { 
  Plus, 
  Search, 
  FileUp, 
  Edit2, 
  Trash2, 
  X,
  Download,
  Filter,
  AlertCircle,
  Check,
  MessageSquare,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  ChevronUp,
  ChevronDown,
  Settings,
  ArrowUpDown,
  MoreHorizontal,
  Monitor,
  Cpu,
  User,
  MapPin,
  Shield,
  Mail,
  Key,
  Briefcase,
  HardDrive,
  FileText,
  Database,
  Activity,
  Calendar,
  Printer,
  Package,
  Info,
  Lock,
  Image as ImageIcon,
  PlugZap
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { DoubleScrollContainer } from './DoubleScrollContainer';

import { DataImporter } from './DataImporter';
import { CommentsSection } from './CommentsSection';
import { ImageUpload } from './ImageUpload';

import { encryptData, decryptData } from '../utils/crypto';

const SecretValue: React.FC<{ value: string }> = ({ value }) => {
  const [isVisible, setIsVisible] = useState(false);
  const { isSuperAdmin, isAdmin, isEditor } = useAuth();
  const canView = isSuperAdmin || isAdmin || isEditor;
  const decrypted = decryptData(value);
  const displayValue = decrypted || value;

  if (!value) return <span className="text-gray-400 italic">Vazio</span>;

  return (
    <div className="flex items-center gap-2">
      <span 
        className="font-mono text-xs cursor-help" 
        style={{ color: 'var(--text-primary)' }}
        title={canView ? "Ao revelar este segredo, você está decriptografando dados sensíveis. Certifique-se de que ninguém esteja observando sua tela e que você esteja em um ambiente seguro." : "Acesso restrito"}
      >
        {isVisible && canView ? (displayValue || '-') : '••••••••'}
      </span>
      {canView ? (
        displayValue && (
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsVisible(!isVisible);
            }}
            className="p-1 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )
      ) : (
        <Lock size={12} className="text-gray-400" />
      )}
    </div>
  );
};

const PasswordInput: React.FC<{ 
  value: string; 
  onChange: (val: string) => void; 
  placeholder?: string; 
  required?: boolean;
  hasError?: boolean;
}> = ({ value, onChange, placeholder, required, hasError }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`w-full px-4 py-2.5 pr-12 border rounded-xl focus:ring-2 transition-all outline-none ${
          hasError 
            ? 'border-red-300 ring-2 ring-red-100 focus:ring-red-500/20 focus:border-red-500' 
            : 'focus:ring-accent-primary/20 focus:border-accent-primary'
        }`}
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: hasError ? undefined : 'var(--border-color)', color: 'var(--text-primary)' }}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-black/5 rounded-lg transition-colors text-gray-500"
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    'available': 'Ativado',
    'in-use': 'em uso',
    'maintenance': 'manutenção',
    'retired': 'baixado',
    'active': 'Ativado',
    'inactive': 'Desativado',
    'online': 'Ativado',
    'offline': 'Desativado',
    'pending': 'pendente',
    'in-progress': 'em andamento',
    'completed': 'concluído',
    'cancelled': 'cancelado',
    'deactivated': 'Desativado'
  };
  return labels[status] || status;
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'active':
    case 'available':
    case 'online':
    case 'completed':
      return <Check size={10} />;
    case 'inactive':
    case 'offline':
    case 'cancelled':
    case 'deactivated':
      return <X size={10} />;
    default:
      return <AlertCircle size={10} />;
  }
};

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    'available': 'var(--status-success)',
    'active': 'var(--status-success)',
    'online': 'var(--status-success)',
    'completed': 'var(--status-success)',
    'in-use': 'var(--brand-primary)',
    'in-progress': 'var(--brand-primary)',
    'maintenance': 'var(--status-warning)',
    'pending': 'var(--status-warning)',
    'retired': 'var(--status-error)',
    'inactive': 'var(--status-error)',
    'offline': 'var(--status-error)',
    'cancelled': 'var(--status-error)',
    'deactivated': 'var(--status-error)'
  };
  return colors[status] || 'var(--text-secondary)';
};

interface AssetListProps {
  collectionName: string;
  title: string;
  columns: { key: string; label: string; render?: (val: any, item: any) => React.ReactNode }[];
  schema: any;
  icon: any;
  disableImport?: boolean;
  restrictAddtoSuperAdmin?: boolean;
}

export const AssetList: React.FC<AssetListProps> = ({ 
  collectionName, 
  title, 
  columns, 
  schema, 
  icon: Icon,
  disableImport = false,
  restrictAddtoSuperAdmin = false
}) => {
  const { isSuperAdmin, isEditor, isManager, isViewer, profile, canEdit, canDelete, loading: authLoading } = useAuth();
  const { getReferencedData } = useData();
  const commentsRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortCriteria, setSortCriteria] = useState<{ field: string; order: 'asc' | 'desc' }[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [selectedOSVersions, setSelectedOSVersions] = useState<string[]>([]);
  const allUnits = React.useMemo(() => Array.from(new Set(items.map(item => item.unit).filter(Boolean))) as string[], [items]);
  const allOSVersions = React.useMemo(() => Array.from(new Set(items.map(item => item.osVersion).filter(Boolean))) as string[], [items]);
  const allStatuses = React.useMemo(() => Array.from(new Set(items.map(item => item.status).filter(Boolean))) as string[], [items]);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [justification, setJustification] = useState('');
  const [showJustification, setShowJustification] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(columns.map(c => c.key));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [arraySearchTerms, setArraySearchTerms] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState(0);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (authLoading || !profile) return;

    // Default sorting based on collection
    let defaultSort = 'name';
    if (collectionName === 'machines') defaultSort = 'hostname';
    if (collectionName === 'servers') defaultSort = 'machine_id';
    if (collectionName === 'printers') defaultSort = 'brand';
    if (collectionName === 'ups') defaultSort = 'brand';
    if (collectionName === 'licenses') defaultSort = 'softwareName';
    
    setSortCriteria([{ field: defaultSort, order: 'asc' }]);
    setSelectedStatuses([]); // Reset filters on collection change
    setSelectedUnits([]);
    setSelectedOSVersions([]);
    setVisibleColumns(columns.map(c => c.key)); // Reset visible columns
    setCurrentPage(1); // Reset pagination

    let q = query(collection(db, collectionName));
    
    // Special handling for auditLogs: if not super admin, must filter by userId
    if (collectionName === 'auditLogs' && !isSuperAdmin && profile) {
      q = query(
        collection(db, 'auditLogs'),
        where('userId', '==', profile.uid),
        orderBy('timestamp', 'desc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, collectionName);
      setLoading(false);
    });

    return unsubscribe;
  }, [collectionName, authLoading]);

  useEffect(() => {
    const unitParam = searchParams.get('unit');
    if (unitParam) {
      setSelectedUnits([unitParam]);
    }
    const id = searchParams.get('id');
    if (id && items.length > 0) {
      const item = items.find(i => i.id === id);
      if (item) {
        if (collectionName === 'collaborators') {
          setExpandedId(id);
        } else {
          setSelectedItem(item);
        }
      }
    }
  }, [searchParams, items, collectionName]);

  const isRecentComment = (lastCommentAt: any) => {
    if (!lastCommentAt) return false;
    try {
      const date = lastCommentAt.toDate ? lastCommentAt.toDate() : new Date(lastCommentAt);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      return diff < 24 * 60 * 60 * 1000; // 24 hours
    } catch (e) {
      return false;
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);

    // Basic validation check
    const requiredFields = schema.required || [];
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
      return;
    }
    
    // Check if justification is needed
    const criticalFields = ['email_password', 'os_license', 'cals'];
    const isCriticalUpdate = editingItem && Object.keys(formData).some(key => 
      criticalFields.includes(key) && formData[key] !== editingItem[key]
    );

    if (isEditor && isCriticalUpdate && !justification) {
      setShowJustification(true);
      return;
    }

    try {
      let dataToSave = { ...formData };

      if (collectionName === 'collaborators') {
        ['login_password', 'email_password', 'autodesk_credentials'].forEach(field => {
          if (dataToSave[field] && dataToSave[field] !== editingItem?.[field]) {
            dataToSave[field] = encryptData(dataToSave[field]);
          } else if (editingItem && !dataToSave[field]) {
            dataToSave[field] = editingItem[field];
          }
        });
      }

      if (editingItem) {
        const itemRef = doc(db, collectionName, editingItem.id);
        // Ensure id is removed from update data to prevent Firestore error
        const { id, ...updateData } = dataToSave;
        
        // Clean any undefined values just in case
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) delete updateData[key];
        });

        await updateDoc(itemRef, updateData);
        await logAction(
          'update', 
          collectionName, 
          editingItem.id, 
          editingItem, 
          updateData, 
          `Updated ${title}`,
          justification,
          isCriticalUpdate ? 'medium' : 'low'
        );
        showToast(`${title.slice(0, -1)} atualizado com sucesso!`, 'success');
      } else {
        const docRef = await addDoc(collection(db, collectionName), dataToSave);
        await logAction('create', collectionName, docRef.id, null, dataToSave, `Created new ${title}`);
        showToast(`${title.slice(0, -1)} criado com sucesso!`, 'success');
      }
      setIsModalOpen(false);
      setEditingItem(null);
      setFormData({});
      setJustification('');
      setShowJustification(false);
      setShowErrors(false);
    } catch (error) {
      console.error('Error saving asset:', error);
      showToast(`Erro ao salvar ${title.slice(0, -1).toLowerCase()}.`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    
    try {
      const item = items.find(i => i.id === id);
      if (!item) return;

      await deleteDoc(doc(db, collectionName, id));
      await logAction('delete', collectionName, id, item, null, `Deleted ${title} permanently`, '', 'high');
      showToast(`${title.slice(0, -1)} excluído permanentemente!`, 'success');
      setItemToDelete(null);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error deleting asset:', error);
      showToast(`Erro ao excluir ${title.slice(0, -1).toLowerCase()}.`, 'error');
    }
  };

  const handleSoftDelete = async (id: string) => {
    if (!isSuperAdmin) return;
    
    try {
      const item = items.find(i => i.id === id);
      if (!item) return;

      const newStatus = 'deactivated';
      await updateDoc(doc(db, collectionName, id), { status: newStatus });
      await logAction('update', collectionName, id, item, { ...item, status: newStatus }, `Inactivated ${title}`, '', 'medium');
      showToast(`${title.slice(0, -1)} desativado com sucesso!`, 'success');
      setItemToDelete(null);
    } catch (error) {
      console.error('Error inactivating asset:', error);
      showToast(`Erro ao desativar ${title.slice(0, -1).toLowerCase()}.`, 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (!canDelete || isManager || isViewer || selectedIds.length === 0) return;
    
    try {
      for (const id of selectedIds) {
        const item = items.find(i => i.id === id);
        if (!item) continue;
        await deleteDoc(doc(db, collectionName, id));
        await logAction('delete', collectionName, id, item, null, `Deleted ${title} permanently`, '', 'high');
      }
      showToast(`${selectedIds.length} itens excluídos com sucesso!`, 'success');
      setSelectedIds([]);
    } catch (error) {
      console.error('Error deleting assets:', error);
      showToast(`Erro ao excluir itens.`, 'error');
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (!canEdit || selectedIds.length === 0) return;
    
    try {
      for (const id of selectedIds) {
        const item = items.find(i => i.id === id);
        if (!item) continue;
        await updateDoc(doc(db, collectionName, id), { status: newStatus });
        await logAction('update', collectionName, id, item, { ...item, status: newStatus }, `Updated status of ${title}`, '', 'medium');
      }
      showToast(`${selectedIds.length} itens atualizados com sucesso!`, 'success');
      setSelectedIds([]);
    } catch (error) {
      console.error('Error updating assets:', error);
      showToast(`Erro ao atualizar itens.`, 'error');
    }
  };

  const handleBulkCollaboratorChange = async (collaboratorId: string) => {
    if (!canEdit || selectedIds.length === 0 || !collaboratorId) return;
    
    try {
      const collaborators = getReferencedData('collaborators');
      const collaborator = collaborators.find(c => c.id === collaboratorId);
      const collaboratorName = collaborator ? collaborator.name : 'Desconhecido';

      for (const id of selectedIds) {
        const item = items.find(i => i.id === id);
        if (!item) continue;
        await updateDoc(doc(db, collectionName, id), { collaborator_id: collaboratorId });
        await logAction('update', collectionName, id, item, { ...item, collaborator_id: collaboratorId }, `Associated machine with collaborator ${collaboratorName}`, '', 'medium');
      }
      showToast(`${selectedIds.length} máquinas associadas com sucesso!`, 'success');
      setSelectedIds([]);
    } catch (error) {
      console.error('Error updating assets:', error);
      showToast(`Erro ao associar máquinas.`, 'error');
    }
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(items);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, title);
    XLSX.writeFile(workbook, `${title}_Export.xlsx`);
  };

  const downloadTemplate = () => {
    const templateData = [
      columns.reduce((acc, col) => ({ ...acc, [col.label]: '' }), {})
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, `${title}_Template.xlsx`);
  };

  const handleImportComplete = (count: number) => {
    alert(`${count} registros importados com sucesso!`);
  };

  const filteredItems = items
    .filter(item => {
      const searchStr = searchTerm.toLowerCase();
      
      const matchesSearch = !searchStr || columns.some(col => {
        const val = item[col.key];
        if (val === undefined || val === null) return false;

        let displayVal = String(val);
        const prop = schema.properties[col.key];
        
        if (prop?.$ref) {
          const refItems = getReferencedData(prop.$ref);
          const refItem = refItems.find(i => i.id === val);
          if (refItem) {
            if (prop.$ref === 'collaborator') displayVal = `${refItem.name || ''} (${refItem.login || ''})`;
            else if (prop.$ref === 'machine') displayVal = refItem.hostname || '';
            else displayVal = refItem.name || refItem.title || String(val);
          }
        } else if (prop?.type === 'array' && prop.items?.$ref) {
          const refItems = getReferencedData(prop.items.$ref);
          const ids = Array.isArray(val) ? val : [];
          displayVal = ids.map(id => {
            const refItem = refItems.find(i => i.id === id);
            if (!refItem) return id;
            if (prop.items.$ref === 'collaborator') return `${refItem.name || ''} (${refItem.login || ''})`;
            if (prop.items.$ref === 'machine') return refItem.hostname || '';
            return refItem.name || refItem.title || id;
          }).join(', ');
        } else if (col.key === 'status') {
          displayVal = getStatusLabel(val);
        }
        
        return String(displayVal || '').toLowerCase().includes(searchStr);
      });
      
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(item.status);
      const matchesUnit = selectedUnits.length === 0 || selectedUnits.includes(item.unit);
      const matchesOSVersion = selectedOSVersions.length === 0 || selectedOSVersions.includes(item.osVersion);
      const matchesDeactivated = showDeactivated || item.status !== 'deactivated';
      
      return matchesSearch && matchesStatus && matchesUnit && matchesOSVersion && matchesDeactivated;
    })
    .sort((a, b) => {
      for (const criterion of sortCriteria) {
        const valA = String(a[criterion.field] || '').toLowerCase();
        const valB = String(b[criterion.field] || '').toLowerCase();
        
        if (valA < valB) return criterion.order === 'asc' ? -1 : 1;
        if (valA > valB) return criterion.order === 'asc' ? 1 : -1;
      }
      return 0;
    });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const toggleSort = (field: string, multi: boolean) => {
    setSortCriteria(prev => {
      const existing = prev.find(c => c.field === field);
      if (multi) {
        if (existing) {
          return prev.map(c => c.field === field ? { ...c, order: c.order === 'asc' ? 'desc' : 'asc' } : c);
        } else {
          return [...prev, { field, order: 'asc' }];
        }
      } else {
        if (existing && existing.order === 'asc') {
          return [{ field, order: 'desc' }];
        } else {
          return [{ field, order: 'asc' }];
        }
      }
    });
  };

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key) 
        : [...prev, key]
    );
  };

  const moveColumn = (key: string, direction: 'up' | 'down') => {
    setVisibleColumns(prev => {
      const index = prev.indexOf(key);
      if (index === -1) return prev;
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const newColumns = [...prev];
      [newColumns[index], newColumns[newIndex]] = [newColumns[newIndex], newColumns[index]];
      return newColumns;
    });
  };

  const renderField = (key: string, prop: any, parentKey?: string) => {
    if (!prop) return null;
    const fullKey = parentKey ? `${parentKey}.${key}` : key;
    const value = parentKey ? formData[parentKey]?.[key] : formData[key];
    const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
    const isRequired = schema.required?.includes(key);
    const hasError = showErrors && isRequired && !value;

    if (key === 'id') return null;

    if (prop.format === 'image' || key === 'photoUrl') {
      return (
        <ImageUpload
          key={fullKey}
          value={value || ''}
          collectionName={collectionName}
          label={prop.description || 'Foto do equipamento'}
          onChange={(url) => {
            if (parentKey) {
              setFormData({ ...formData, [parentKey]: { ...(formData[parentKey] || {}), [key]: url } });
            } else {
              setFormData({ ...formData, [key]: url });
            }
          }}
        />
      );
    }

    if (prop.type === 'object') {
      return (
        <div key={fullKey} className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-2xl border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
          <h4 className="col-span-full text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{key}</h4>
          {Object.entries(prop.properties).map(([subKey, subProp]: [string, any]) => renderField(subKey, subProp, key))}
        </div>
      );
    }

    if (prop.type === 'array') {
      const isRefArray = prop.items?.$ref;
      const allOptions = isRefArray 
        ? getReferencedData(prop.items.$ref)
        : [
            'Almoxarifado', 'Comercial', 'Compras', 'Diretoria', 'Exportação', 
            'Faturamento', 'Financeiro', 'Importação', 'Marketing', 'Produção', 
            'Projetos', 'Desenvolvimento', 'Qualidade', 'RH', 'Engenharia'
          ];
      const currentValues = value || [];
      const searchTerm = arraySearchTerms[fullKey] || '';

      const getLabel = (opt: any) => {
        if (!isRefArray) return opt;
        if (prop.items.$ref === 'collaborator') return `${opt.name} (${opt.login})`;
        if (prop.items.$ref === 'machine') return opt.hostname;
        return opt.name || opt.title || opt.id;
      };

      const getValue = (opt: any) => isRefArray ? opt.id : opt;

      const filteredOptions = allOptions.filter(opt => 
        getLabel(opt).toLowerCase().includes(searchTerm.toLowerCase())
      );

      const showSelectedOnly = arraySearchTerms[`${fullKey}_selectedOnly`] === 'true';
      const finalOptions = showSelectedOnly 
        ? filteredOptions.filter(opt => currentValues.includes(getValue(opt)))
        : filteredOptions;

      // Logic for quantity limit (specifically for licenses)
      const quantityLimit = collectionName === 'licenses' && key === 'assignedUserIds' ? Number(formData.quantity || 0) : Infinity;

      return (
        <div key={fullKey} className="col-span-full space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                {prop.description || key}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
              </label>
              {quantityLimit !== Infinity && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${currentValues.length >= quantityLimit ? 'bg-red-100 text-red-600' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'}`}>
                  {currentValues.length} / {quantityLimit} Atribuídos
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setArraySearchTerms(prev => ({ ...prev, [`${fullKey}_selectedOnly`]: showSelectedOnly ? 'false' : 'true' }))}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${showSelectedOnly ? 'bg-[var(--brand-primary)] text-[var(--bg-primary)] border-[var(--brand-primary)]' : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-color)]'}`}
              >
                {showSelectedOnly ? 'Mostrando Selecionados' : 'Mostrar Selecionados'}
              </button>
              {currentValues.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const updates: any = { [fullKey]: [] };
                    if (collectionName === 'licenses' && key === 'assignedUserIds') updates.used = 0;
                    setFormData({ ...formData, ...updates });
                  }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-red-500 hover:bg-red-50 transition-all"
                >
                  Limpar Tudo
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={14} />
            <input 
              type="text"
              placeholder={`Pesquisar ${prop.description || key.toLowerCase()}...`}
              value={searchTerm}
              onChange={(e) => setArraySearchTerms(prev => ({ ...prev, [fullKey]: e.target.value }))}
              className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-xs font-medium focus:ring-2 focus:ring-[var(--brand-primary)]/10 outline-none transition-all"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 rounded-2xl border transition-all max-h-80 overflow-y-auto ${hasError ? 'border-red-300 ring-2 ring-red-100' : ''}`} style={{ backgroundColor: 'var(--bg-secondary)', borderColor: hasError ? undefined : 'var(--border-color)' }}>
            {finalOptions.length > 0 ? (
              finalOptions.map(opt => {
                const optVal = getValue(opt);
                const isChecked = currentValues.includes(optVal);
                const isDisabled = !isChecked && currentValues.length >= quantityLimit;

                return (
                  <label 
                    key={optVal} 
                    className={`flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer border ${isChecked ? 'bg-[var(--bg-primary)] border-[var(--brand-primary)] shadow-sm' : 'bg-[var(--bg-primary)]/50 border-transparent hover:bg-[var(--bg-primary)] hover:border-[var(--border-color)]'} ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div className="relative flex items-center">
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        disabled={isDisabled}
                        onChange={(e) => {
                          const newValues = e.target.checked 
                            ? [...currentValues, optVal]
                            : currentValues.filter((v: string) => v !== optVal);
                          
                          const updates: any = { [fullKey]: newValues };
                          if (collectionName === 'licenses' && key === 'assignedUserIds') {
                            updates.used = newValues.length;
                          }
                          setFormData({ ...formData, ...updates });
                        }}
                        className="w-4 h-4 rounded border-[var(--border-color)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]/20 transition-all cursor-pointer disabled:cursor-not-allowed"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${isChecked ? 'text-[var(--brand-primary)]' : 'text-[var(--text-primary)]'}`}>
                        {getLabel(opt)}
                      </p>
                      {isRefArray && (opt.sector_responsible || opt.unit) && (
                        <p className="text-[9px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mt-0.5">
                          {opt.sector_responsible || opt.unit}
                        </p>
                      )}
                    </div>
                    {isChecked && (
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)]" />
                    )}
                  </label>
                );
              })
            ) : (
              <div className="col-span-full py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--bg-primary)] flex items-center justify-center mx-auto mb-3" style={{ color: 'var(--text-secondary)' }}>
                  <Search size={20} />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Nenhum resultado encontrado</p>
                {searchTerm && (
                  <button 
                    onClick={() => setArraySearchTerms(prev => ({ ...prev, [fullKey]: '' }))}
                    className="mt-2 text-[10px] font-bold text-[var(--brand-primary)] uppercase tracking-widest hover:underline"
                  >
                    Limpar Pesquisa
                  </button>
                )}
              </div>
            )}
          </div>
          
          {currentValues.length >= quantityLimit && quantityLimit !== Infinity && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
              <AlertCircle size={14} className="text-red-500" />
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Limite de usuários atingido ({quantityLimit})</p>
            </div>
          )}
        </div>
      );
    }

    if (prop.$ref) {
      const options = getReferencedData(prop.$ref);
      const getLabel = (opt: any) => {
        if (prop.$ref === 'collaborator') return `${opt.name} (${opt.login})`;
        if (prop.$ref === 'machine') return opt.hostname;
        return opt.name || opt.title || opt.id;
      };

      return (
        <div key={fullKey} className="space-y-2">
          <label className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
            {prop.description || key}
            {isRequired && <span className="text-red-500 ml-1">*</span>}
          </label>
          <select 
            className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 transition-all outline-none ${
              hasError 
                ? 'border-red-300 ring-2 ring-red-100 focus:ring-red-500/20 focus:border-red-500' 
                : 'focus:ring-accent-primary/20 focus:border-accent-primary'
            }`}
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: hasError ? undefined : 'var(--border-color)', color: 'var(--text-primary)' }}
            value={value || ''}
            onChange={(e) => {
              if (parentKey) {
                setFormData({ ...formData, [parentKey]: { ...(formData[parentKey] || {}), [key]: e.target.value } });
              } else {
                setFormData({ ...formData, [key]: e.target.value });
              }
            }}
            required={isRequired}
          >
            <option value="">Selecionar {prop.description || key}</option>
            {options.map(opt => (
              <option key={opt.id} value={opt.id}>{getLabel(opt)}</option>
            ))}
          </select>
          {hasError && <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Este campo é obrigatório</p>}
        </div>
      );
    }

    if (key === 'unit' && !prop.enum) {
      const registeredUnits = getReferencedData('units')
        .filter((u: any) => u.status !== 'deactivated')
        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
      const hasLegacyValue = value && !registeredUnits.some((u: any) => u.name === value);

      if (registeredUnits.length > 0) {
        return (
          <div key={fullKey} className="space-y-2">
            <label className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
              {prop.description || key}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            <select
              className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 transition-all outline-none ${
                hasError
                  ? 'border-red-300 ring-2 ring-red-100 focus:ring-red-500/20 focus:border-red-500'
                  : 'focus:ring-accent-primary/20 focus:border-accent-primary'
              }`}
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: hasError ? undefined : 'var(--border-color)', color: 'var(--text-primary)' }}
              value={value || ''}
              onChange={(e) => {
                if (parentKey) {
                  setFormData({ ...formData, [parentKey]: { ...(formData[parentKey] || {}), [key]: e.target.value } });
                } else {
                  setFormData({ ...formData, [key]: e.target.value });
                }
              }}
              required={isRequired}
            >
              <option value="">Selecionar unidade</option>
              {registeredUnits.map((u: any) => (
                <option key={u.id} value={u.name}>
                  {u.name}{u.city ? ` — ${u.city}${u.state ? `/${u.state}` : ''}` : ''}
                </option>
              ))}
              {hasLegacyValue && <option value={value}>{value} (antiga)</option>}
            </select>
            {hasError && <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Este campo é obrigatório</p>}
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              Unidades gerenciadas em Gestão → Unidades.
            </p>
          </div>
        );
      }
    }

    return (
      <div key={fullKey} className="space-y-2">
        <label className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
          {prop.description || key}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
        {prop.enum ? (
            <select 
              className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 transition-all outline-none ${
                hasError 
                  ? 'border-red-300 ring-2 ring-red-100 focus:ring-red-500/20 focus:border-red-500' 
                  : 'focus:ring-accent-primary/20 focus:border-accent-primary'
              }`}
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: hasError ? undefined : 'var(--border-color)', color: 'var(--text-primary)' }}
              value={value || ''}
              onChange={(e) => {
                if (parentKey) {
                  setFormData({ ...formData, [parentKey]: { ...(formData[parentKey] || {}), [key]: e.target.value } });
                } else {
                  setFormData({ ...formData, [key]: e.target.value });
                }
              }}
              required={isRequired}
            >
              <option value="">Selecionar {key}</option>
              {prop.enum.map((opt: string) => {
                if (opt === 'deactivated' && !isAdmin) return null;
                return (
                  <option key={opt} value={opt}>
                    {key === 'status' ? getStatusLabel(opt) : opt}
                  </option>
                );
              })}
            </select>
        ) : key.toLowerCase().includes('password') || key === 'autodesk_credentials' ? (
          <PasswordInput
            value={value || ''}
            onChange={(val) => {
              if (parentKey) {
                setFormData({ ...formData, [parentKey]: { ...(formData[parentKey] || {}), [key]: val } });
              } else {
                setFormData({ ...formData, [key]: val });
              }
            }}
            placeholder={`Ex: ${prop.description || ''}`}
            required={isRequired}
            hasError={hasError}
          />
        ) : (
          <input 
            type={prop.format === 'date' ? 'date' : 'text'}
            className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 transition-all outline-none ${
              hasError 
                ? 'border-red-300 ring-2 ring-red-100 focus:ring-red-500/20 focus:border-red-500' 
                : 'focus:ring-accent-primary/20 focus:border-accent-primary'
            }`}
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: hasError ? undefined : 'var(--border-color)', color: 'var(--text-primary)' }}
            value={value || ''}
            onChange={(e) => {
              if (parentKey) {
                setFormData({ ...formData, [parentKey]: { ...(formData[parentKey] || {}), [key]: e.target.value } });
              } else {
                setFormData({ ...formData, [key]: e.target.value });
              }
            }}
            required={isRequired}
            placeholder={`Ex: ${prop.description || ''}`}
          />
        )}
        {hasError && <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Este campo é obrigatório</p>}
      </div>
    );
  };

  const getSectionsForCollection = () => {
    switch (collectionName) {
      case 'collaborators':
        return [
          { title: 'Informações Pessoais', icon: <User size={16} />, fields: ['name', 'status', 'unit'] },
          { title: 'Alocação e Setor', icon: <MapPin size={16} />, fields: ['sector_responsible', 'allocation_sector', 'machine_id'] },
          { title: 'Acesso à Rede', icon: <Shield size={16} />, fields: ['login', 'login_password', 'network_group'] },
          { title: 'Comunicação (E-mail)', icon: <Mail size={16} />, fields: ['email', 'email_password', 'alias_creation', 'forwarding'] },
          { title: 'Licenças e Softwares', icon: <Briefcase size={16} />, fields: ['office_license', 'autodesk_credentials'] }
        ];
      case 'machines':
        return [
          { title: 'Identificação e Status', icon: <Monitor size={16} />, fields: ['hostname', 'status', 'unit', 'location'] },
          { title: 'Responsável', icon: <User size={16} />, fields: ['collaborator_id'] },
          { title: 'Hardware', icon: <Cpu size={16} />, fields: ['processor', 'memory', 'disk', 'ups', 'usb_enabled'] },
          { title: 'Software e Licença', icon: <Shield size={16} />, fields: ['osVersion', 'os_license', 'activated'] },
          { title: 'Documentação', icon: <FileText size={16} />, fields: ['invoiceNumber', 'danfeKey', 'serialNumber', 'biosDate'] },
          { title: 'Observações', icon: <MessageSquare size={16} />, fields: ['notes'] }
        ];
      case 'servers':
        return [
          { title: 'Identificação', icon: <Database size={16} />, fields: ['machine_id', 'brand_model', 'status', 'unit'] },
          { title: 'Configuração', icon: <Settings size={16} />, fields: ['configuration', 'storage', 'bios_date'] },
          { title: 'Software e Aplicação', icon: <Package size={16} />, fields: ['application', 'programs', 'cals'] }
        ];
      case 'licenses':
        return [
          { title: 'Software', icon: <Briefcase size={16} />, fields: ['softwareName', 'licenseKey'] },
          { title: 'Responsável e Unidade', icon: <User size={16} />, fields: ['assignedUserIds', 'unit'] },
          { title: 'Controle', icon: <Activity size={16} />, fields: ['quantity', 'used', 'expirationDate'] }
        ];
      case 'printers':
        return [
          { title: 'Identificação', icon: <Printer size={16} />, fields: ['brand', 'model', 'status', 'unit'] },
          { title: 'Conexão', icon: <ArrowUpDown size={16} />, fields: ['connectionType', 'ipAddress', 'location'] },
          { title: 'Manutenção', icon: <Calendar size={16} />, fields: ['nextMaintenanceDate'] },
          { title: 'Foto', icon: <ImageIcon size={16} />, fields: ['photoUrl'] }
        ];
      case 'ups':
        return [
          { title: 'Identificação', icon: <PlugZap size={16} />, fields: ['brand', 'model', 'status', 'unit'] },
          { title: 'Características', icon: <Settings size={16} />, fields: ['powerCapacity', 'serialNumber', 'location', 'connectedDevices'] },
          { title: 'Manutenção', icon: <Calendar size={16} />, fields: ['batteryChangeDate', 'nextMaintenanceDate'] },
          { title: 'Foto', icon: <ImageIcon size={16} />, fields: ['photoUrl'] }
        ];
      default:
        return [{ title: 'Informações Gerais', icon: <Info size={16} />, fields: Object.keys(schema.properties) }];
    }
  };

  const sections = getSectionsForCollection();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--bg-secondary)', borderTopColor: 'var(--accent-primary)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--bg-primary)' }}>
            <Icon size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{items.length} registros</p>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end">
          {!isViewer && (
            <>
              {!disableImport && (
                <button 
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-3 py-2 text-[var(--text-primary)] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--bg-secondary)] transition-colors shadow-sm font-bold text-xs"
                  title="Baixar Modelo Excel"
                >
                  <Download size={16} className="rotate-180" />
                  <span className="hidden sm:inline">BAIXAR TEMPLATE</span>
                </button>
              )}
              <button 
                onClick={exportToExcel}
                className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shadow-sm border font-bold text-xs"
                style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
                title="Exportar Base Atual"
              >
                <Download size={16} />
                <span className="hidden sm:inline">UPLOAD DE BASE ATUAL</span>
              </button>
              {canEdit && (
                <>
                  {!disableImport && (
                    <button 
                      onClick={() => setIsImporterOpen(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shadow-sm border font-bold text-xs"
                      style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
                      title="Importar do Excel"
                    >
                      <FileUp size={16} />
                      <span className="hidden sm:inline">IMPORTAR</span>
                    </button>
                  )}
                  {(restrictAddtoSuperAdmin ? isSuperAdmin : canEdit) && (
                    <button 
                      onClick={() => {
                        setEditingItem(null);
                        setFormData({});
                        setActiveTab(0);
                        setIsModalOpen(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all shadow-sm font-bold text-xs uppercase tracking-widest"
                      style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--bg-primary)' }}
                    >
                      <Plus size={16} />
                      <span>Novo</span>
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <DataImporter 
        isOpen={isImporterOpen}
        onClose={() => setIsImporterOpen(false)}
        collectionName={collectionName}
        title={title}
        schema={schema}
        onImportComplete={handleImportComplete}
      />

      <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
        <div className="p-3 border-b flex flex-col md:flex-row items-center gap-3" style={{ borderColor: 'var(--border-color)' }}>
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              placeholder={`Pesquisar em ${title.toLowerCase()}...`}
              className="w-full pl-9 pr-10 py-2 border rounded-lg transition-all outline-none text-sm focus:ring-2 focus:ring-[var(--brand-primary)]/10"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--bg-primary)] rounded-full transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
            <select 
              value={sortCriteria[0]?.field || ''}
              onChange={(e) => setSortCriteria([{ field: e.target.value, order: 'asc' }])}
              className="flex-1 md:flex-none text-xs font-bold uppercase tracking-wider border rounded-lg px-3 py-2 outline-none"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="">Ordenar por...</option>
              {columns.map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
            <button 
              onClick={() => setSortCriteria(prev => prev.length > 0 ? [{ ...prev[0], order: prev[0].order === 'asc' ? 'desc' : 'asc' }] : [])}
              className="p-2 rounded-lg border transition-colors shadow-sm"
              style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
            >
              <Filter size={16} className={sortCriteria[0]?.order === 'desc' ? 'rotate-180' : ''} />
            </button>

            <div className="hidden md:flex items-center gap-1 border rounded-lg p-1" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
              <button
                onClick={() => setShowDeactivated(!showDeactivated)}
                className={`p-1.5 rounded-md transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${
                  showDeactivated 
                    ? 'shadow-sm' 
                    : ''
                }`}
                style={{ 
                  backgroundColor: showDeactivated ? 'var(--brand-primary)' : 'transparent',
                  color: showDeactivated ? 'var(--bg-primary)' : 'var(--text-secondary)'
                }}
                title={showDeactivated ? "Ocultar Desativados" : "Mostrar Desativados"}
              >
                <Eye size={14} />
                <span>Desativados</span>
              </button>
              <div className="w-px h-4 mx-1" style={{ backgroundColor: 'var(--border-color)' }} />
              <button 
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'shadow-sm' : ''}`}
                style={{ 
                  backgroundColor: viewMode === 'table' ? 'var(--bg-primary)' : 'transparent',
                  color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
                title="Visualização em Tabela"
              >
                <List size={16} />
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'shadow-sm' : ''}`}
                style={{ 
                  backgroundColor: viewMode === 'grid' ? 'var(--bg-primary)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
                title="Visualização em Grade"
              >
                <LayoutGrid size={16} />
              </button>
            </div>

            <div className="relative">
              <button 
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className={`p-1.5 rounded-lg border transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${showColumnPicker ? '' : ''}`}
                style={{ 
                  backgroundColor: showColumnPicker ? 'var(--brand-primary)' : 'var(--bg-primary)',
                  color: showColumnPicker ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  borderColor: showColumnPicker ? 'var(--brand-primary)' : 'var(--border-color)'
                }}
              >
                <Settings size={14} />
                <span className="hidden sm:inline">Colunas</span>
              </button>

              <AnimatePresence>
                {showColumnPicker && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowColumnPicker(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-56 rounded-2xl shadow-xl border z-20 p-2"
                      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
                    >
                      <div className="p-2 mb-1 border-b" style={{ borderColor: 'var(--bg-secondary)' }}>
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Exibir Colunas</span>
                      </div>
                      <div className="max-h-64 overflow-y-auto py-1">
                        {columns.map(col => (
                          <div key={col.key} className="flex items-center gap-2 px-3 py-1 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
                            <label className="flex items-center gap-3 flex-1 cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                              <input 
                                type="checkbox" 
                                checked={visibleColumns.includes(col.key)}
                                onChange={() => toggleColumn(col.key)}
                                className="w-4 h-4 rounded focus:ring-accent-primary"
                                style={{ borderColor: 'var(--border-color)', color: 'var(--accent-primary)' }}
                              />
                              <span className="text-sm font-medium">{col.label}</span>
                            </label>
                            {visibleColumns.includes(col.key) && (
                              <div className="flex flex-col">
                                <button onClick={() => moveColumn(col.key, 'up')} className="p-0.5 hover:text-[var(--accent-primary)]" disabled={visibleColumns.indexOf(col.key) === 0}>
                                  <ChevronUp size={12} />
                                </button>
                                <button onClick={() => moveColumn(col.key, 'down')} className="p-0.5 hover:text-[var(--accent-primary)]" disabled={visibleColumns.indexOf(col.key) === visibleColumns.length - 1}>
                                  <ChevronDown size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {allStatuses.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3 border-b" style={{ borderColor: 'var(--bg-secondary)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest mr-1" style={{ color: 'var(--text-secondary)' }}>Filtrar Status:</span>
            {allStatuses.map((status: string) => (
              <button
                key={status}
                onClick={() => {
                  setSelectedStatuses(prev => 
                    prev.includes(status) 
                      ? prev.filter(s => s !== status) 
                      : [...prev, status]
                  );
                }}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all border ${
                  selectedStatuses.includes(status)
                    ? 'shadow-sm'
                    : ''
                }`}
                style={{ 
                  backgroundColor: selectedStatuses.includes(status) ? 'var(--brand-primary)' : 'var(--bg-primary)',
                  color: selectedStatuses.includes(status) ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  borderColor: selectedStatuses.includes(status) ? 'var(--brand-primary)' : 'var(--border-color)'
                }}
              >
                {getStatusLabel(status)}
              </button>
            ))}
            {selectedStatuses.length > 0 && (
              <button
                onClick={() => setSelectedStatuses([])}
                className="text-[10px] font-bold uppercase tracking-widest ml-2"
                style={{ color: 'var(--accent-primary)' }}
              >
                Limpar
              </button>
            )}
          </div>
        )}

        {allUnits.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3 border-b" style={{ borderColor: 'var(--bg-secondary)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest mr-1" style={{ color: 'var(--text-secondary)' }}>Filtrar Unidade:</span>
            {allUnits.map((unit: string) => (
              <button
                key={unit}
                onClick={() => {
                  setSelectedUnits(prev => 
                    prev.includes(unit) 
                      ? prev.filter(s => s !== unit) 
                      : [...prev, unit]
                  );
                }}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all border ${
                  selectedUnits.includes(unit)
                    ? 'shadow-sm'
                    : ''
                }`}
                style={{ 
                  backgroundColor: selectedUnits.includes(unit) ? 'var(--brand-primary)' : 'var(--bg-primary)',
                  color: selectedUnits.includes(unit) ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  borderColor: selectedUnits.includes(unit) ? 'var(--brand-primary)' : 'var(--border-color)'
                }}
              >
                {unit}
              </button>
            ))}
            {selectedUnits.length > 0 && (
              <button
                onClick={() => setSelectedUnits([])}
                className="text-[10px] font-bold uppercase tracking-widest ml-2"
                style={{ color: 'var(--accent-primary)' }}
              >
                Limpar
              </button>
            )}
          </div>
        )}

        {allOSVersions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3 border-b" style={{ borderColor: 'var(--bg-secondary)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest mr-1" style={{ color: 'var(--text-secondary)' }}>Filtrar Versão SO:</span>
            {allOSVersions.map((osVersion: string) => (
              <button
                key={osVersion}
                onClick={() => {
                  setSelectedOSVersions(prev => 
                    prev.includes(osVersion) 
                      ? prev.filter(s => s !== osVersion) 
                      : [...prev, osVersion]
                  );
                }}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all border ${
                  selectedOSVersions.includes(osVersion)
                    ? 'shadow-sm'
                    : ''
                }`}
                style={{ 
                  backgroundColor: selectedOSVersions.includes(osVersion) ? 'var(--brand-primary)' : 'var(--bg-primary)',
                  color: selectedOSVersions.includes(osVersion) ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  borderColor: selectedOSVersions.includes(osVersion) ? 'var(--brand-primary)' : 'var(--border-color)'
                }}
              >
                {osVersion}
              </button>
            ))}
            {selectedOSVersions.length > 0 && (
              <button
                onClick={() => setSelectedOSVersions([])}
                className="text-[10px] font-bold uppercase tracking-widest ml-2"
                style={{ color: 'var(--accent-primary)' }}
              >
                Limpar
              </button>
            )}
          </div>
        )}

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-4 p-4 border-b" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{selectedIds.length} selecionados</span>
            {canDelete && !isManager && !isViewer && (
              <button 
                onClick={handleBulkDelete}
                className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shadow-sm border font-bold text-xs bg-red-500 text-white"
              >
                <Trash2 size={16} />
                Excluir Selecionados
              </button>
            )}
            {schema.properties.status?.enum && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Alterar Status:</span>
                {schema.properties.status.enum.map((status: string) => (
                  <button
                    key={status}
                    onClick={() => handleBulkStatusChange(status)}
                    className="px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all border"
                    style={{ 
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      borderColor: 'var(--border-color)'
                    }}
                  >
                    {getStatusLabel(status)}
                  </button>
                ))}
              </div>
            )}
            {collectionName === 'machines' && (
              <div className="flex items-center gap-2 border-l pl-4 ml-2" style={{ borderColor: 'var(--border-color)' }}>
                <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Associar Colaborador:</span>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkCollaboratorChange(e.target.value);
                      e.target.value = ""; // Reset select
                    }
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-bold transition-all border outline-none cursor-pointer"
                  style={{ 
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border-color)'
                  }}
                >
                  <option value="">Selecionar...</option>
                  {getReferencedData('collaborators').sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Desktop Table */}
        {viewMode === 'table' && (
          <div className="hidden md:block">
            <DoubleScrollContainer>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                    <th className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.length === paginatedItems.length && paginatedItems.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(paginatedItems.map(item => item.id));
                          } else {
                            setSelectedIds([]);
                          }
                        }}
                        className="w-4 h-4 rounded focus:ring-accent-primary"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--accent-primary)' }}
                      />
                    </th>
                    {visibleColumns.map(key => {
                      const col = columns.find(c => c.key === key);
                      if (!col) return null;
                      return (
                        <th 
                          key={col.key} 
                          className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-colors group/th"
                          style={{ color: 'var(--text-secondary)' }}
                          onClick={(e) => toggleSort(col.key, e.shiftKey)}
                        >
                          <div className="flex items-center gap-2">
                            {col.label}
                            <div className="flex items-center gap-1 opacity-0 group-hover/th:opacity-100 transition-opacity">
                              {sortCriteria.findIndex(c => c.field === col.key) !== -1 && (
                                <span className="text-[8px] font-bold" style={{ color: 'var(--accent-primary)' }}>
                                  {sortCriteria.findIndex(c => c.field === col.key) + 1}
                                </span>
                              )}
                              {sortCriteria.find(c => c.field === col.key) ? (
                                sortCriteria.find(c => c.field === col.key)?.order === 'asc' ? <ChevronUp size={10} style={{ color: 'var(--accent-primary)' }} /> : <ChevronDown size={10} style={{ color: 'var(--accent-primary)' }} />
                              ) : (
                                <ArrowUpDown size={10} style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
                              )}
                            </div>
                          </div>
                        </th>
                      );
                    })}
                    {canEdit && <th className="px-6 py-4 text-right"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--bg-secondary)' }}>
                  {paginatedItems.map((item) => {
                    const isExpanded = expandedId === item.id;
                    return (
                      <React.Fragment key={item.id}>
                        <tr 
                          className="transition-colors group cursor-pointer" 
                          style={{ 
                            backgroundColor: isExpanded ? 'var(--bg-secondary)' : 'transparent'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isExpanded ? 'var(--bg-secondary)' : 'transparent'}
                          onClick={() => {
                            if (collectionName === 'collaborators') {
                              setExpandedId(isExpanded ? null : item.id);
                            } else {
                              setSelectedItem(item);
                            }
                          }}
                        >
                          <td className="px-6 py-4">
                            <input 
                              type="checkbox" 
                              checked={selectedIds.includes(item.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                if (e.target.checked) {
                                  setSelectedIds([...selectedIds, item.id]);
                                } else {
                                  setSelectedIds(selectedIds.filter(id => id !== item.id));
                                }
                              }}
                              className="w-4 h-4 rounded focus:ring-accent-primary"
                              style={{ borderColor: 'var(--border-color)', color: 'var(--accent-primary)' }}
                            />
                          </td>
                          {columns.filter(col => visibleColumns.includes(col.key)).map(col => {
                            const prop = schema.properties[col.key];
                            const val = item[col.key];
                            const isSecret = col.key.toLowerCase().includes('password') || col.key === 'autodesk_credentials';
                            
                            let displayVal = val;
                            if (prop?.$ref && val) {
                              const refItems = getReferencedData(prop.$ref);
                              const refItem = refItems.find(i => i.id === val);
                              if (refItem) {
                                if (prop.$ref === 'collaborator') displayVal = `${refItem.name} (${refItem.login})`;
                                else if (prop.$ref === 'machine') displayVal = refItem.hostname;
                                else displayVal = refItem.name || refItem.title || val;
                              }
                            }

                            if (col.key === 'photoUrl') {
                              return (
                                <td key={col.key} className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                  {val ? (
                                    <img src={val} alt="Foto do ativo" className="w-14 h-14 rounded-xl object-cover border" style={{ borderColor: 'var(--border-color)' }} referrerPolicy="no-referrer" />
                                  ) : (
                                    <span className="text-xs italic opacity-60">Sem foto</span>
                                  )}
                                </td>
                              );
                            }

                            return (
                              <td key={col.key} className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                <div className="flex items-center gap-2">
                                  {col.render ? col.render(val, item) : (
                                    isSecret ? <SecretValue value={val} /> : displayVal
                                  )}
                                  {col.key === 'name' && collectionName === 'collaborators' && item.status && (
                                    <div 
                                      className="flex items-center justify-center w-5 h-5 rounded-full shadow-sm flex-shrink-0" 
                                      style={{ backgroundColor: getStatusColor(item.status), color: 'white' }}
                                      title={getStatusLabel(item.status)}
                                    >
                                      {getStatusIcon(item.status)}
                                    </div>
                                  )}
                                  {(col.key === 'name' || col.key === 'hostname') && isRecentComment(item.lastCommentAt) && (
                                    <div 
                                      className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" 
                                      title="Comentário recente"
                                    />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedItem(item);
                                }}
                                className="p-1.5 rounded-md transition-all"
                                style={{ color: 'var(--text-secondary)' }}
                                title="Ver Observações"
                              >
                                <MessageSquare size={14} />
                              </button>
                              {canEdit && (
                                <>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingItem(item);
                                      if (collectionName === 'collaborators') {
                                        setFormData({
                                          ...item,
                                          login_password: decryptData(item.login_password) || item.login_password || '',
                                          email_password: decryptData(item.email_password) || item.email_password || '',
                                          autodesk_credentials: decryptData(item.autodesk_credentials) || item.autodesk_credentials || ''
                                        });
                                      } else {
                                        setFormData(item);
                                      }
                                      setIsModalOpen(true);
                                    }}
                                    className="p-1.5 rounded-md transition-all"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  {canDelete && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setItemToDelete(item);
                                      }}
                                      className="p-1.5 rounded-md transition-all hover:bg-red-500/10"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      <Trash2 size={14} className="hover:text-red-500" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        <AnimatePresence>
                          {isExpanded && collectionName === 'collaborators' && (
                            <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                              <td colSpan={visibleColumns.length + 1} className="px-6 pb-4 pt-0">
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-4 rounded-2xl border backdrop-blur-sm shadow-sm mt-2" style={{ borderColor: 'var(--border-color)', backgroundColor: 'color-mix(in srgb, var(--bg-primary), transparent 50%)' }}>
                                    <div className="flex items-center gap-4">
                                      <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--accent-primary)' }}>
                                        <Monitor className="w-5 h-5" />
                                      </div>
                                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {(() => {
                                          const machines = getReferencedData('machine');
                                          const machine = machines.find(m => m.id === item.machine_id);
                                          if (!machine) return <p className="text-sm italic" style={{ color: 'var(--text-secondary)' }}>Nenhuma máquina associada a este colaborador.</p>;
                                          
                                          return (
                                            <>
                                              <div>
                                                <span className="text-[10px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Hostname da Máquina</span>
                                                <span className="text-sm font-semibold block" style={{ color: 'var(--text-primary)' }}>{machine.hostname}</span>
                                              </div>
                                              <div>
                                                <span className="text-[10px] font-bold uppercase tracking-wider block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Processador</span>
                                                <div className="flex items-center gap-2">
                                                  <Cpu className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
                                                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{machine.processor}</span>
                                                </div>
                                              </div>
                                            </>
                                          );
                                        })()}
                                      </div>
                                      <button
                                        onClick={() => setSelectedItem(item)}
                                        className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:scale-105 active:scale-95"
                                        style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                                      >
                                        Ver Tudo
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </AnimatePresence>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </DoubleScrollContainer>
          </div>
        )}

        {/* Grid View */}
        {viewMode === 'grid' && (
          <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-6" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {paginatedItems.map((item) => (
              <div key={item.id} className="rounded-3xl border shadow-sm transition-all p-6 space-y-4 group relative overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                {item.photoUrl && (
                  <div className="-m-6 mb-0 h-44 overflow-hidden border-b" style={{ borderColor: 'var(--border-color)' }}>
                    <img src={item.photoUrl} alt="Foto do ativo" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                  </div>
                )}
                <div className="absolute top-4 left-4 z-10">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(item.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (e.target.checked) {
                        setSelectedIds([...selectedIds, item.id]);
                      } else {
                        setSelectedIds(selectedIds.filter(id => id !== item.id));
                      }
                    }}
                    className="w-4 h-4 rounded focus:ring-accent-primary"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--accent-primary)' }}
                  />
                </div>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    {columns.slice(0, 1).map(col => (
                      <div key={col.key}>
                        <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>{col.label}</span>
                        <div className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                          {col.render ? col.render(item[col.key], item) : (item[col.key] || '-')}
                          {collectionName === 'collaborators' && item.status && (
                            <div 
                              className="flex items-center justify-center w-5 h-5 rounded-full shadow-sm flex-shrink-0" 
                              style={{ backgroundColor: getStatusColor(item.status), color: 'white' }}
                              title={getStatusLabel(item.status)}
                            >
                              {getStatusIcon(item.status)}
                            </div>
                          )}
                          {isRecentComment(item.lastCommentAt) && (
                            <div 
                              className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" 
                              title="Comentário recente"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => setSelectedItem(item)}
                      className="p-2 rounded-xl transition-all"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <MessageSquare size={16} />
                    </button>
                    {canEdit && (
                      <>
                        <button 
                          onClick={() => {
                            setEditingItem(item);
                            if (collectionName === 'collaborators') {
                              setFormData({
                                ...item,
                                login_password: decryptData(item.login_password) || item.login_password || '',
                                email_password: decryptData(item.email_password) || item.email_password || '',
                                autodesk_credentials: decryptData(item.autodesk_credentials) || item.autodesk_credentials || ''
                              });
                            } else {
                              setFormData(item);
                            }
                            setIsModalOpen(true);
                          }}
                          className="p-2 rounded-xl transition-all"
                          style={{ color: 'var(--text-secondary)' }}
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        {canDelete && (
                          <button 
                            onClick={() => setItemToDelete(item)}
                            className="p-2 rounded-xl transition-all hover:bg-red-500/10"
                            style={{ color: 'var(--text-secondary)' }}
                            title="Excluir"
                          >
                            <Trash2 size={16} className="hover:text-red-500" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-3 pt-2">
                  {columns.slice(1).map(col => {
                    const prop = schema.properties[col.key];
                    const val = item[col.key];
                    if (val === null || val === undefined || val === '') return null;
                    const isSecret = col.key.toLowerCase().includes('password') || col.key === 'autodesk_credentials';
                    
                    let displayVal = val;
                    if (prop?.$ref && val) {
                      const refItems = getReferencedData(prop.$ref);
                      const refItem = refItems.find(i => i.id === val);
                      if (refItem) {
                        if (prop.$ref === 'collaborator') displayVal = `${refItem.name} (${refItem.login})`;
                        else if (prop.$ref === 'machine') displayVal = refItem.hostname;
                        else displayVal = refItem.name || refItem.title || val;
                      }
                    }

                    return (
                      <div key={col.key} className="flex justify-between items-center py-2 border-b last:border-0" style={{ borderColor: 'var(--bg-secondary)' }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{col.label}</span>
                        <div className="text-xs font-medium text-right max-w-[60%] truncate" style={{ color: 'var(--text-secondary)' }}>
                          {col.render ? col.render(val, item) : (
                            isSecret ? <SecretValue value={val} /> : (displayVal || '-')
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {collectionName === 'collaborators' && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--bg-secondary)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Monitor className="w-3 h-3 opacity-50" style={{ color: 'var(--text-secondary)' }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Máquina Associada</span>
                    </div>
                    {(() => {
                      const machines = getReferencedData('machine');
                      const machine = machines.find(m => m.id === item.machine_id);
                      if (!machine) return <p className="text-[10px] italic" style={{ color: 'var(--text-secondary)' }}>Sem máquina</p>;
                      return (
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{machine.hostname}</span>
                          <span className="opacity-70" style={{ color: 'var(--text-secondary)' }}>{machine.processor}</span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Mobile Card View */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--bg-secondary)' }}>
          {paginatedItems.map((item) => (
            <div key={item.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  {columns.slice(0, 2).map((col, idx) => (
                    <div key={col.key}>
                      <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>{col.label}</span>
                        <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        {col.render ? col.render(item[col.key], item) : (item[col.key] || '-')}
                        {idx === 0 && collectionName === 'collaborators' && item.status && (
                          <div 
                            className="flex items-center justify-center w-4 h-4 rounded-full shadow-sm flex-shrink-0" 
                            style={{ backgroundColor: getStatusColor(item.status), color: 'white' }}
                            title={getStatusLabel(item.status)}
                          >
                            {getStatusIcon(item.status)}
                          </div>
                        )}
                        {idx === 0 && isRecentComment(item.lastCommentAt) && (
                          <div 
                            className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" 
                            title="Comentário recente"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => setSelectedItem(item)}
                    className="p-2 rounded-lg border"
                    style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--bg-secondary)' }}
                  >
                    <MessageSquare size={16} />
                  </button>
                  {canEdit && (
                    <button 
                      onClick={() => {
                        setEditingItem(item);
                        if (collectionName === 'collaborators') {
                          setFormData({
                            ...item,
                            login_password: decryptData(item.login_password) || item.login_password || '',
                            email_password: decryptData(item.email_password) || item.email_password || '',
                            autodesk_credentials: decryptData(item.autodesk_credentials) || item.autodesk_credentials || ''
                          });
                        } else {
                          setFormData(item);
                        }
                        setIsModalOpen(true);
                      }}
                      className="p-2 rounded-lg border"
                      style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--bg-secondary)' }}
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                  {columns.slice(2).map(col => {
                    const val = item[col.key];
                    if (val === null || val === undefined || val === '') return null;
                    const isSecret = col.key.toLowerCase().includes('password') || col.key === 'autodesk_credentials';
                    return (
                      <div key={col.key}>
                        <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>{col.label}</span>
                        <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {col.render ? col.render(val, item) : (
                            isSecret ? <SecretValue value={val} /> : (val || '-')
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {collectionName === 'collaborators' && (
                <div className="mt-2 p-3 rounded-xl border border-dashed" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Monitor className="w-3 h-3 opacity-50" style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Máquina Associada</span>
                  </div>
                  {(() => {
                    const machines = getReferencedData('machine');
                    const machine = machines.find(m => m.id === item.machine_id);
                    if (!machine) return <p className="text-[10px] italic" style={{ color: 'var(--text-secondary)' }}>Sem máquina</p>;
                    return (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span style={{ color: 'var(--text-secondary)' }}>Hostname:</span>
                          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{machine.hostname}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span style={{ color: 'var(--text-secondary)' }}>Processador:</span>
                          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{machine.processor}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
              Exibindo <span style={{ color: 'var(--text-primary)' }}>{(currentPage - 1) * itemsPerPage + 1}</span> - <span style={{ color: 'var(--text-primary)' }}>{Math.min(currentPage * itemsPerPage, filteredItems.length)}</span> de <span style={{ color: 'var(--text-primary)' }}>{filteredItems.length}</span>
            </p>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-[10px] font-bold border rounded-lg disabled:opacity-50 transition-colors uppercase tracking-widest"
                style={{ color: 'var(--btn-secondary-text)', backgroundColor: 'var(--btn-secondary-bg)', borderColor: 'var(--btn-secondary-border)' }}
              >
                Anterior
              </button>
              <div className="flex items-center gap-1">
                {(() => {
                  const pages = [];
                  const maxVisible = 5;
                  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                  let end = Math.min(totalPages, start + maxVisible - 1);
                  
                  if (end - start + 1 < maxVisible) {
                    start = Math.max(1, end - maxVisible + 1);
                  }

                  for (let i = start; i <= end; i++) {
                    pages.push(
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i)}
                        className={`w-8 h-8 text-[10px] font-bold rounded-lg transition-all ${currentPage === i ? 'shadow-md' : ''}`}
                        style={{ 
                          backgroundColor: currentPage === i ? 'var(--btn-primary-bg)' : 'transparent',
                          color: currentPage === i ? 'var(--btn-primary-text)' : 'var(--text-secondary)'
                        }}
                      >
                        {i}
                      </button>
                    );
                  }
                  return pages;
                })()}
              </div>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-[10px] font-bold border rounded-lg disabled:opacity-50 transition-colors uppercase tracking-widest"
                style={{ color: 'var(--btn-secondary-text)', backgroundColor: 'var(--btn-secondary-bg)', borderColor: 'var(--btn-secondary-border)' }}
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}>
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-2xl h-full shadow-2xl overflow-y-auto"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <div className="sticky top-0 z-10 border-b p-6 flex items-center justify-between" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--brand-primary)' }}>
                    <Icon size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {selectedItem.hostname || selectedItem.name || selectedItem.softwareName || ((selectedItem.brand || selectedItem.model) ? `${selectedItem.brand || ''} ${selectedItem.model || ''}`.trim() : 'Detalhes do Ativo')}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{title.slice(0, -1)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => commentsRef.current?.scrollIntoView({ behavior: 'smooth' })}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:scale-105 active:scale-95 text-xs font-bold uppercase tracking-wider"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                    title="Adicionar Comentário/Observação"
                  >
                    <MessageSquare size={16} />
                    <span className="hidden sm:inline">Comentar</span>
                  </button>

                  {canEdit && (
                    <button 
                      onClick={() => {
                        setEditingItem(selectedItem);
                        if (collectionName === 'collaborators') {
                          setFormData({
                            ...selectedItem,
                            login_password: '',
                            email_password: '',
                            autodesk_credentials: ''
                          });
                        } else {
                          setFormData(selectedItem);
                        }
                        setActiveTab(0);
                        setIsModalOpen(true);
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:scale-105 active:scale-95 text-xs font-bold uppercase tracking-wider"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                      title="Editar Ativo"
                    >
                      <Edit2 size={16} />
                      <span className="hidden sm:inline">Editar</span>
                    </button>
                  )}

                  {canDelete && (
                    <button 
                      onClick={() => setItemToDelete(selectedItem)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:scale-105 active:scale-95 text-xs font-bold uppercase tracking-wider"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--status-error)' }}
                      title="Excluir Ativo"
                    >
                      <Trash2 size={16} />
                      <span className="hidden sm:inline">Excluir</span>
                    </button>
                  )}

                  <div className="w-px h-6 mx-2" style={{ backgroundColor: 'var(--border-color)' }} />

                  <button 
                    onClick={() => setSelectedItem(null)}
                    className="p-2 rounded-full transition-colors"
                    style={{ color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                {selectedItem.photoUrl && (
                  <div className="mb-8 rounded-3xl overflow-hidden border shadow-sm" style={{ borderColor: 'var(--border-color)' }}>
                    <img src={selectedItem.photoUrl} alt="Foto do ativo" className="w-full max-h-80 object-cover" referrerPolicy="no-referrer" />
                    <div className="px-4 py-2 flex items-center justify-between" style={{ backgroundColor: 'var(--bg-primary)' }}>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Foto do equipamento</span>
                      <a href={selectedItem.photoUrl} target="_blank" rel="noreferrer" className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--brand-primary)' }}>
                        Ampliar
                      </a>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  {columns.map(col => {
                    const val = selectedItem[col.key];
                    if (val === null || val === undefined || val === '') return null;
                    if (col.key === 'photoUrl') return null;
                    
                    const isSecret = col.key.toLowerCase().includes('password') || col.key === 'autodesk_credentials';
                    const prop = schema.properties[col.key];
                    
                    let displayVal = val;
                    if (prop?.$ref && val) {
                      const refItems = getReferencedData(prop.$ref);
                      const refItem = refItems.find(i => i.id === val);
                      if (refItem) {
                        if (prop.$ref === 'collaborator') displayVal = `${refItem.name} (${refItem.login})`;
                        else if (prop.$ref === 'machine') displayVal = refItem.hostname;
                        else displayVal = refItem.name || refItem.title || val;
                      }
                    }

                    return (
                      <div key={col.key} className="p-4 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                        <span className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-secondary)' }}>{col.label}</span>
                        <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {col.render ? col.render(val, selectedItem) : (
                            isSecret ? <SecretValue value={val} /> : (displayVal || '-')
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {collectionName === 'collaborators' && (
                  <div className="mt-8 border-t pt-8" style={{ borderColor: 'var(--border-color)' }}>
                    <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <Monitor className="w-4 h-4" />
                      Máquina Associada
                    </h3>
                    {(() => {
                      const machines = getReferencedData('machine');
                      const machine = machines.find(m => m.id === selectedItem.machine_id);
                      if (!machine) return (
                        <div className="p-4 rounded-2xl border border-dashed text-center" style={{ borderColor: 'var(--border-color)' }}>
                          <p className="text-sm italic" style={{ color: 'var(--text-secondary)' }}>Nenhuma máquina associada.</p>
                        </div>
                      );
                      
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {machine.hostname && (
                            <div className="p-4 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                              <span className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-secondary)' }}>Hostname</span>
                              <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                <Monitor className="w-4 h-4 opacity-50" />
                                <span className="font-medium truncate">{machine.hostname}</span>
                              </div>
                            </div>
                          )}
                          {machine.processor && (
                            <div className="p-4 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                              <span className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-secondary)' }}>Processador</span>
                              <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                <Cpu className="w-4 h-4 opacity-50" />
                                <span className="font-medium truncate">{machine.processor}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div ref={commentsRef}>
                  <CommentsSection 
                    entityId={selectedItem.id} 
                    entityType={collectionName as any} 
                    currentUserProfile={profile} 
                  />
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink)]/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <div className="px-8 py-6 border-b flex items-center justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {editingItem ? `Editar ${title.slice(0, -1)}` : `Adicionar Novo ${title.slice(0, -1)}`}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-full transition-all" style={{ color: 'var(--text-secondary)' }}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSave} className="flex flex-col h-full max-h-[85vh]">
                <div className="flex items-center gap-1 p-2 bg-[var(--bg-secondary)] border-b overflow-x-auto scrollbar-hide" style={{ borderColor: 'var(--border-color)' }}>
                  {sections.map((section, idx) => (
                    <button
                      key={section.title}
                      type="button"
                      onClick={() => setActiveTab(idx)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === idx ? 'bg-[var(--bg-primary)] shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                      style={{ color: activeTab === idx ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                    >
                      {section.icon}
                      {section.title}
                    </button>
                  ))}
                </div>

                <div className="flex-1 p-8 overflow-y-auto space-y-8">
                  {showJustification ? (
                      <div className="space-y-4 p-6 border rounded-3xl" style={{ backgroundColor: 'var(--status-cancelled-bg)', borderColor: 'var(--status-cancelled-text)' }}>
                      <h4 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--status-cancelled-text)' }}>
                        <AlertCircle size={20} />
                        Justificativa Necessária
                      </h4>
                      <p className="text-sm" style={{ color: 'var(--status-cancelled-text)' }}>
                        Você está realizando uma alteração em um campo crítico. Por favor, forneça uma justificativa para esta ação.
                      </p>
                      <textarea 
                        className="w-full px-4 py-3 border rounded-xl outline-none transition-all min-h-[100px]"
                        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                        placeholder="Descreva o motivo desta alteração..."
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        required
                      />
                      <div className="flex justify-end gap-3">
                        <button 
                          type="button"
                          onClick={() => setShowJustification(false)}
                          className="px-4 py-2 font-semibold"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Voltar
                        </button>
                        <button 
                          type="submit"
                          className="px-6 py-2 font-bold rounded-xl shadow-lg"
                          style={{ backgroundColor: 'var(--status-error)', color: 'white', boxShadow: '0 10px 15px -3px rgba(220, 38, 38, 0.2)' }}
                        >
                          Confirmar Alteração
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-8">
                        {sections.map((section, idx) => (
                          <div 
                            key={section.title} 
                            className={`space-y-6 transition-all ${activeTab === idx ? 'block' : 'hidden'}`}
                          >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {section.fields.map(fieldName => renderField(fieldName, schema.properties[fieldName]))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="px-8 py-6 border-t flex items-center justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                  <div>
                    {editingItem && canDelete && (
                      <button 
                        type="button"
                        onClick={() => setItemToDelete(editingItem)}
                        className="flex items-center gap-2 px-4 py-2.5 font-semibold rounded-xl transition-all"
                        style={{ color: 'var(--status-error)' }}
                      >
                        <Trash2 size={18} />
                        <span>Excluir Ativo</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-6 py-2.5 font-semibold rounded-xl transition-all"
                      style={{ color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="px-8 py-2.5 font-bold rounded-xl shadow-lg transition-all"
                      style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--bg-primary)' }}
                    >
                      {editingItem ? 'Atualizar Ativo' : 'Salvar Ativo'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[var(--ink)]/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setItemToDelete(null)}
              className="absolute inset-0"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative rounded-[32px] shadow-2xl w-full max-w-md p-8 text-center"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: 'var(--status-cancelled-bg)', color: 'var(--status-cancelled-text)' }}>
                <AlertCircle size={40} />
              </div>
              <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                {isSuperAdmin ? 'Opções de Exclusão' : 'Confirmar Exclusão'}
              </h3>
              <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
                {isSuperAdmin 
                  ? 'Como Super Admin, você pode desativar este registro (mantendo o histórico) ou excluí-lo permanentemente.'
                  : 'Tem certeza que deseja excluir este ativo?'}
              </p>
              <div className="flex flex-col gap-3">
                {isSuperAdmin && (
                  <button 
                    onClick={() => handleSoftDelete(itemToDelete.id)}
                    className="w-full px-6 py-3 font-bold rounded-2xl transition-all shadow-lg"
                    style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--bg-primary)' }}
                  >
                    Desativar (Soft Delete)
                  </button>
                )}
                <div className="flex gap-3">
                  <button 
                    onClick={() => setItemToDelete(null)}
                    className="flex-1 px-6 py-3 font-bold rounded-2xl transition-all"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => handleDelete(itemToDelete.id)}
                    className="flex-1 px-6 py-3 text-white font-bold rounded-2xl transition-all shadow-lg"
                    style={{ 
                      backgroundColor: 'var(--status-error)',
                      boxShadow: '0 10px 15px -3px rgba(220, 38, 38, 0.2)'
                    }}
                  >
                    {isSuperAdmin ? 'Excluir Permanente' : 'Excluir'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border"
            style={{ 
              backgroundColor: toast.type === 'success' ? 'rgb(5, 150, 105)' : 'rgb(220, 38, 38)',
              borderColor: toast.type === 'success' ? 'rgb(4, 120, 87)' : 'rgb(185, 28, 28)',
              color: 'white'
            }}
          >
            {toast.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
            <span className="font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
