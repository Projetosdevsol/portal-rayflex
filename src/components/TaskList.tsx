import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, 
  Plus, 
  Search, 
  Filter, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  MoreVertical,
  User as UserIcon,
  Calendar,
  Tag,
  Trash2,
  Edit,
  ChevronRight
} from 'lucide-react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  where,
  orderBy
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, formatDate } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Task, TaskStatus, TaskPriority, TaskCategory, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { format, isPast, isToday, addDays, startOfDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logAction } from '../utils/audit';

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; text: string; icon: any }> = {
  'pending': { label: 'Pendente', bg: 'var(--status-pending-bg)', text: 'var(--status-pending-text)', icon: Clock },
  'in-progress': { label: 'Em Andamento', bg: 'var(--status-progress-bg)', text: 'var(--status-progress-text)', icon: RefreshCw },
  'completed': { label: 'Concluída', bg: 'var(--status-completed-bg)', text: 'var(--status-completed-text)', icon: CheckCircle2 },
  'cancelled': { label: 'Cancelada', bg: 'var(--status-cancelled-bg)', text: 'var(--status-cancelled-text)', icon: XCircle },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; bg: string; text: string }> = {
  'low': { label: 'Baixa', bg: 'var(--bg-secondary)', text: 'var(--text-secondary)' },
  'medium': { label: 'Média', bg: 'var(--status-info-bg)', text: 'var(--status-info-text)' },
  'high': { label: 'Alta', bg: 'var(--status-warning-bg)', text: 'var(--status-warning-text)' },
  'critical': { label: 'Crítica', bg: 'var(--status-cancelled-bg)', text: 'var(--status-cancelled-text)' },
};

const CATEGORY_CONFIG: Record<TaskCategory, { label: string }> = {
  'software': { label: 'Software' },
  'hardware': { label: 'Hardware' },
  'network': { label: 'Rede' },
  'access': { label: 'Acessos' },
  'other': { label: 'Outros' },
};

const getDueDateStatus = (dueDate?: string, status?: TaskStatus) => {
  if (!dueDate || status === 'completed' || status === 'cancelled') return 'none';
  
  const today = startOfDay(new Date());
  const due = startOfDay(parseISO(dueDate));
  
  if (isPast(due) && !isToday(due)) return 'overdue';
  if (isToday(due)) return 'today';
  
  const soon = addDays(today, 2);
  if (due <= soon) return 'soon';
  
  return 'none';
};

