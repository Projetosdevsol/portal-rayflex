import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Collaborator, Machine } from '../types';
import { logAction } from '../utils/audit';
import { Search, Eye, EyeOff, Lock, ChevronUp, ChevronDown, ArrowUpDown, LayoutGrid, List, Filter, Monitor, Cpu, HardDrive, MemoryStick, FileText, Key, Barcode, Calendar, CheckSquare, Square, Trash2, X, Plus, ArrowRight, Upload, ShieldCheck, AlertCircle } from 'lucide-react';
import { DoubleScrollContainer } from './DoubleScrollContainer';
import { decryptData } from '../utils/crypto';
import { useAuth } from '../contexts/AuthContext';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const SecureField: React.FC<{ encryptedValue?: string }> = ({ encryptedValue }) => {
  const [isVisible, setIsVisible] = useState(false);
  const { isSuperAdmin, isEditor } = useAuth();
  const canView = isSuperAdmin || isEditor;

  if (!encryptedValue) return <span className="text-[var(--text-secondary)] italic text-[10px] font-bold uppercase tracking-widest">N/A</span>;

  const decrypted = isVisible && canView ? decryptData(encryptedValue) : '••••••••';

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs font-medium text-[var(--text-primary)]">{decrypted}</span>
      {canView && (
        <button 
          onClick={() => setIsVisible(!isVisible)}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 hover:bg-[var(--bg-secondary)] rounded-md"
          title={isVisible ? "Ocultar" : "Mostrar"}
        >
          {isVisible ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      )}
      {!canView && (
        <span title="Acesso Restrito">
          <Lock size={12} className="text-[var(--border-color)]" />
        </span>
      )}
    </div>
  );
};

