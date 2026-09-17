import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { logAction } from '../utils/audit';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import {
  onlyDigits,
  formatCnpj,
  formatCep,
  fetchAddressByCep,
  checkCnpj,
  type CnpjCheck,
} from '../utils/brasilApi';
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  MapPin,
  Phone,
  Mail,
  User,
  FileText,
  Check,
  AlertCircle,
  Loader2,
  Users,
  Monitor,
  Server,
  Printer,
  PlugZap,
  Key,
  ShieldCheck,
  BadgeCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UnitForm {
  name: string;
  code: string;
  cnpj: string;
  razaoSocial: string;
  cnpjSituacao: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  responsible: string;
  notes: string;
  status: string;
}

const EMPTY_FORM: UnitForm = {
  name: '',
  code: '',
  cnpj: '',
  razaoSocial: '',
  cnpjSituacao: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  phone: '',
  email: '',
  responsible: '',
  notes: '',
  status: 'active',
};

const ASSET_GROUPS = [
  { key: 'collaborators', label: 'Colaboradores', icon: Users, path: '/collaborators' },
  { key: 'machines', label: 'Máquinas', icon: Monitor, path: '/machines' },
  { key: 'servers', label: 'Servidores', icon: Server, path: '/servers' },
  { key: 'printers', label: 'Impressoras', icon: Printer, path: '/printers' },
  { key: 'ups', label: 'Nobreaks', icon: PlugZap, path: '/ups' },
  { key: 'licenses', label: 'Licenças', icon: Key, path: '/licenses' },
];

