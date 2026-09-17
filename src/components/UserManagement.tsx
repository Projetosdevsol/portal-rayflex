import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, query, orderBy, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth, formatDate } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { logAction } from '../utils/audit';
import { getInitials } from '../utils/format';
import { AVAILABLE_PERMISSIONS } from '../constants';
import { 
  Users, 
  Shield, 
  User as UserIcon, 
  ShieldCheck, 
  Eye, 
  Edit,
  Search,
  MoreVertical,
  Plus,
  X,
  Trash2,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  Check,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DoubleScrollContainer } from './DoubleScrollContainer';
import { UserProfile, UserRole } from '../types';
import { CommentsSection } from './CommentsSection';

const roleHierarchy: Record<string, number> = {
  'super_admin': 100,
  'admin': 80,
  'manager': 60,
  'editor': 40,
  'viewer': 20
};

export const UserManagement: React.FC = () => {
  const { isSuperAdmin, profile, loading: authLoading } = useAuth();
  const isAdminOrSuperAdmin = isSuperAdmin || profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const canManageUsers = isAdminOrSuperAdmin;
  const canViewUsers = isAdminOrSuperAdmin || isManager;

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string>('displayName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [showErrors, setShowErrors] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);
  const [showRoleInfo, setShowRoleInfo] = useState(false);
  const [clearDataPassword, setClearDataPassword] = useState('');
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [isClearing, setIsClearing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    sector: '',
    role: 'viewer' as UserRole,
    permissions: [] as string[]
  });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const evaluatePasswordStrength = (password: string) => {
    let score = 0;
    if (!password) return { score: 0, label: '', color: 'transparent' };
    
    if (password.length >= 6) score += 1;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score <= 2) return { score, label: 'Fraca', color: 'var(--status-cancelled-text)' };
    if (score === 3 || score === 4) return { score, label: 'Razoável', color: 'var(--status-warning)' };
    return { score, label: 'Forte', color: 'var(--status-success)' };
  };

  const passwordStrength = evaluatePasswordStrength(formData.password);

  const fetchUsers = async () => {
    if (authLoading || !auth.currentUser) return;
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao buscar usuários');
      }
      const data = await response.json();
      setUsers(data);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [authLoading]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!isAdminOrSuperAdmin) return;
    
    const user = users.find(u => u.uid === userId);
    if (!user) return;

    const currentUserRole = profile?.role || 'viewer';
    if (roleHierarchy[newRole] > roleHierarchy[currentUserRole]) {
      showToast('Você não pode atribuir um nível de acesso maior que o seu.', 'error');
      return;
    }
    if (roleHierarchy[user.role] > roleHierarchy[currentUserRole]) {
      showToast('Você não pode alterar o nível de acesso de um usuário com nível maior que o seu.', 'error');
      return;
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao atualizar nível de acesso');
      }

      await fetchUsers();
    } catch (error: any) {
      console.error('Error updating user role:', error);
      showToast(error.message, 'error');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!isAdminOrSuperAdmin) return;
    if (!window.confirm('Tem certeza que deseja excluir este usuário do sistema e do Firebase Authentication?')) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao excluir usuário');
      }

      await fetchUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      showToast(error.message, 'error');
    }
  };

  const openEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({
      name: user.displayName || '',
      email: user.email || '',
      password: '', // Leave blank for edit
      sector: user.sector || '',
      role: user.role || 'viewer',
      permissions: user.permissions || []
    });
    setIsModalOpen(true);
  };

  const handleCreateOrEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    setFormError('');
    
    // Basic validation
    if (!formData.name || !formData.email || (!editingUser && !formData.password) || !formData.role) {
      setFormError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setIsSubmitting(true);

    const currentUserRole = profile?.role || 'viewer';
    if (roleHierarchy[formData.role] > roleHierarchy[currentUserRole]) {
      setFormError('Você não pode atribuir um nível de acesso maior que o seu.');
      setIsSubmitting(false);
      return;
    }

    if (!editingUser && formData.password.length < 6) {
      setFormError('A senha deve ter pelo menos 6 caracteres.');
      setIsSubmitting(false);
      return;
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      const url = editingUser ? `/api/users/${editingUser.uid}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';
      
      const payload = { ...formData };
      if (editingUser && !payload.password) {
        delete (payload as any).password;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Erro ao ${editingUser ? 'editar' : 'criar'} usuário`);
      }

      await fetchUsers();
      setIsModalOpen(false);
      setEditingUser(null);
      setFormData({ name: '', email: '', password: '', sector: '', role: 'viewer', permissions: [] });
      setShowErrors(false);
    } catch (error: any) {
      setFormError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearData = async () => {
    if (!clearDataPassword || selectedCollections.length === 0) return;
    
    setIsClearing(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/clear-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          password: clearDataPassword,
          collections: selectedCollections
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao limpar dados');
      }

      setIsClearDataModalOpen(false);
      setClearDataPassword('');
      setSelectedCollections([]);
      showToast('Dados limpos com sucesso!', 'success');
    } catch (error: any) {
      console.error('Error clearing data:', error);
      showToast(error.message, 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const filteredUsers = users
    .filter(user => {
      const searchStr = searchTerm.toLowerCase();
      return !searchStr ||
             (user.displayName?.toLowerCase() || '').includes(searchStr) ||
             (user.email?.toLowerCase() || '').includes(searchStr) ||
             (user.sector?.toLowerCase() || '').includes(searchStr) ||
             (getRoleLabel(user.role).toLowerCase() || '').includes(searchStr);
    })
    .sort((a: any, b: any) => {
      const valA = String(a[sortField] || '').toLowerCase();
      const valB = String(b[sortField] || '').toLowerCase();
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'super_admin': return <ShieldCheck style={{ color: 'var(--status-cancelled-text)' }} size={18} />;
      case 'admin': return <Shield style={{ color: 'var(--status-warning)' }} size={18} />;
      case 'manager': return <Users style={{ color: 'var(--status-info)' }} size={18} />;
      case 'editor': return <Edit style={{ color: 'var(--accent-primary)' }} size={18} />;
      case 'viewer': return <Eye style={{ color: 'var(--text-secondary)' }} size={18} />;
      default: return <UserIcon style={{ color: 'var(--text-secondary)' }} size={18} />;
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Admin';
      case 'manager': return 'Gestor';
      case 'editor': return 'Editor';
      case 'viewer': return 'Visualizador';
      default: return role;
    }
  };

  const getRoleDescription = (role: UserRole) => {
    switch (role) {
      case 'super_admin': return 'Acesso total ao sistema, incluindo configurações avançadas, exclusão de registros e gestão de todos os usuários.';
      case 'admin': return 'Acesso administrativo completo, gestão de usuários e configurações do sistema.';
      case 'manager': return 'Gestão de colaboradores, máquinas e licenças. Pode visualizar relatórios de auditoria.';
      case 'editor': return 'Pode adicionar e editar registros de colaboradores, máquinas e licenças. Não pode excluir.';
      case 'viewer': return 'Acesso apenas para visualização dos dados. Não pode fazer alterações.';
      default: return 'Sem descrição disponível.';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--bg-secondary)', borderTopColor: 'var(--accent-primary)' }} />
      </div>
    );
  }

  if (!canViewUsers) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <Shield className="w-16 h-16 opacity-20 mb-4" style={{ color: 'var(--text-secondary)' }} />
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Acesso Restrito</h2>
        <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>Apenas Administradores e Gestores podem acessar a gestão de usuários.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Gestão de Usuários</h2>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Gerencie permissões e níveis de acesso dos colaboradores.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRoleInfo(!showRoleInfo)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors border font-bold text-sm"
            style={{ 
              backgroundColor: showRoleInfo ? 'var(--bg-secondary)' : 'var(--bg-primary)', 
              borderColor: 'var(--border-color)', 
              color: 'var(--text-primary)' 
            }}
            title="Informações sobre Níveis de Acesso"
          >
            <Info size={18} className="text-[var(--accent-primary)]" />
            <span className="hidden sm:inline">Níveis de Acesso</span>
            {showRoleInfo ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button 
            onClick={fetchUsers}
            disabled={loading}
            className="p-2.5 rounded-xl transition-colors border"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            title="Sincronizar com Firebase Auth"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          {canManageUsers && (
            <button 
              onClick={() => {
                setEditingUser(null);
                setFormData({ name: '', email: '', password: '', sector: '', role: 'viewer', permissions: [] });
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 text-[var(--bg-primary)] bg-[var(--brand-primary)] rounded-xl hover:opacity-90 transition-colors font-bold shadow-md"
            >
              <Plus size={18} />
              Novo Usuário
            </button>
          )}
        </div>
      </header>

      <AnimatePresence>
        {showRoleInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6 rounded-3xl border shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--accent-primary)' }}>
                  <Info size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Entendendo os Níveis de Acesso</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>O sistema utiliza um modelo de permissões baseado em funções (RBAC) para garantir a segurança e integridade dos dados.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { role: 'super_admin', label: 'Super Admin', icon: ShieldCheck, color: 'var(--status-cancelled-text)', desc: 'Acesso irrestrito. Pode criar/excluir outros administradores, acessar configurações avançadas, limpar dados do sistema e visualizar relatórios de auditoria.' },
                  { role: 'admin', label: 'Administrador', icon: Shield, color: 'var(--status-warning)', desc: 'Gestão completa do sistema. Pode gerenciar usuários (exceto Super Admins), ativos, licenças e configurações gerais.' },
                  { role: 'manager', label: 'Gestor', icon: Users, color: 'var(--status-info)', desc: 'Foco em gestão de equipes e ativos. Pode gerenciar colaboradores, máquinas e licenças, mas não tem acesso à gestão de usuários ou configurações.' },
                  { role: 'editor', label: 'Editor', icon: Edit, color: 'var(--accent-primary)', desc: 'Foco operacional. Pode adicionar e editar registros de ativos e colaboradores, mas não tem permissão para excluí-los.' },
                  { role: 'viewer', label: 'Visualizador', icon: Eye, color: 'var(--text-secondary)', desc: 'Acesso de leitura. Pode apenas visualizar os dados do sistema, sem permissão para qualquer tipo de alteração.' }
                ].map((item, index) => (
                  <div key={index} className="p-4 rounded-2xl border transition-colors hover:bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border-color)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <item.icon size={18} style={{ color: item.color }} />
                      <span className="font-bold text-sm uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-3xl shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar usuários..."
              className="w-full pl-10 pr-10 py-2 rounded-xl focus:ring-2 focus:ring-[var(--brand-primary)]/10 transition-all outline-none text-sm placeholder:text-[var(--text-secondary)]"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
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
          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {filteredUsers.length} usuários encontrados
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block">
          <DoubleScrollContainer>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  {[
                    { key: 'displayName', label: 'Usuário' },
                    { key: 'email', label: 'E-mail' },
                    { key: 'sector', label: 'Setor' },
                    { key: 'lastSignInTime', label: 'Último Acesso' },
                    { key: 'role', label: 'Nível' }
                  ].map(col => (
                    <th 
                      key={col.key} 
                      className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-colors group/th"
                      style={{ color: 'var(--text-secondary)' }}
                      onClick={() => toggleSort(col.key)}
                    >
                      <div className="flex items-center gap-2">
                        {col.label}
                        <div className="flex flex-col opacity-0 group-hover/th:opacity-100 transition-opacity">
                          {sortField === col.key ? (
                            sortOrder === 'asc' ? <ChevronUp size={10} className="text-[var(--accent-primary)]" /> : <ChevronDown size={10} className="text-[var(--accent-primary)]" />
                          ) : (
                            <ArrowUpDown size={10} className="opacity-30" style={{ color: 'var(--text-secondary)' }} />
                          )}
                        </div>
                      </div>
                    </th>
                  ))}
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {paginatedUsers.map((user) => (
                  <tr key={user.uid} className="transition-colors group hover:bg-[var(--bg-secondary)]/30">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                          {getInitials(user.displayName)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{user.displayName}</span>
                          {user.existsInFirestore === false && (
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-tighter" style={{ color: 'var(--status-warning)' }}>
                              <AlertCircle size={10} />
                              Não sincronizado
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{user.email}</td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>{user.sector || '-'}</td>
                    <td className="px-6 py-4">
                      {user.lastSignInTime ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                            {new Date(user.lastSignInTime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                          <span className="text-[9px] opacity-40 font-mono uppercase" style={{ color: 'var(--text-secondary)' }}>
                            Via Auth
                          </span>
                        </div>
                      ) : user.loginHistory && user.loginHistory.length > 0 ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                            {formatDate(user.loginHistory[user.loginHistory.length - 1].timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                          <span className="text-[9px] opacity-40 font-mono" style={{ color: 'var(--text-secondary)' }}>
                            IP: {user.loginHistory[user.loginHistory.length - 1].ipAddress}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs opacity-40 italic" style={{ color: 'var(--text-secondary)' }}>Nenhum registro</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div 
                        className="flex items-center gap-2 px-2.5 py-1 rounded-full w-fit cursor-help" 
                        style={{ backgroundColor: 'var(--bg-secondary)' }}
                        title={getRoleDescription(user.role)}
                      >
                        {getRoleIcon(user.role)}
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                          {getRoleLabel(user.role)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setSelectedUser(user)}
                          className="p-1.5 opacity-40 hover:opacity-100 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors"
                          style={{ color: 'var(--text-secondary)' }}
                          title="Ver Observações"
                        >
                          <MessageSquare size={16} />
                        </button>
                        {canManageUsers && (
                          <>
                            {user.existsInFirestore === false ? (
                              <button 
                                onClick={() => handleRoleChange(user.uid, 'viewer')}
                                className="text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors uppercase"
                                style={{ backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning-text)' }}
                                title="Criar perfil no Firestore"
                              >
                                Sincronizar
                              </button>
                            ) : (
                              <select 
                                className="text-[10px] font-bold text-[var(--accent-primary)] bg-[var(--bg-secondary)] px-2 py-1 rounded-lg border-none focus:ring-1 focus:ring-[var(--accent-primary)]/20 outline-none cursor-pointer uppercase"
                                value={user.role}
                                onChange={(e) => handleRoleChange(user.uid, e.target.value as UserRole)}
                              >
                                <option value="viewer">Visualizador</option>
                                <option value="editor">Editor</option>
                                <option value="manager">Gestor</option>
                                <option value="admin">Admin</option>
                                <option value="super_admin">Super Admin</option>
                              </select>
                            )}
                            <button 
                              onClick={() => openEditModal(user)}
                              className="p-1.5 opacity-40 hover:opacity-100 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors"
                              style={{ color: 'var(--text-secondary)' }}
                              title="Editar Usuário"
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteUser(user.uid)}
                              className="p-1.5 opacity-40 hover:opacity-100 rounded-lg transition-colors"
                              style={{ backgroundColor: 'transparent', color: 'var(--text-secondary)' }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--status-cancelled-bg)'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              title="Excluir Usuário"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DoubleScrollContainer>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden divide-y" style={{ borderColor: 'var(--border-color)' }}>
          {filteredUsers.map((user) => (
            <div key={user.uid} className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                    {getInitials(user.displayName)}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{user.displayName}</h4>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{user.email}</p>
                  </div>
                </div>
                <div 
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full cursor-help" 
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                  title={getRoleDescription(user.role)}
                >
                  {getRoleIcon(user.role)}
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    {getRoleLabel(user.role)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 py-3 border-y" style={{ borderColor: 'var(--border-color)' }}>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--text-secondary)' }}>Setor</span>
                  <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{user.sector || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--text-secondary)' }}>Último Acesso</span>
                  <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                    {user.lastSignInTime 
                      ? new Date(user.lastSignInTime).toLocaleDateString('pt-BR')
                      : 'Nenhum registro'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button 
                  onClick={() => setSelectedUser(user)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <MessageSquare size={14} />
                  Notas
                </button>
                {canManageUsers && (
                  <>
                    <button 
                      onClick={() => openEditModal(user)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border"
                      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <Edit size={14} />
                      Editar
                    </button>
                    <button 
                      onClick={() => handleDeleteUser(user.uid)}
                      className="p-1.5 rounded-lg transition-colors border"
                      style={{ 
                        backgroundColor: 'var(--status-cancelled-bg)', 
                        color: 'var(--status-cancelled-text)',
                        borderColor: 'color-mix(in srgb, var(--status-cancelled-text), transparent 80%)'
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t flex items-center justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-primary)' }}>{(currentPage - 1) * itemsPerPage + 1}</span> - <span style={{ color: 'var(--text-primary)' }}>{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> de <span style={{ color: 'var(--text-primary)' }}>{filteredUsers.length}</span>
            </p>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-[10px] font-bold rounded-lg disabled:opacity-50 transition-colors uppercase tracking-widest"
                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
              >
                Anterior
              </button>
              <div className="flex items-center gap-1">
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-8 h-8 text-[10px] font-bold rounded-lg transition-all ${currentPage === i + 1 ? 'shadow-md' : 'hover:bg-[var(--bg-secondary)]'}`}
                    style={{ 
                      backgroundColor: currentPage === i + 1 ? 'var(--brand-primary)' : 'transparent',
                      color: currentPage === i + 1 ? 'var(--bg-primary)' : 'var(--text-secondary)' 
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-[10px] font-bold rounded-lg disabled:opacity-50 transition-colors uppercase tracking-widest"
                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone - Clear Data */}
      {isSuperAdmin && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 p-6 rounded-2xl"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--status-cancelled-bg)' }}>
              <Trash2 className="w-5 h-5" style={{ color: 'var(--status-cancelled-text)' }} />
            </div>
            <div>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--status-cancelled-text)' }}>Zona de Perigo: Limpar Dados</h3>
              <p className="text-sm opacity-80" style={{ color: 'var(--status-cancelled-text)' }}>Ações destrutivas e irreversíveis para o sistema.</p>
            </div>
          </div>
          
          <div className="p-4 rounded-xl border mb-6" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'color-mix(in srgb, var(--status-cancelled-text), transparent 80%)' }}>
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5" style={{ color: 'var(--status-cancelled-text)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--status-cancelled-text)' }}>Aviso de Risco Crítico</p>
                <p className="text-xs opacity-80 mt-1" style={{ color: 'var(--status-cancelled-text)' }}>
                  Ao prosseguir, todos os registros das coleções selecionadas serão excluídos permanentemente. 
                  Esta ação não pode ser desfeita e afetará todos os usuários do sistema.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsClearDataModalOpen(true)}
            className="px-6 py-2.5 rounded-xl font-medium transition-colors shadow-sm"
            style={{ backgroundColor: 'var(--status-cancelled-text)', color: 'var(--bg-primary)' }}
          >
            Iniciar Limpeza de Dados
          </button>
        </motion.div>
      )}

      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-[var(--ink)]/60 backdrop-blur-sm">
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
                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--accent-primary)' }}>
                    {getInitials(selectedUser.displayName)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{selectedUser.displayName}</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selectedUser.email}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedUser(null)}
                  className="p-2 rounded-full transition-colors"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="p-4 rounded-2xl shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                    <span className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-secondary)' }}>Setor</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedUser.sector || 'Não informado'}</span>
                  </div>
                  <div className="p-4 rounded-2xl shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                    <span className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-secondary)' }}>Nível de Acesso</span>
                    <div 
                      className="flex items-center gap-2 mt-1 cursor-help w-fit"
                      title={getRoleDescription(selectedUser.role)}
                    >
                      {getRoleIcon(selectedUser.role)}
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{getRoleLabel(selectedUser.role)}</span>
                    </div>
                  </div>
                </div>

                <CommentsSection 
                  entityId={selectedUser.uid} 
                  entityType="users" 
                  currentUserProfile={profile} 
                />

                <div className="mt-8">
                  <h4 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Histórico de Login</h4>
                  {selectedUser.loginHistory && selectedUser.loginHistory.length > 0 ? (
                    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
                      <table className="w-full text-left">
                        <thead style={{ backgroundColor: 'var(--bg-secondary)' }}>
                          <tr>
                            <th className="px-4 py-2 text-[10px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>Data/Hora</th>
                            <th className="px-4 py-2 text-[10px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>IP</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                          {selectedUser.loginHistory.map((entry, index) => (
                            <tr key={index}>
                              <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-primary)' }}>
                                {formatDate(entry.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-primary)' }}>{entry.ipAddress}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>Nenhum histórico de login disponível.</p>
                  )}
                </div>

                <div className="mt-8">
                  <h4 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Histórico de Login</h4>
                  {selectedUser.loginHistory && selectedUser.loginHistory.length > 0 ? (
                    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
                      <table className="w-full text-left">
                        <thead style={{ backgroundColor: 'var(--bg-secondary)' }}>
                          <tr>
                            <th className="px-4 py-2 text-[10px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>Data/Hora</th>
                            <th className="px-4 py-2 text-[10px] font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>IP</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                          {selectedUser.loginHistory.map((entry, index) => (
                            <tr key={index}>
                              <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-primary)' }}>
                                {formatDate(entry.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-primary)' }}>{entry.ipAddress}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm italic" style={{ color: 'var(--text-secondary)' }}>Nenhum histórico de login encontrado.</p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink)]/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 rounded-full transition-colors"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateOrEditUser} className="p-6 space-y-4">
                {formError && (
                  <div className="p-3 text-sm rounded-xl border" style={{ backgroundColor: 'var(--status-cancelled-bg)', color: 'var(--status-cancelled-text)', borderColor: 'color-mix(in srgb, var(--status-cancelled-text), transparent 80%)' }}>
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Nome Completo
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 transition-all outline-none"
                    style={{ 
                      backgroundColor: 'var(--bg-secondary)', 
                      borderColor: showErrors && !formData.name ? 'var(--status-error)' : 'var(--border-color)', 
                      color: 'var(--text-primary)',
                      boxShadow: showErrors && !formData.name ? '0 0 0 2px color-mix(in srgb, var(--status-error), transparent 90%)' : 'none'
                    }}
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                  {showErrors && !formData.name && <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-1">Este campo é obrigatório</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    E-mail
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input 
                    type="email" 
                    required
                    disabled={!!editingUser}
                    className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 transition-all outline-none disabled:opacity-50"
                    style={{ 
                      backgroundColor: 'var(--bg-secondary)', 
                      borderColor: showErrors && !formData.email ? 'var(--status-error)' : 'var(--border-color)', 
                      color: 'var(--text-primary)',
                      boxShadow: showErrors && !formData.email ? '0 0 0 2px color-mix(in srgb, var(--status-error), transparent 90%)' : 'none'
                    }}
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                  />
                  {showErrors && !formData.email && <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-1">Este campo é obrigatório</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    {editingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha Inicial'}
                    {!editingUser && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <input 
                    type="password" 
                    required={!editingUser}
                    minLength={6}
                    className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 transition-all outline-none"
                    style={{ 
                      backgroundColor: 'var(--bg-secondary)', 
                      borderColor: showErrors && !editingUser && !formData.password ? 'var(--status-error)' : 'var(--border-color)', 
                      color: 'var(--text-primary)',
                      boxShadow: showErrors && !editingUser && !formData.password ? '0 0 0 2px color-mix(in srgb, var(--status-error), transparent 90%)' : 'none'
                    }}
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                  />
                  
                  {formData.password && (
                    <div className="mt-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Força da Senha</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider transition-colors duration-300" style={{ color: passwordStrength.color }}>{passwordStrength.label}</span>
                      </div>
                      <div className="flex gap-1 h-1.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div 
                            key={level} 
                            className="flex-1 rounded-full transition-colors duration-300"
                            style={{ 
                              backgroundColor: level <= passwordStrength.score ? passwordStrength.color : 'var(--border-color)' 
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {showErrors && !editingUser && !formData.password && <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-1">Este campo é obrigatório</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Setor</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    value={formData.sector}
                    onChange={e => setFormData({...formData, sector: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Nível de Acesso
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <select 
                    required
                    className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 transition-all outline-none"
                    style={{ 
                      backgroundColor: 'var(--bg-secondary)', 
                      borderColor: showErrors && !formData.role ? 'var(--status-error)' : 'var(--border-color)', 
                      color: 'var(--text-primary)',
                      boxShadow: showErrors && !formData.role ? '0 0 0 2px color-mix(in srgb, var(--status-error), transparent 90%)' : 'none'
                    }}
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                  >
                    <option value="viewer" title={getRoleDescription('viewer')}>Visualizador</option>
                    <option value="editor" title={getRoleDescription('editor')}>Editor</option>
                    <option value="manager" title={getRoleDescription('manager')}>Gestor</option>
                    <option value="admin" title={getRoleDescription('admin')}>Admin</option>
                    <option value="super_admin" title={getRoleDescription('super_admin')}>Super Admin</option>
                  </select>
                  {showErrors && !formData.role && <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-1">Este campo é obrigatório</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Permissões Adicionais
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_PERMISSIONS.map(permission => (
                      <label key={permission} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={formData.permissions.includes(permission)}
                          onChange={e => {
                            const newPermissions = e.target.checked
                              ? [...formData.permissions, permission]
                              : formData.permissions.filter(p => p !== permission);
                            setFormData({...formData, permissions: newPermissions});
                          }}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        {permission}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl transition-colors font-medium"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2.5 text-[var(--bg-primary)] bg-[var(--accent-primary)] hover:opacity-90 rounded-xl transition-colors font-medium disabled:opacity-50"
                  >
                    {isSubmitting ? 'Salvando...' : (editingUser ? 'Salvar Alterações' : 'Criar Usuário')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear Data Modal */}
      <AnimatePresence>
        {isClearDataModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink)]/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <div className="p-6 border-b flex justify-between items-center" style={{ backgroundColor: 'var(--status-cancelled-bg)', borderColor: 'var(--border-color)' }}>
                <h3 className="text-xl font-bold" style={{ color: 'var(--status-cancelled-text)' }}>Confirmar Limpeza</h3>
                <button 
                  onClick={() => setIsClearDataModalOpen(false)} 
                  className="p-2 rounded-full transition-colors"
                  style={{ backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--status-cancelled-bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X className="w-6 h-6" style={{ color: 'var(--status-cancelled-text)', opacity: 0.6 }} />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Selecione o que deseja excluir:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'machines', label: 'Computadores' },
                      { id: 'collaborators', label: 'Colaboradores' },
                      { id: 'printers', label: 'Impressoras' },
                      { id: 'ups', label: 'Nobreaks' },
                      { id: 'servers', label: 'Servidores' },
                      { id: 'licenses', label: 'Licenças' },
                      { id: 'units', label: 'Unidades' }
                    ].map(item => (
                      <label key={item.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors" style={{ borderColor: 'var(--border-color)' }}>
                        <input
                          type="checkbox"
                          checked={selectedCollections.includes(item.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCollections([...selectedCollections, item.id]);
                            } else {
                              setSelectedCollections(selectedCollections.filter(id => id !== item.id));
                            }
                          }}
                          className="w-4 h-4 rounded focus:ring-red-500"
                          style={{ color: 'var(--status-error)' }}
                        />
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Confirme sua senha de Super Admin:
                  </label>
                  <input
                    type="password"
                    value={clearDataPassword}
                    onChange={(e) => setClearDataPassword(e.target.value)}
                    placeholder="Digite sua senha atual"
                    className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 transition-all outline-none"
                    style={{ 
                      backgroundColor: 'var(--bg-secondary)', 
                      borderColor: 'var(--border-color)', 
                      color: 'var(--text-primary)',
                      boxShadow: 'none'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--status-error)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsClearDataModalOpen(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl transition-colors font-medium"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleClearData}
                    disabled={isClearing || !clearDataPassword || selectedCollections.length === 0}
                    className="flex-1 px-4 py-2.5 text-white rounded-xl transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ backgroundColor: 'var(--status-error)' }}
                  >
                    {isClearing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Limpando...
                      </>
                    ) : (
                      'Confirmar Exclusão'
                    )}
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