export const Controle: React.FC = () => {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [filterSector, setFilterSector] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkStep, setBulkStep] = useState(1);
  const [selectedCollabs, setSelectedCollabs] = useState<string[]>([]);
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [justification, setJustification] = useState('');
  const [authFile, setAuthFile] = useState<File | null>(null);
  const [bulkSectorFilter, setBulkSectorFilter] = useState('');
  const [bulkCollabSearch, setBulkCollabSearch] = useState('');
  const [bulkMachineSearch, setBulkMachineSearch] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const { user, loading: authLoading, isSuperAdmin, isAdmin, isManager } = useAuth();

  const isAuthorized = isSuperAdmin || isAdmin;

  useEffect(() => {
    if (authLoading || !user) return;

    const unsubCollab = onSnapshot(collection(db, 'collaborators'), (snapshot) => {
      setCollaborators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Collaborator)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'collaborators');
    });
    const unsubMachines = onSnapshot(collection(db, 'machines'), (snapshot) => {
      setMachines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Machine)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'machines');
    });

    setLoading(false);
    return () => { unsubCollab(); unsubMachines(); };
  }, [user, authLoading]);

  const getMachineHostname = (machineId?: string) => {
    const machine = machines.find(m => m.id === machineId);
    return machine ? machine.hostname : 'N/A';
  };

  const getMachineDetails = (machineId?: string) => {
    return machines.find(m => m.id === machineId);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

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

  const sectors = Array.from(new Set(collaborators.map(c => c.sector_responsible).filter(Boolean))).sort();
  const assignedMachineIds = Array.from(new Set(collaborators.map(c => c.machine_id).filter(Boolean)));
  const assignedMachines = machines.filter(m => assignedMachineIds.includes(m.id)).sort((a, b) => a.hostname.localeCompare(b.hostname));

  const filteredData = collaborators
    .filter(c => {
      // User request: only show collaborators associated with a machine
      // AND status must be active
      if (!c.machine_id || c.status !== 'active') return false;

      const searchStr = searchTerm.toLowerCase();
      const machine = getMachineDetails(c.machine_id);
      const matchesSearch = !searchStr || 
                            (c.name?.toLowerCase() || '').includes(searchStr) ||
                            (c.email?.toLowerCase() || '').includes(searchStr) ||
                            (c.login?.toLowerCase() || '').includes(searchStr) ||
                            (machine?.hostname?.toLowerCase() || '').includes(searchStr);
      const matchesSector = filterSector ? c.sector_responsible === filterSector : true;
      const matchesMachine = filterMachine ? c.machine_id === filterMachine : true;
      
      return matchesSearch && matchesSector && matchesMachine;
    })
    .sort((a: any, b: any) => {
      let valA = a[sortField] || '';
      let valB = b[sortField] || '';
      
      if (sortField === 'machine_id') {
        valA = getMachineHostname(a.machine_id);
        valB = getMachineHostname(b.machine_id);
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSelectAll = () => {
    if (selectedIds.length === paginatedData.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedData.map(item => item.id));
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkMachineChange = async (machineId: string) => {
    if (!user || !isAuthorized || selectedIds.length === 0) return;
    
    // Check pattern for hostname if it's a new assignment
    const machine = machines.find(m => m.id === machineId);
    if (machine && !/^SOL\d{2}RAY$/i.test(machine.hostname)) {
      if (!confirm(`O hostname ${machine.hostname} não segue o padrão SOL##RAY. Deseja continuar?`)) return;
    }

    setIsBulkUpdating(true);
    try {
      const machine = machines.find(m => m.id === machineId);
      const machineName = machine ? machine.hostname : 'N/A';

      for (const id of selectedIds) {
        const collab = collaborators.find(c => c.id === id);
        const oldMachineId = collab?.machine_id;
        const oldMachine = machines.find(m => m.id === oldMachineId);
        const oldMachineName = oldMachine ? oldMachine.hostname : 'N/A';

        await updateDoc(doc(db, 'collaborators', id), {
          machine_id: machineId,
          updatedAt: serverTimestamp()
        });

        // Log the change
        await logAction(
          'update',
          'collaborators',
          id,
          { machine_id: oldMachineId },
          { machine_id: machineId },
          `Alteração em massa de máquina: de ${oldMachineName} para ${machineName}`
        );
      }
      setSelectedIds([]);
      alert(`${selectedIds.length} colaboradores atualizados com sucesso!`);
    } catch (error) {
      console.error("Erro ao atualizar em massa:", error);
      alert("Erro ao realizar atualização em massa.");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkLink = async () => {
    if (!user || !isAuthorized) return;
    if (selectedCollabs.length === 0 || selectedMachines.length === 0) {
      alert("Selecione pelo menos um colaborador e uma máquina.");
      return;
    }
    if (!justification.trim()) {
      alert("A justificativa é obrigatória.");
      return;
    }
    if (!authFile) {
      alert("O comprovante de autorização é obrigatório.");
      return;
    }

    // Validation: 1 to 1 unless shared (we'll assume 1 to 1 for this simple bulk tool unless user selects multiple)
    // The requirement says: "Impedir a atribuição de uma única máquina a múltiplos usuários (e vice-versa), a menos que sinalizado como uso compartilhado."
    // For simplicity, we'll map them in order of selection.
    if (selectedCollabs.length !== selectedMachines.length) {
      if (!confirm(`Você selecionou ${selectedCollabs.length} colaboradores e ${selectedMachines.length} máquinas. Eles serão vinculados na ordem de seleção. Deseja continuar?`)) return;
    }

    setIsProcessing(true);
    try {
      const storage = getStorage();
      const fileRef = ref(storage, `authorizations/${Date.now()}_${authFile.name}`);
      await uploadBytes(fileRef, authFile);
      const fileUrl = await getDownloadURL(fileRef);

      const count = Math.min(selectedCollabs.length, selectedMachines.length);
      
      for (let i = 0; i < count; i++) {
        const collabId = selectedCollabs[i];
        const machineId = selectedMachines[i];
        
        const collab = collaborators.find(c => c.id === collabId);
        const machine = machines.find(m => m.id === machineId);

        if (!collab || !machine) continue;

        // Update Collab
        await updateDoc(doc(db, 'collaborators', collabId), {
          machine_id: machineId,
          updatedAt: serverTimestamp()
        });

        // Update Machine
        await updateDoc(doc(db, 'machines', machineId), {
          assignedTo: collabId,
          status: 'in-use',
          updatedAt: serverTimestamp()
        });

        // Audit Log
        await logAction(
          'update',
          'collaborators',
          collabId,
          { machine_id: null },
          { machine_id: machineId },
          `Vinculação em massa: Máquina ${machine.hostname}. Evidência: ${fileUrl}`,
          justification,
          'medium'
        );
      }

      alert("Vinculação concluída com sucesso!");
      setShowBulkModal(false);
      resetBulkState();
    } catch (error) {
      console.error("Erro na vinculação em massa:", error);
      alert("Erro ao processar vinculação.");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetBulkState = () => {
    setSelectedCollabs([]);
    setSelectedMachines([]);
    setJustification('');
    setAuthFile(null);
    setBulkStep(1);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[var(--bg-secondary)] border-t-[var(--brand-primary)] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">Controle de Acessos</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1 font-medium">Gestão centralizada de credenciais e ativos por colaborador.</p>
        </div>
        {isAuthorized && (
          <button
            onClick={() => setShowBulkModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[var(--brand-primary)] text-[var(--bg-primary)] rounded-2xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-[var(--brand-primary)]/20"
          >
            <Plus size={18} />
            Atribuição em Massa
          </button>
        )}
      </header>

      <div className="bg-[var(--bg-primary)] rounded-[2rem] border border-[var(--border-color)] shadow-sm overflow-hidden">
        <div className="p-6 border-b border-[var(--border-color)] flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
          <div className="flex-1 flex flex-col sm:flex-row gap-4 w-full">
            <div className="relative max-w-md w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18} />
              <input 
                type="text" 
                placeholder="Pesquisar colaborador..."
                className="w-full pl-11 pr-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-[var(--brand-primary)]/10 transition-all outline-none text-sm font-bold text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-48">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={14} />
                <select
                  value={filterSector}
                  onChange={(e) => setFilterSector(e.target.value)}
                  className="w-full pl-9 pr-8 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-[var(--brand-primary)]/10 transition-all outline-none text-xs font-bold text-[var(--text-primary)] appearance-none cursor-pointer"
                >
                  <option value="">Todos os Setores</option>
                  {sectors.map(sector => (
                    <option key={sector} value={sector}>{sector}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
              </div>

              <div className="relative flex-1 sm:w-48">
                <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={14} />
                <select
                  value={filterMachine}
                  onChange={(e) => setFilterMachine(e.target.value)}
                  className="w-full pl-9 pr-8 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-[var(--brand-primary)]/10 transition-all outline-none text-xs font-bold text-[var(--text-primary)] appearance-none cursor-pointer"
                >
                  <option value="">Todas as Máquinas</option>
                  {assignedMachines.map(m => (
                    <option key={m.id} value={m.id}>{m.hostname}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[var(--bg-secondary)] p-1 rounded-xl border border-[var(--border-color)] self-end xl:self-auto">
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-[var(--bg-primary)] text-[var(--brand-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              title="Visualização em Tabela"
            >
              <List size={18} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-[var(--bg-primary)] text-[var(--brand-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              title="Visualização em Grade"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>

        {isAuthorized && selectedIds.length > 0 && (
          <div className="flex items-center gap-4 p-4 border-b" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{selectedIds.length} selecionados</span>
            <div className="flex items-center gap-2 border-l pl-4 ml-2" style={{ borderColor: 'var(--border-color)' }}>
              <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Associar Máquina:</span>
              <select
                disabled={isBulkUpdating}
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkMachineChange(e.target.value);
                    e.target.value = ""; // Reset select
                  }
                }}
                className="px-3 py-2 rounded-lg text-xs font-bold transition-all border outline-none cursor-pointer disabled:opacity-50"
                style={{ 
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)'
                }}
              >
                <option value="">Selecionar Máquina...</option>
                {machines
                  .sort((a, b) => a.hostname.localeCompare(b.hostname))
                  .map(m => (
                    <option key={m.id} value={m.id}>{m.hostname}</option>
                  ))
                }
              </select>
              {isBulkUpdating && (
                <div className="w-4 h-4 border-2 border-[var(--bg-secondary)] border-t-[var(--brand-primary)] rounded-full animate-spin" />
              )}
            </div>
            <button 
              onClick={() => setSelectedIds([])}
              className="ml-auto p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              title="Limpar Seleção"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Desktop Table */}
        {viewMode === 'table' && (
          <div className="hidden xl:block">
          <DoubleScrollContainer>
            <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
                {isAuthorized && (
                  <th className="px-6 py-4 w-10">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectAll();
                      }}
                      className="p-1 rounded-md transition-colors hover:bg-[var(--bg-primary)]"
                      style={{ color: selectedIds.length === paginatedData.length ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                    >
                      {selectedIds.length === paginatedData.length ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                  </th>
                )}
                {[
                  { key: 'name', label: 'Colaborador' },
                  { key: 'sector_responsible', label: 'Setor' },
                  { key: 'login', label: 'Login Rede' },
                  { key: 'machine_id', label: 'ID Máquina' },
                  { key: 'ip_address', label: 'IP Local' },
                  { key: 'login_password', label: 'Senha Login' },
                  { key: 'email', label: 'E-mail' },
                  { key: 'email_password', label: 'Senha E-mail' }
                ].map(col => (
                  <th 
                    key={col.key} 
                    className="px-6 py-4 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest cursor-pointer hover:text-[var(--text-primary)] transition-colors group/th"
                    onClick={() => toggleSort(col.key)}
                  >
                    <div className="flex items-center gap-2">
                      {col.label}
                      <div className="flex flex-col opacity-0 group-hover/th:opacity-100 transition-opacity">
                        {sortField === col.key ? (
                          sortOrder === 'asc' ? <ChevronUp size={10} className="text-[var(--brand-primary)]" /> : <ChevronDown size={10} className="text-[var(--brand-primary)]" />
                        ) : (
                          <ArrowUpDown size={10} className="text-[var(--text-secondary)]" />
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {paginatedData.map((c) => (
                <React.Fragment key={c.id}>
                <tr 
                  className={`hover:bg-[var(--bg-secondary)] transition-colors group cursor-pointer ${expandedId === c.id ? 'bg-[var(--bg-secondary)]' : ''}`}
                  onClick={() => toggleExpand(c.id)}
                >
                  {isAuthorized && (
                    <td className="px-6 py-5">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectItem(c.id);
                        }}
                        className="p-1 rounded-md transition-colors hover:bg-[var(--bg-primary)]"
                        style={{ color: selectedIds.includes(c.id) ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                      >
                        {selectedIds.includes(c.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    </td>
                  )}
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-md transition-colors ${expandedId === c.id ? 'bg-[var(--brand-primary)] text-[var(--bg-primary)]' : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-color)] group-hover:border-[var(--brand-primary)] group-hover:text-[var(--brand-primary)]'}`}>
                        {expandedId === c.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-[var(--text-primary)]">{c.name}</p>
                          {isRecentComment(c.lastCommentAt) && (
                            <div 
                              className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" 
                              title="Comentário recente no colaborador"
                            />
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] font-medium uppercase tracking-wider mt-0.5">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-xs text-[var(--text-secondary)] font-medium uppercase tracking-wider">{c.sector_responsible}</td>
                  <td className="px-6 py-5 text-sm text-[var(--text-primary)] font-medium">{c.login || '-'}</td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-md text-[10px] font-bold uppercase tracking-wider border border-[var(--border-color)]">
                        {getMachineHostname(c.machine_id)}
                      </span>
                      {(() => {
                        const m = getMachineDetails(c.machine_id);
                        return m && isRecentComment(m.lastCommentAt) && (
                          <div 
                            className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" 
                            title="Comentário recente na máquina"
                          />
                        );
                      })()}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-xs text-[var(--text-secondary)] font-medium">
                    {getMachineDetails(c.machine_id)?.ipAddress || '-'}
                  </td>
                  <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                    <SecureField encryptedValue={c.login_password} />
                  </td>
                  <td className="px-6 py-5 text-sm text-[var(--text-primary)] font-medium">{c.email || '-'}</td>
                  <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                    <SecureField encryptedValue={c.email_password} />
                  </td>
                </tr>
                {expandedId === c.id && c.machine_id && (
                  <tr className="bg-[var(--bg-secondary)]/50 border-b border-[var(--border-color)]">
                    <td colSpan={9} className="px-6 py-4">
                      {(() => {
                        const m = getMachineDetails(c.machine_id);
                        if (!m) return <p className="text-sm text-[var(--text-secondary)]">Detalhes da máquina não encontrados.</p>;
                        return (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                                <Monitor size={20} />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Hostname</p>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold text-[var(--text-primary)]">{m.hostname}</p>
                                  {isRecentComment(m.lastCommentAt) && (
                                    <div 
                                      className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" 
                                      title="Comentário recente"
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                                <Cpu size={20} />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Processador</p>
                                <p className="text-sm font-bold text-[var(--text-primary)]">{m.processor || m.specs?.cpu || 'N/A'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                                <MemoryStick size={20} />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Memória RAM</p>
                                <p className="text-sm font-bold text-[var(--text-primary)]">{m.memory || m.specs?.ram || 'N/A'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                                <HardDrive size={20} />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Disco</p>
                                <p className="text-sm font-bold text-[var(--text-primary)]">{m.disk || m.specs?.storage || 'N/A'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                                <FileText size={20} />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Número NF</p>
                                <p className="text-sm font-bold text-[var(--text-primary)]">{m.invoiceNumber || 'N/A'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                                <Key size={20} />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Chave Danfe</p>
                                <p className="text-sm font-bold text-[var(--text-primary)] truncate max-w-[150px]" title={m.danfeKey}>{m.danfeKey || 'N/A'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                                <Barcode size={20} />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Número de Série</p>
                                <p className="text-sm font-bold text-[var(--text-primary)]">{m.serialNumber || 'N/A'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                                <Calendar size={20} />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Data da BIOS</p>
                                <p className="text-sm font-bold text-[var(--text-primary)]">{m.biosDate || 'N/A'}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </DoubleScrollContainer>
      </div>
      )}

        {/* Grid View (Desktop) & Mobile View */}
        <div className={viewMode === 'grid' ? "p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 bg-[var(--bg-secondary)]/30" : "xl:hidden divide-y divide-[var(--border-color)]"}>
          {paginatedData.map((c) => (
            <div key={c.id} className={viewMode === 'grid' ? "bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl p-6 space-y-6 shadow-sm hover:shadow-md transition-all relative" : "p-6 space-y-6 relative"}>
              {isAuthorized && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectItem(c.id);
                  }}
                  className="absolute top-4 right-4 p-1 rounded-md transition-colors hover:bg-[var(--bg-secondary)] z-10"
                  style={{ color: selectedIds.includes(c.id) ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                >
                  {selectedIds.includes(c.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
              )}
              <div 
                className="flex justify-between items-start cursor-pointer group"
                onClick={() => toggleExpand(c.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-md transition-colors ${expandedId === c.id ? 'bg-[var(--brand-primary)] text-[var(--bg-primary)]' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)] group-hover:border-[var(--brand-primary)] group-hover:text-[var(--brand-primary)]'}`}>
                    {expandedId === c.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[var(--text-primary)]">{c.name}</h3>
                      {isRecentComment(c.lastCommentAt) && (
                        <div 
                          className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" 
                          title="Comentário recente"
                        />
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest mt-0.5">{c.sector_responsible}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-lg text-[10px] font-bold uppercase tracking-widest">
                    {getMachineHostname(c.machine_id)}
                  </span>
                  {(() => {
                    const m = getMachineDetails(c.machine_id);
                    return m && isRecentComment(m.lastCommentAt) && (
                      <div 
                        className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" 
                        title="Comentário recente na máquina"
                      />
                    );
                  })()}
                </div>
              </div>

              {expandedId === c.id && c.machine_id && (
                <div className="bg-[var(--bg-secondary)]/50 p-4 rounded-xl border border-[var(--border-color)] mt-4">
                  {(() => {
                    const m = getMachineDetails(c.machine_id);
                    if (!m) return <p className="text-sm text-[var(--text-secondary)]">Detalhes da máquina não encontrados.</p>;
                    return (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                            <Monitor size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Hostname</p>
                            <p className="text-xs font-bold text-[var(--text-primary)]">{m.hostname}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                            <Cpu size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Processador</p>
                            <p className="text-xs font-bold text-[var(--text-primary)]">{m.processor || m.specs?.cpu || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                            <MemoryStick size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Memória RAM</p>
                            <p className="text-xs font-bold text-[var(--text-primary)]">{m.memory || m.specs?.ram || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                            <HardDrive size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Disco</p>
                            <p className="text-xs font-bold text-[var(--text-primary)]">{m.disk || m.specs?.storage || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                            <FileText size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Número NF</p>
                            <p className="text-xs font-bold text-[var(--text-primary)]">{m.invoiceNumber || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                            <Key size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Chave Danfe</p>
                            <p className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[100px]" title={m.danfeKey}>{m.danfeKey || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                            <Barcode size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Número de Série</p>
                            <p className="text-xs font-bold text-[var(--text-primary)]">{m.serialNumber || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-lg">
                            <Calendar size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Data da BIOS</p>
                            <p className="text-xs font-bold text-[var(--text-primary)]">{m.biosDate || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em] block mb-1.5">Acesso Rede</span>
                    <div className="flex flex-col gap-2 bg-[var(--bg-secondary)] p-3 rounded-xl border border-[var(--border-color)]">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Login:</span>
                        <span className="text-xs font-bold text-[var(--text-primary)]">{c.login || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Senha:</span>
                        <SecureField encryptedValue={c.login_password} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em] block mb-1.5">Grupo / Office</span>
                    <div className="text-xs font-bold text-[var(--text-primary)]">{c.network_group || '-'} / {c.office_license || '-'}</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em] block mb-1.5">E-mail Corporativo</span>
                    <div className="flex flex-col gap-2 bg-[var(--bg-secondary)] p-3 rounded-xl border border-[var(--border-color)]">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">E-mail:</span>
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate ml-4">{c.email || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Senha:</span>
                        <SecureField encryptedValue={c.email_password} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em] block mb-1.5">Autodesk</span>
                    <SecureField encryptedValue={c.autodesk_credentials} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center justify-between rounded-b-[2rem]">
            <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest">
              <span className="text-[var(--text-primary)]">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-[var(--text-primary)]">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> de <span className="text-[var(--text-primary)]">{filteredData.length}</span>
            </p>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-[10px] font-bold text-[var(--text-primary)] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--bg-secondary)] disabled:opacity-50 transition-colors uppercase tracking-widest"
              >
                Anterior
              </button>
              <div className="flex items-center gap-1">
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-8 h-8 text-[10px] font-bold rounded-lg transition-all ${currentPage === i + 1 ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-md' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-[10px] font-bold text-[var(--text-primary)] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--bg-secondary)] disabled:opacity-50 transition-colors uppercase tracking-widest"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Attribution Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--bg-primary)] w-full max-w-6xl max-h-[90vh] rounded-[2.5rem] border border-[var(--border-color)] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-8 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-secondary)]/30">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <ShieldCheck className="text-[var(--brand-primary)]" size={24} />
                  <h3 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Atribuição de Máquinas em Massa</h3>
                </div>
                <p className="text-sm text-[var(--text-secondary)] font-medium">Vincule colaboradores a workstations de forma rápida e segura.</p>
              </div>
              <button 
                onClick={() => setShowBulkModal(false)}
                className="p-3 hover:bg-[var(--bg-secondary)] rounded-2xl transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              {bulkStep === 1 ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Lado A: Colaboradores */}
                    <div className="flex flex-col h-[500px] bg-[var(--bg-secondary)]/20 rounded-[2rem] border border-[var(--border-color)] overflow-hidden">
                      <div className="p-6 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <CheckSquare size={18} className="text-[var(--brand-primary)]" />
                            Colaboradores sem Máquina
                          </h4>
                          <span className="text-[10px] font-bold bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] px-2 py-1 rounded-full uppercase tracking-widest">
                            {collaborators.filter(c => c.status === 'active' && !c.machine_id).length} Disponíveis
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={14} />
                            <input 
                              type="text"
                              placeholder="Filtrar por nome..."
                              value={bulkCollabSearch}
                              onChange={(e) => setBulkCollabSearch(e.target.value)}
                              className="w-full pl-9 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/10"
                            />
                          </div>
                          <select 
                            value={bulkSectorFilter}
                            onChange={(e) => setBulkSectorFilter(e.target.value)}
                            className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[10px] font-bold outline-none"
                          >
                            <option value="">Todos Setores</option>
                            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {collaborators
                          .filter(c => {
                            const isAvailable = c.status === 'active' && !c.machine_id;
                            const matchesSector = !bulkSectorFilter || c.sector_responsible === bulkSectorFilter;
                            const matchesSearch = !bulkCollabSearch || c.name.toLowerCase().includes(bulkCollabSearch.toLowerCase());
                            return isAvailable && matchesSector && matchesSearch;
                          })
                          .map(c => (
                            <div 
                              key={c.id}
                              onClick={() => {
                                setSelectedCollabs(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                              }}
                              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${selectedCollabs.includes(c.id) ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] shadow-lg shadow-[var(--brand-primary)]/20' : 'bg-[var(--bg-primary)] border-[var(--border-color)] hover:border-[var(--brand-primary)]'}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${selectedCollabs.includes(c.id) ? 'bg-[var(--bg-primary)] border-[var(--bg-primary)] text-[var(--brand-primary)]' : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}`}>
                                  {selectedCollabs.includes(c.id) && <CheckSquare size={14} />}
                                </div>
                                <div>
                                  <p className={`text-sm font-bold ${selectedCollabs.includes(c.id) ? 'text-[var(--bg-primary)]' : 'text-[var(--text-primary)]'}`}>{c.name}</p>
                                  <p className={`text-[10px] font-bold uppercase tracking-wider ${selectedCollabs.includes(c.id) ? 'text-[var(--bg-primary)]/70' : 'text-[var(--text-secondary)]'}`}>{c.sector_responsible}</p>
                                </div>
                              </div>
                              <div className={`text-[10px] font-bold px-2 py-1 rounded-md ${selectedCollabs.includes(c.id) ? 'bg-[var(--bg-primary)]/20 text-[var(--bg-primary)]' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'}`}>
                                {selectedCollabs.indexOf(c.id) !== -1 ? `#${selectedCollabs.indexOf(c.id) + 1}` : 'Selecionar'}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Lado B: Workstations */}
                    <div className="flex flex-col h-[500px] bg-[var(--bg-secondary)]/20 rounded-[2rem] border border-[var(--border-color)] overflow-hidden">
                      <div className="p-6 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <Monitor size={18} className="text-[var(--brand-primary)]" />
                            Workstations Disponíveis
                          </h4>
                          <span className="text-[10px] font-bold bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] px-2 py-1 rounded-full uppercase tracking-widest">
                            {machines.filter(m => !m.assignedTo && m.status !== 'retired' && m.status !== 'deactivated').length} Disponíveis
                          </span>
                        </div>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={14} />
                          <input 
                            type="text"
                            placeholder="Pesquisar hostname (SOL##RAY)..."
                            value={bulkMachineSearch}
                            onChange={(e) => setBulkMachineSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/10"
                          />
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {machines
                          .filter(m => {
                            const isAvailable = !m.assignedTo && m.status !== 'retired' && m.status !== 'deactivated';
                            const matchesSearch = !bulkMachineSearch || m.hostname.toLowerCase().includes(bulkMachineSearch.toLowerCase());
                            return isAvailable && matchesSearch;
                          })
                          .sort((a, b) => a.hostname.localeCompare(b.hostname))
                          .map(m => (
                            <div 
                              key={m.id}
                              onClick={() => {
                                setSelectedMachines(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]);
                              }}
                              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${selectedMachines.includes(m.id) ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] shadow-lg shadow-[var(--brand-primary)]/20' : 'bg-[var(--bg-primary)] border-[var(--border-color)] hover:border-[var(--brand-primary)]'}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${selectedMachines.includes(m.id) ? 'bg-[var(--bg-primary)] border-[var(--bg-primary)] text-[var(--brand-primary)]' : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}`}>
                                  {selectedMachines.includes(m.id) && <CheckSquare size={14} />}
                                </div>
                                <div>
                                  <p className={`text-sm font-bold ${selectedMachines.includes(m.id) ? 'text-[var(--bg-primary)]' : 'text-[var(--text-primary)]'}`}>{m.hostname}</p>
                                  <p className={`text-[10px] font-bold uppercase tracking-wider ${selectedMachines.includes(m.id) ? 'text-[var(--bg-primary)]/70' : 'text-[var(--text-secondary)]'}`}>{m.model} • {m.ipAddress || 'Sem IP'}</p>
                                </div>
                              </div>
                              <div className={`text-[10px] font-bold px-2 py-1 rounded-md ${selectedMachines.includes(m.id) ? 'bg-[var(--bg-primary)]/20 text-[var(--bg-primary)]' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'}`}>
                                {selectedMachines.indexOf(m.id) !== -1 ? `#${selectedMachines.indexOf(m.id) + 1}` : 'Selecionar'}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-[var(--bg-secondary)]/50 p-6 rounded-[2rem] border border-[var(--border-color)]">
                    <div className="flex items-center gap-8">
                      <div>
                        <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Colaboradores</p>
                        <p className="text-xl font-bold text-[var(--text-primary)]">{selectedCollabs.length}</p>
                      </div>
                      <ArrowRight className="text-[var(--text-secondary)]" size={24} />
                      <div>
                        <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Máquinas</p>
                        <p className="text-xl font-bold text-[var(--text-primary)]">{selectedMachines.length}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setBulkStep(2)}
                      disabled={selectedCollabs.length === 0 || selectedMachines.length === 0}
                      className="px-8 py-4 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-2xl font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      Próximo Passo
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto space-y-8">
                  <div className="bg-[var(--bg-secondary)]/30 p-8 rounded-[2.5rem] border border-[var(--border-color)] space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">Justificativa Obrigatória</label>
                      <textarea 
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        placeholder="Explique o motivo desta atribuição em massa..."
                        className="w-full p-4 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/10 min-h-[120px] resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-3">Comprovante de Autorização (PDF/IMG)</label>
                      <div className="relative">
                        <input 
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => setAuthFile(e.target.files?.[0] || null)}
                          className="hidden"
                          id="auth-upload"
                        />
                        <label 
                          htmlFor="auth-upload"
                          className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[var(--border-color)] rounded-[2rem] hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/5 transition-all cursor-pointer group"
                        >
                          <div className="p-4 bg-[var(--bg-secondary)] rounded-2xl mb-4 group-hover:bg-[var(--brand-primary)]/10 transition-colors">
                            <Upload className="text-[var(--text-secondary)] group-hover:text-[var(--brand-primary)]" size={24} />
                          </div>
                          <p className="text-sm font-bold text-[var(--text-primary)]">{authFile ? authFile.name : 'Clique para fazer upload'}</p>
                          <p className="text-[10px] text-[var(--text-secondary)] font-medium mt-1">PDF ou Imagem (Máx 5MB)</p>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-6 bg-[var(--accent-primary)]/5 rounded-2xl border border-[var(--accent-primary)]/20">
                    <AlertCircle className="text-[var(--accent-primary)] shrink-0" size={20} />
                    <p className="text-xs font-medium text-[var(--accent-primary)] leading-relaxed">
                      Esta operação vinculará os colaboradores às máquinas na ordem em que foram selecionados. 
                      Certifique-se de que a quantidade de itens em ambos os lados seja compatível para evitar erros de atribuição.
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setBulkStep(1)}
                      className="flex-1 py-4 bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-2xl font-bold text-sm hover:bg-[var(--border-color)] transition-all"
                    >
                      Voltar
                    </button>
                    <button 
                      onClick={handleBulkLink}
                      disabled={isProcessing || !justification.trim() || !authFile}
                      className="flex-[2] py-4 bg-[var(--brand-primary)] text-[var(--bg-primary)] rounded-2xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-[var(--brand-primary)]/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isProcessing ? (
                        <div className="w-5 h-5 border-2 border-[var(--bg-primary)]/30 border-t-[var(--bg-primary)] rounded-full animate-spin" />
                      ) : (
                        <>
                          <ShieldCheck size={18} />
                          Confirmar Vinculação em Massa
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