export const Units: React.FC = () => {
  const { isSuperAdmin, canEdit, canDelete, profile } = useAuth();
  const { collaborators, machines, servers, printers, ups, licenses, units, loading } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [formData, setFormData] = useState<UnitForm>(EMPTY_FORM);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [cnpjChecking, setCnpjChecking] = useState(false);
  const [cnpjCheck, setCnpjCheck] = useState<CnpjCheck>({ status: 'idle', message: '' });
  const [lastCheckedCnpj, setLastCheckedCnpj] = useState('');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const countsByUnit = useMemo(() => {
    const all: Record<string, Record<string, any[]>> = {};
    const collections: Record<string, any[]> = { collaborators, machines, servers, printers, ups, licenses };
    units.forEach((u: any) => {
      all[u.name] = {};
      Object.entries(collections).forEach(([key, items]) => {
        all[u.name][key] = items.filter((i: any) => i.unit === u.name);
      });
    });
    return all;
  }, [units, collaborators, machines, servers, printers, ups, licenses]);

  const filteredUnits = units
    .filter((u: any) => {
      if (!showInactive && u.status === 'deactivated') return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (!searchTerm.trim()) return true;
      const s = searchTerm.toLowerCase();
      return [u.name, u.code, u.city, u.state, u.cnpj, u.razaoSocial, u.responsible]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(s));
    })
    .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

  const set = (patch: Partial<UnitForm>) => setFormData((prev) => ({ ...prev, ...patch }));

  const openNew = () => {
    setEditingUnit(null);
    setFormData(EMPTY_FORM);
    setCnpjCheck({ status: 'idle', message: '' });
    setLastCheckedCnpj('');
    setCepError(null);
    setIsModalOpen(true);
  };

  const openEdit = (unit: any) => {
    setEditingUnit(unit);
    setFormData({
      name: unit.name || '',
      code: unit.code || '',
      cnpj: unit.cnpj ? formatCnpj(unit.cnpj) : '',
      razaoSocial: unit.razaoSocial || '',
      cnpjSituacao: unit.cnpjSituacao || '',
      cep: unit.cep ? formatCep(unit.cep) : '',
      street: unit.street || '',
      number: unit.number || '',
      complement: unit.complement || '',
      neighborhood: unit.neighborhood || '',
      city: unit.city || '',
      state: unit.state || '',
      phone: unit.phone || '',
      email: unit.email || '',
      responsible: unit.responsible || '',
      notes: unit.notes || '',
      status: unit.status || 'active',
    });
    const digits = onlyDigits(unit.cnpj || '');
    if (digits.length === 14) {
      setCnpjCheck({
        status: 'valid',
        message: unit.razaoSocial
          ? `${unit.razaoSocial} • Situação: ${unit.cnpjSituacao || '—'}`
          : 'CNPJ verificado anteriormente. Clique em Validar para reconfirmar.',
      });
      setLastCheckedCnpj(digits);
    } else {
      setCnpjCheck({ status: 'idle', message: '' });
      setLastCheckedCnpj('');
    }
    setCepError(null);
    setIsModalOpen(true);
  };

  const handleCepSearch = async () => {
    const clean = onlyDigits(formData.cep);
    if (clean.length !== 8) {
      setCepError('Informe um CEP com 8 dígitos.');
      return;
    }
    setCepLoading(true);
    setCepError(null);
    try {
      const addr = await fetchAddressByCep(clean);
      set({
        cep: formatCep(addr.cep),
        street: formData.street || addr.street,
        neighborhood: formData.neighborhood || addr.neighborhood,
        city: addr.city || formData.city,
        state: addr.state || formData.state,
      });
      showToast('Endereço preenchido via Brasil API.', 'success');
    } catch {
      setCepError('CEP não encontrado. Verifique o número ou preencha manualmente.');
    } finally {
      setCepLoading(false);
    }
  };

  const handleCnpjValidate = async (): Promise<CnpjCheck> => {
    const clean = onlyDigits(formData.cnpj);
    setCnpjChecking(true);
    try {
      const result = await checkCnpj(clean);
      setCnpjCheck(result);
      setLastCheckedCnpj(clean);
      if (result.status === 'valid' && result.data) {
        if (!formData.razaoSocial && result.data.razaoSocial) set({ razaoSocial: result.data.razaoSocial });
        if (result.data.situacaoCadastral) set({ cnpjSituacao: result.data.situacaoCadastral });
      }
      return result;
    } finally {
      setCnpjChecking(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Informe o nome da unidade.', 'error');
      return;
    }

    const cnpjDigits = onlyDigits(formData.cnpj);
    if (cnpjDigits) {
      let check = cnpjCheck;
      if (lastCheckedCnpj !== cnpjDigits) {
        check = await handleCnpjValidate();
      }
      if (check.status === 'invalid') {
        showToast('CNPJ inválido. Corrija o número antes de salvar.', 'error');
        return;
      }
    }

    const duplicate = units.find(
      (u: any) =>
        u.name.trim().toLowerCase() === formData.name.trim().toLowerCase() &&
        (!editingUnit || u.id !== editingUnit.id)
    );
    if (duplicate) {
      showToast('Já existe uma unidade com este nome.', 'error');
      return;
    }

    const payload = {
      ...formData,
      name: formData.name.trim(),
      cnpj: cnpjDigits || '',
      cep: onlyDigits(formData.cep) || '',
      state: formData.state.toUpperCase(),
    };

    try {
      if (editingUnit) {
        const { id, ...updateData } = { ...payload, id: editingUnit.id };
        void id;
        await updateDoc(doc(db, 'units', editingUnit.id), updateData);
        await logAction('update', 'units', editingUnit.id, editingUnit, updateData, `Updated unit ${payload.name}`);
        showToast('Unidade atualizada com sucesso!', 'success');
      } else {
        const docRef = await addDoc(collection(db, 'units'), payload);
        await logAction('create', 'units', docRef.id, null, payload, `Created unit ${payload.name}`);
        showToast('Unidade criada com sucesso!', 'success');
      }
      setIsModalOpen(false);
      setEditingUnit(null);
      setFormData(EMPTY_FORM);
      if (cnpjDigits && cnpjCheck.status === 'offline') {
        showToast('Unidade salva, mas o CNPJ não pôde ser confirmado (API fora do ar).', 'error');
      }
    } catch (error) {
      console.error('Error saving unit:', error);
      showToast('Erro ao salvar unidade.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const unit = units.find((u: any) => u.id === id);
      if (!unit) return;
      await deleteDoc(doc(db, 'units', id));
      await logAction('delete', 'units', id, unit, null, `Deleted unit ${unit.name} permanently`, '', 'high');
      showToast('Unidade excluída permanentemente!', 'success');
      setItemToDelete(null);
      setSelectedUnit(null);
    } catch (error) {
      console.error('Error deleting unit:', error);
      showToast('Erro ao excluir unidade.', 'error');
    }
  };

  const handleSoftDelete = async (id: string) => {
    if (!isSuperAdmin) return;
    try {
      const unit = units.find((u: any) => u.id === id);
      if (!unit) return;
      await updateDoc(doc(db, 'units', id), { status: 'deactivated' });
      await logAction('update', 'units', id, unit, { ...unit, status: 'deactivated' }, `Inactivated unit ${unit.name}`, '', 'medium');
      showToast('Unidade desativada com sucesso!', 'success');
      setItemToDelete(null);
    } catch (error) {
      console.error('Error inactivating unit:', error);
      showToast('Erro ao desativar unidade.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--bg-secondary)', borderTopColor: 'var(--accent-primary)' }} />
      </div>
    );
  }

  const inputCls = 'w-full px-4 py-2.5 border rounded-xl focus:ring-2 transition-all outline-none focus:ring-accent-primary/20 focus:border-accent-primary';
  const inputStyle = { backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' } as const;
  const labelCls = 'text-sm font-semibold';
  const labelStyle = { color: 'var(--text-primary)' } as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--bg-primary)' }}>
            <Building2 size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Unidades</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{units.length} registros</p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all shadow-sm font-bold text-xs uppercase tracking-widest"
            style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--bg-primary)' }}
          >
            <Plus size={16} />
            <span>Nova Unidade</span>
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
        <div className="p-3 border-b flex flex-col md:flex-row items-center gap-3" style={{ borderColor: 'var(--border-color)' }}>
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Pesquisar por nome, cidade, CNPJ, responsável..."
              className="w-full pl-9 pr-4 py-2 border rounded-lg outline-none text-sm"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs font-bold uppercase tracking-wider border rounded-lg px-3 py-2 outline-none"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
              <option value="deactivated">Desativadas</option>
            </select>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all"
              style={{
                backgroundColor: showInactive ? 'var(--brand-primary)' : 'var(--bg-primary)',
                color: showInactive ? 'var(--bg-primary)' : 'var(--text-secondary)',
                borderColor: showInactive ? 'var(--brand-primary)' : 'var(--border-color)',
              }}
            >
              Desativadas
            </button>
          </div>
        </div>

        {/* Cards */}
        {filteredUnits.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 size={32} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-secondary)' }} />
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Nenhuma unidade encontrada</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Cadastre a primeira unidade para organizar colaboradores e ativos por localidade.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {filteredUnits.map((unit: any) => {
              const counts = countsByUnit[unit.name] || {};
              const total = ASSET_GROUPS.reduce((acc, g) => acc + (counts[g.key]?.length || 0), 0);
              return (
                <div
                  key={unit.id}
                  className="rounded-3xl border shadow-sm p-5 space-y-4 transition-all hover:shadow-md cursor-pointer"
                  style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
                  onClick={() => setSelectedUnit(unit)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--brand-primary)' }}>
                        <Building2 size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold truncate" style={{ color: 'var(--text-primary)' }}>{unit.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                          {[unit.code, unit.city && unit.state ? `${unit.city}/${unit.state}` : unit.city || unit.state].filter(Boolean).join(' • ') || '—'}
                        </p>
                      </div>
                    </div>
                    <span
                      className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase flex-shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        color: unit.status === 'active' ? 'var(--status-success)' : unit.status === 'deactivated' ? 'var(--status-cancelled-text)' : 'var(--status-warning)',
                      }}
                    >
                      {unit.status === 'active' ? 'Ativa' : unit.status === 'deactivated' ? 'Desativada' : 'Inativa'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {unit.cnpj ? (
                      <>
                        <BadgeCheck size={14} className="flex-shrink-0" style={{ color: 'var(--status-success)' }} />
                        <span className="font-mono truncate">{formatCnpj(unit.cnpj)}</span>
                      </>
                    ) : (
                      <span className="italic opacity-60">CNPJ não informado</span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {ASSET_GROUPS.map((g) => (
                      <div key={g.key} className="rounded-xl border p-2 text-center" style={{ borderColor: 'var(--bg-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                        <g.icon size={14} className="mx-auto mb-1" style={{ color: 'var(--text-secondary)' }} />
                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{counts[g.key]?.length || 0}</p>
                        <p className="text-[8px] font-bold uppercase tracking-wider truncate" style={{ color: 'var(--text-secondary)' }}>{g.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{total} vínculos</span>
                    {canEdit && (
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => openEdit(unit)} className="p-2 rounded-xl transition-all" style={{ color: 'var(--text-secondary)' }} title="Editar">
                          <Edit2 size={15} />
                        </button>
                        {canDelete && (
                          <button onClick={() => setItemToDelete(unit)} className="p-2 rounded-xl transition-all hover:bg-red-500/10" style={{ color: 'var(--text-secondary)' }} title="Excluir">
                            <Trash2 size={15} className="hover:text-red-500" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {selectedUnit && (
          <div className="fixed inset-0 z-50 flex items-center justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setSelectedUnit(null)}>
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-2xl h-full shadow-2xl overflow-y-auto"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 border-b p-6 flex items-center justify-between" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--brand-primary)' }}>
                    <Building2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{selectedUnit.name}</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Unidade</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <button
                      onClick={() => { openEdit(selectedUnit); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                    >
                      <Edit2 size={16} />
                      <span className="hidden sm:inline">Editar</span>
                    </button>
                  )}
                  <button onClick={() => setSelectedUnit(null)} className="p-2 rounded-full" style={{ color: 'var(--text-secondary)' }}>
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Empresa */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: 'CNPJ', value: selectedUnit.cnpj ? formatCnpj(selectedUnit.cnpj) : null, mono: true },
                    { label: 'Razão Social', value: selectedUnit.razaoSocial },
                    { label: 'Situação Cadastral', value: selectedUnit.cnpjSituacao },
                    { label: 'Código/Sigla', value: selectedUnit.code },
                  ].map((f) =>
                    f.value ? (
                      <div key={f.label} className="p-4 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                        <span className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
                        <div className={f.mono ? 'font-mono font-medium' : 'font-medium'} style={{ color: 'var(--text-primary)' }}>{f.value}</div>
                      </div>
                    ) : null
                  )}
                </div>

                {/* Endereço */}
                {(selectedUnit.street || selectedUnit.city) && (
                  <div className="p-4 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                    <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 mb-2" style={{ color: 'var(--text-secondary)' }}>
                      <MapPin size={14} /> Endereço
                    </span>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {[selectedUnit.street && `${selectedUnit.street}${selectedUnit.number ? `, ${selectedUnit.number}` : ''}`,
                        selectedUnit.complement,
                        selectedUnit.neighborhood,
                        selectedUnit.city && selectedUnit.state ? `${selectedUnit.city}/${selectedUnit.state}` : selectedUnit.city,
                        selectedUnit.cep ? `CEP ${formatCep(selectedUnit.cep)}` : null].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                )}

                {/* Contato */}
                {(selectedUnit.responsible || selectedUnit.phone || selectedUnit.email) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedUnit.responsible && (
                      <div className="p-4 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                        <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 mb-1" style={{ color: 'var(--text-secondary)' }}><User size={14} /> Responsável</span>
                        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedUnit.responsible}</div>
                      </div>
                    )}
                    {selectedUnit.phone && (
                      <div className="p-4 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                        <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 mb-1" style={{ color: 'var(--text-secondary)' }}><Phone size={14} /> Telefone</span>
                        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedUnit.phone}</div>
                      </div>
                    )}
                    {selectedUnit.email && (
                      <div className="p-4 rounded-2xl border shadow-sm sm:col-span-2" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                        <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 mb-1" style={{ color: 'var(--text-secondary)' }}><Mail size={14} /> E-mail</span>
                        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedUnit.email}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Vínculos */}
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>Colaboradores e ativos vinculados</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ASSET_GROUPS.map((g) => {
                      const items = (countsByUnit[selectedUnit.name] || {})[g.key] || [];
                      return (
                        <Link
                          key={g.key}
                          to={`${g.path}?unit=${encodeURIComponent(selectedUnit.name)}`}
                          className="flex items-center justify-between p-4 rounded-2xl border shadow-sm transition-all hover:shadow-md"
                          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
                        >
                          <div className="flex items-center gap-3">
                            <g.icon size={18} style={{ color: 'var(--brand-primary)' }} />
                            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{g.label}</span>
                          </div>
                          <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                            {items.length}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Form modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink)]/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <div className="px-8 py-6 border-b flex items-center justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {editingUnit ? 'Editar Unidade' : 'Nova Unidade'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-full" style={{ color: 'var(--text-secondary)' }}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-8 overflow-y-auto max-h-[75vh]">
                {/* Identificação */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <ShieldCheck size={14} /> Identificação
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className={labelCls} style={labelStyle}>Nome da Unidade <span className="text-red-500">*</span></label>
                      <input className={inputCls} style={inputStyle} value={formData.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex: Matriz São Paulo" required />
                    </div>
                    <div className="space-y-2">
                      <label className={labelCls} style={labelStyle}>Código/Sigla</label>
                      <input className={inputCls} style={inputStyle} value={formData.code} onChange={(e) => set({ code: e.target.value })} placeholder="Ex: SP-01" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className={labelCls} style={labelStyle}>CNPJ</label>
                      <div className="flex gap-2">
                        <input
                          className={inputCls}
                          style={{ ...inputStyle, fontFamily: 'monospace' }}
                          value={formData.cnpj}
                          onChange={(e) => {
                            set({ cnpj: formatCnpj(e.target.value) });
                            setCnpjCheck({ status: 'idle', message: '' });
                          }}
                          onBlur={() => { if (onlyDigits(formData.cnpj).length === 14) handleCnpjValidate(); }}
                          placeholder="00.000.000/0001-91"
                          inputMode="numeric"
                        />
                        <button
                          type="button"
                          disabled={cnpjChecking || onlyDigits(formData.cnpj).length !== 14}
                          onClick={handleCnpjValidate}
                          className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 flex-shrink-0 disabled:opacity-50"
                          style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--bg-primary)' }}
                        >
                          {cnpjChecking ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                          Validar
                        </button>
                      </div>
                      {cnpjCheck.status !== 'idle' && (
                        <p
                          className="text-[11px] font-bold flex items-center gap-1.5"
                          style={{
                            color:
                              cnpjCheck.status === 'valid'
                                ? 'var(--status-success)'
                                : cnpjCheck.status === 'offline'
                                  ? 'var(--status-warning)'
                                  : 'var(--status-error)',
                          }}
                        >
                          {cnpjCheck.status === 'valid' ? <Check size={13} /> : <AlertCircle size={13} />}
                          {cnpjCheck.status === 'valid' ? `CNPJ válido — ${cnpjCheck.message}` : cnpjCheck.message}
                        </p>
                      )}
                      <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>A validação consulta a base da Receita via Brasil API (dígitos + existência + situação cadastral).</p>
                    </div>
                    <div className="space-y-2">
                      <label className={labelCls} style={labelStyle}>Razão Social</label>
                      <input className={inputCls} style={inputStyle} value={formData.razaoSocial} onChange={(e) => set({ razaoSocial: e.target.value })} placeholder="Preenchido pela validação do CNPJ" />
                    </div>
                    <div className="space-y-2">
                      <label className={labelCls} style={labelStyle}>Status <span className="text-red-500">*</span></label>
                      <select className={inputCls} style={inputStyle} value={formData.status} onChange={(e) => set({ status: e.target.value })} required>
                        <option value="active">Ativa</option>
                        <option value="inactive">Inativa</option>
                        {(isSuperAdmin || profile?.role === 'admin') && <option value="deactivated">Desativada</option>}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Endereço */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <MapPin size={14} /> Endereço (preenchimento por CEP)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className={labelCls} style={labelStyle}>CEP</label>
                      <div className="flex gap-2">
                        <input
                          className={inputCls}
                          style={{ ...inputStyle, fontFamily: 'monospace' }}
                          value={formData.cep}
                          onChange={(e) => { set({ cep: formatCep(e.target.value) }); setCepError(null); }}
                          onBlur={() => { if (onlyDigits(formData.cep).length === 8) handleCepSearch(); }}
                          placeholder="00000-000"
                          inputMode="numeric"
                        />
                        <button
                          type="button"
                          disabled={cepLoading || onlyDigits(formData.cep).length !== 8}
                          onClick={handleCepSearch}
                          className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 flex-shrink-0 disabled:opacity-50"
                          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                        >
                          {cepLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                          Buscar
                        </button>
                      </div>
                      {cepError && <p className="text-[11px] font-bold" style={{ color: 'var(--status-error)' }}>{cepError}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className={labelCls} style={labelStyle}>Logradouro</label>
                      <input className={inputCls} style={inputStyle} value={formData.street} onChange={(e) => set({ street: e.target.value })} placeholder="Rua / Avenida" />
                    </div>
                    <div className="space-y-2">
                      <label className={labelCls} style={labelStyle}>Número</label>
                      <input className={inputCls} style={inputStyle} value={formData.number} onChange={(e) => set({ number: e.target.value })} placeholder="123" />
                    </div>
                    <div className="space-y-2">
                      <label className={labelCls} style={labelStyle}>Complemento</label>
                      <input className={inputCls} style={inputStyle} value={formData.complement} onChange={(e) => set({ complement: e.target.value })} placeholder="Sala, bloco..." />
                    </div>
                    <div className="space-y-2">
                      <label className={labelCls} style={labelStyle}>Bairro</label>
                      <input className={inputCls} style={inputStyle} value={formData.neighborhood} onChange={(e) => set({ neighborhood: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2 col-span-2">
                        <label className={labelCls} style={labelStyle}>Cidade</label>
                        <input className={inputCls} style={inputStyle} value={formData.city} onChange={(e) => set({ city: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <label className={labelCls} style={labelStyle}>UF</label>
                        <input className={inputCls} style={{ ...inputStyle, textTransform: 'uppercase' }} value={formData.state} onChange={(e) => set({ state: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contato */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <User size={14} /> Contato e observações
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className={labelCls} style={labelStyle}>Responsável</label>
                      <input className={inputCls} style={inputStyle} value={formData.responsible} onChange={(e) => set({ responsible: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className={labelCls} style={labelStyle}>Telefone</label>
                      <input className={inputCls} style={inputStyle} value={formData.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(11) 3000-0000" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className={labelCls} style={labelStyle}>E-mail</label>
                      <input type="email" className={inputCls} style={inputStyle} value={formData.email} onChange={(e) => set({ email: e.target.value })} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className={labelCls} style={labelStyle}>Observações</label>
                      <textarea className={`${inputCls} min-h-[80px]`} style={inputStyle} value={formData.notes} onChange={(e) => set({ notes: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 font-semibold rounded-xl" style={{ color: 'var(--text-secondary)' }}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-2.5 font-bold rounded-xl shadow-lg flex items-center gap-2"
                    style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--bg-primary)' }}
                  >
                    <FileText size={16} />
                    {editingUnit ? 'Atualizar Unidade' : 'Salvar Unidade'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[var(--ink)]/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setItemToDelete(null)} className="absolute inset-0" />
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
                  ? 'Como Super Admin, você pode desativar esta unidade (mantendo o histórico) ou excluí-la permanentemente.'
                  : 'Tem certeza que deseja excluir esta unidade?'}
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
                    style={{ backgroundColor: 'var(--status-error)' }}
                  >
                    {isSuperAdmin ? 'Excluir Permanente' : 'Excluir'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
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
              color: 'white',
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