function RefreshCw(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

export const TaskList: React.FC = () => {
  const { profile, isManager, isSuperAdmin, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all');
  const [showErrors, setShowErrors] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'pending' as TaskStatus,
    priority: 'medium' as TaskPriority,
    category: 'software' as TaskCategory,
    assignedTo: '',
    dueDate: ''
  });

  useEffect(() => {
    if (authLoading || !profile) return;

    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setTasks(fetchedTasks);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tasks');
      setLoading(false);
    });

    // Fetch users for assignment
    const fetchUsers = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/users', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setUsers(data);
        }
      } catch (error) {
        console.error('Error fetching users for tasks:', error);
      }
    };

    fetchUsers();
    return () => unsubscribe();
  }, [profile, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (!profile) return;

    // Basic validation
    if (!formData.title || !formData.assignedTo) {
      return;
    }

    const assignedUser = users.find(u => u.uid === formData.assignedTo);
    
    const taskData = {
      ...formData,
      assignedToName: assignedUser?.displayName || 'Desconhecido',
      createdBy: profile.uid,
      createdByName: profile.displayName,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingTask) {
        await updateDoc(doc(db, 'tasks', editingTask.id), taskData);
        await logAction('update', 'tasks', editingTask.id, editingTask, taskData, `Tarefa atualizada: ${formData.title}`);
      } else {
        const docRef = await addDoc(collection(db, 'tasks'), {
          ...taskData,
          createdAt: serverTimestamp(),
        });
        await logAction('create', 'tasks', docRef.id, null, taskData, `Nova tarefa criada: ${formData.title}`);
      }
      setIsModalOpen(false);
      setEditingTask(null);
      setShowErrors(false);
      setFormData({
        title: '',
        description: '',
        status: 'pending',
        priority: 'medium',
        category: 'software',
        assignedTo: '',
        dueDate: ''
      });
    } catch (error) {
      handleFirestoreError(error, editingTask ? OperationType.UPDATE : OperationType.CREATE, 'tasks');
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      await updateDoc(doc(db, 'tasks', taskId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      await logAction('update', 'tasks', taskId, { status: task.status }, { status: newStatus }, `Status da tarefa alterado para ${newStatus}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'tasks');
    }
  };

  const handlePriorityChange = async (taskId: string, newPriority: TaskPriority) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      await updateDoc(doc(db, 'tasks', taskId), {
        priority: newPriority,
        updatedAt: serverTimestamp()
      });
      await logAction('update', 'tasks', taskId, { priority: task.priority }, { priority: newPriority }, `Prioridade da tarefa alterada para ${newPriority}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'tasks');
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta tarefa?')) return;
    try {
      const task = tasks.find(t => t.id === taskId);
      await deleteDoc(doc(db, 'tasks', taskId));
      if (task) {
        await logAction('delete', 'tasks', taskId, task, null, `Tarefa excluída: ${task.title}`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'tasks');
    }
  };

  const filteredTasks = tasks.filter(task => {
    const searchStr = searchTerm.toLowerCase();
    const matchesSearch = !searchStr ||
                         task.title.toLowerCase().includes(searchStr) || 
                         task.description?.toLowerCase().includes(searchStr) ||
                         task.assignedToName.toLowerCase().includes(searchStr) ||
                         CATEGORY_CONFIG[task.category]?.label.toLowerCase().includes(searchStr) ||
                         STATUS_CONFIG[task.status]?.label.toLowerCase().includes(searchStr) ||
                         PRIORITY_CONFIG[task.priority]?.label.toLowerCase().includes(searchStr);
    const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
    
    // Non-managers can only see tasks assigned to them or created by them
    const hasPermission = isManager || isSuperAdmin || task.assignedTo === profile?.uid || task.createdBy === profile?.uid;
    
    return matchesSearch && matchesStatus && hasPermission;
  });

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] flex items-center gap-3">
            <CheckSquare className="w-8 h-8 text-[var(--accent-primary)]" />
            Gestão de Tarefas TI
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">Gerencie manutenções, atualizações e suportes técnicos.</p>
        </div>
        {(isManager || isSuperAdmin) && (
          <button
            onClick={() => {
              setEditingTask(null);
              setFormData({
                title: '',
                description: '',
                status: 'pending',
                priority: 'medium',
                category: 'software',
                assignedTo: '',
                dueDate: ''
              });
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-[var(--accent-primary)] text-white px-6 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-lg font-bold"
          >
            <Plus size={20} />
            Nova Tarefa
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative col-span-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por título ou responsável..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-12 py-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-[var(--accent-primary)]/10 outline-none transition-all shadow-sm placeholder:text-[var(--text-secondary)] text-[var(--text-primary)]"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 hover:bg-[var(--bg-secondary)] rounded-full transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <XCircle size={18} />
            </button>
          )}
        </div>
        <div className="relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] w-5 h-5" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="w-full pl-12 pr-4 py-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-[var(--accent-primary)]/10 outline-none transition-all shadow-sm appearance-none font-bold text-[var(--text-primary)]"
          >
            <option value="all">Todos os Status</option>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Task Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-12 h-12 border-4 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-20 bg-[var(--bg-primary)] rounded-3xl border border-dashed border-[var(--border-color)]">
          <CheckSquare className="w-16 h-16 text-[var(--text-secondary)] mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-bold text-[var(--text-primary)]">Nenhuma tarefa encontrada</h3>
          <p className="text-[var(--text-secondary)]">Tente ajustar seus filtros ou crie uma nova tarefa.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredTasks.map((task) => {
              const status = STATUS_CONFIG[task.status];
              const priority = PRIORITY_CONFIG[task.priority];
              const StatusIcon = status.icon;
              const dueDateStatus = getDueDateStatus(task.dueDate, task.status);
              
              return (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                  className={`bg-[var(--bg-primary)] rounded-3xl border shadow-sm hover:shadow-xl transition-all group overflow-hidden flex flex-col cursor-pointer ${
                    dueDateStatus === 'overdue' ? 'border-[var(--status-cancelled-text)]/30 ring-1 ring-[var(--status-cancelled-text)]/10' : 
                    dueDateStatus === 'today' ? 'border-[var(--status-warning)]/30 ring-1 ring-[var(--status-warning)]/10' :
                    dueDateStatus === 'soon' ? 'border-[var(--status-warning)]/30 ring-1 ring-[var(--status-warning)]/10' :
                    'border-[var(--border-color)]'
                  }`}
                >
                  {/* Priority Bar */}
                  <div className="h-1.5 w-full" style={{ backgroundColor: priority.text }} />
                  
                  <div className="p-6 flex-1 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <span 
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                          style={{ backgroundColor: status.bg, color: status.text, borderColor: 'transparent' }}
                        >
                          {status.label}
                        </span>
                        <h3 className="text-lg font-bold text-[var(--text-primary)] line-clamp-2 group-hover:text-[var(--accent-primary)] transition-colors">
                          {task.title}
                        </h3>
                      </div>
                      {(isManager || isSuperAdmin) && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTask(task);
                              setFormData({
                                title: task.title,
                                description: task.description,
                                status: task.status,
                                priority: task.priority,
                                category: task.category,
                                assignedTo: task.assignedTo,
                                dueDate: task.dueDate || ''
                              });
                              setIsModalOpen(true);
                            }}
                            className="p-2 text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-secondary)] rounded-xl transition-all"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(task.id);
                            }}
                            className="p-2 text-[var(--text-secondary)] hover:text-[var(--status-cancelled-text)] hover:bg-[var(--status-cancelled-bg)] rounded-xl transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className={`text-sm text-[var(--text-secondary)] ${expandedTaskId === task.id ? '' : 'line-clamp-3 min-h-[4.5rem]'}`}>
                      {task.description || 'Sem descrição.'}
                    </p>

                    <div className="pt-4 border-t border-[var(--border-color)] space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                          <UserIcon size={14} />
                          <span className="font-medium">{task.assignedToName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                          <Calendar size={14} className={
                            dueDateStatus === 'overdue' ? 'text-[var(--status-cancelled-text)]' :
                            dueDateStatus === 'today' ? 'text-[var(--status-warning)]' :
                            dueDateStatus === 'soon' ? 'text-[var(--status-warning)]' :
                            'text-[var(--text-secondary)]'
                          } />
                          <span className={`font-medium ${
                            dueDateStatus === 'overdue' ? 'text-[var(--status-cancelled-text)] font-bold' :
                            dueDateStatus === 'today' ? 'text-[var(--status-warning)] font-bold' :
                            dueDateStatus === 'soon' ? 'text-[var(--status-warning)] font-bold' :
                            ''
                          }`}>
                            {task.dueDate ? format(parseISO(task.dueDate), "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'Sem prazo'}
                          </span>
                          {dueDateStatus === 'overdue' && (
                            <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded flex items-center gap-0.5" style={{ backgroundColor: 'var(--status-cancelled-bg)', color: 'var(--status-cancelled-text)' }}>
                              <AlertCircle size={8} /> Vencido
                            </span>
                          )}
                          {(dueDateStatus === 'today' || dueDateStatus === 'soon') && (
                            <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded flex items-center gap-0.5" style={{ backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning-text)' }}>
                              <Clock size={8} /> {dueDateStatus === 'today' ? 'Hoje' : 'Em breve'}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tag size={14} className="text-[var(--text-secondary)]" />
                          <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                            {CATEGORY_CONFIG[task.category].label}
                          </span>
                        </div>
                        {(task.assignedTo === profile?.uid || isManager || isSuperAdmin) ? (
                          <select
                            value={task.priority}
                            onChange={(e) => handlePriorityChange(task.id, e.target.value as TaskPriority)}
                            className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border-0 outline-none cursor-pointer"
                            style={{ backgroundColor: priority.bg, color: priority.text }}
                          >
                            {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                              <option key={key} value={key}>{config.label}</option>
                            ))}
                          </select>
                        ) : (
                          <div 
                            className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
                            style={{ backgroundColor: priority.bg, color: priority.text }}
                          >
                            Prioridade {priority.label}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="px-6 py-4 bg-[var(--bg-secondary)] flex flex-col gap-2 border-t border-[var(--border-color)]">
                    <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                      <div className="flex items-center gap-2">
                        <Clock size={12} />
                        <span>Criado: {format(formatDate(task.createdAt), "dd/MM HH:mm")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={12} />
                        <span>Atualizado: {format(formatDate(task.updatedAt), "dd/MM HH:mm")}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatusIcon size={14} style={{ color: status.text }} />
                        <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                          {status.label}
                        </span>
                      </div>
                      {(task.assignedTo === profile?.uid || isManager || isSuperAdmin) && task.status !== 'completed' && (
                        <button
                          onClick={() => handleStatusChange(task.id, task.status === 'pending' ? 'in-progress' : 'completed')}
                          className="text-xs font-bold text-[var(--accent-primary)] hover:opacity-80 flex items-center gap-1 group/btn bg-[var(--accent-primary)]/10 px-3 py-1.5 rounded-lg transition-colors border border-[var(--accent-primary)]/20"
                        >
                          {task.status === 'pending' ? 'Iniciar' : 'Concluir'}
                          <ChevronRight size={14} className="group-hover/btn:translate-x-0.5 transition-transform" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Task Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-[var(--ink)]/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-[var(--bg-primary)] rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden border border-[var(--border-color)]"
            >
              <div className="px-8 py-6 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-secondary)]">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--accent-primary)] text-white">
                    <CheckSquare size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[var(--text-primary)]">
                      {editingTask ? 'Editar Tarefa' : 'Nova Tarefa TI'}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] font-bold uppercase tracking-widest">Preencha os detalhes abaixo</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full hover:bg-[var(--bg-secondary)] transition-all"
                >
                  <XCircle size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {editingTask && (
                    <div className="sm:col-span-2 flex items-center gap-6 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest bg-[var(--bg-secondary)] p-4 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <Clock size={12} />
                        <span>Criado: {format(formatDate(editingTask.createdAt), "dd/MM HH:mm")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={12} />
                        <span>Atualizado: {format(formatDate(editingTask.updatedAt), "dd/MM HH:mm")}</span>
                      </div>
                    </div>
                  )}
                  <div className="sm:col-span-2 space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest ml-1">
                      Título da Tarefa
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <input
                      required
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Ex: Atualizar firmware dos switches"
                      className={`w-full px-4 py-3 bg-[var(--bg-secondary)] border rounded-2xl focus:ring-2 outline-none transition-all text-[var(--text-primary)] ${
                        showErrors && !formData.title 
                          ? 'border-red-500 ring-2 ring-red-500/10 focus:ring-red-500/20 focus:border-red-500' 
                          : 'border-[var(--border-color)] focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)]'
                      }`}
                    />
                    {showErrors && !formData.title && <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-1">Este campo é obrigatório</p>}
                  </div>

                  <div className="sm:col-span-2 space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest ml-1">Descrição</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Detalhes técnicos da tarefa..."
                      className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)] outline-none transition-all min-h-[100px] resize-none text-[var(--text-primary)]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest ml-1">
                      Atribuir Para
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <select
                      required
                      value={formData.assignedTo}
                      onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                      className={`w-full px-4 py-3 bg-[var(--bg-secondary)] border rounded-2xl focus:ring-2 outline-none transition-all text-[var(--text-primary)] ${
                        showErrors && !formData.assignedTo 
                          ? 'border-red-500 ring-2 ring-red-500/10 focus:ring-red-500/20 focus:border-red-500' 
                          : 'border-[var(--border-color)] focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)]'
                      }`}
                    >
                      <option value="">Selecionar usuário...</option>
                      {users.map(user => (
                        <option key={user.uid} value={user.uid}>{user.displayName} ({user.role})</option>
                      ))}
                    </select>
                    {showErrors && !formData.assignedTo && <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-1">Este campo é obrigatório</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest ml-1">Data de Vencimento</label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)] outline-none transition-all text-[var(--text-primary)]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest ml-1">Prioridade</label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
                      className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)] outline-none transition-all text-[var(--text-primary)]"
                    >
                      {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                        <option key={key} value={key}>{config.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest ml-1">Categoria</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as TaskCategory })}
                      className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)] outline-none transition-all text-[var(--text-primary)]"
                    >
                      {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                        <option key={key} value={key}>{config.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 text-[var(--text-primary)] font-bold hover:bg-[var(--bg-secondary)] rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-[var(--accent-primary)] text-white px-8 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-lg font-bold"
                  >
                    {editingTask ? 'Salvar Alterações' : 'Criar Tarefa'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
