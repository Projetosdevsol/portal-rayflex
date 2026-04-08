import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Activity, 
  Search, 
  Filter, 
  Download, 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  Calendar,
  Eye,
  X,
  ShieldAlert,
  RefreshCw
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  startAfter, 
  Timestamp 
} from 'firebase/firestore';
import { db, formatDate, handleFirestoreError, OperationType } from '../firebase';
import { AuditLog } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export const SettingsMonitoring: React.FC = () => {
  const { profile, isSuperAdmin } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async (isNext = false) => {
    if (!profile) return;
    setLoading(true);

    try {
      let q = query(
        collection(db, 'auditLogs'),
        orderBy('timestamp', 'desc'),
        limit(20)
      );

      // If not super admin, only show their own logs
      if (!isSuperAdmin) {
        q = query(
          collection(db, 'auditLogs'),
          where('userId', '==', profile.uid),
          orderBy('timestamp', 'desc'),
          limit(20)
        );
      }

      if (isNext && lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      const newLogs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: formatDate(doc.data().timestamp).toISOString()
      })) as AuditLog[];

      if (isNext) {
        setLogs(prev => [...prev, ...newLogs]);
      } else {
        setLogs(newLogs);
      }

      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 20);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'auditLogs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [profile, isSuperAdmin]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.userEmail?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (log.entityId?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (log.details?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    
    return matchesSearch && matchesAction;
  });

  const exportToExcel = () => {
    const data = filteredLogs.map(log => ({
      'Data/Hora': format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm:ss'),
      'Usuário': log.userEmail,
      'Ação': log.action.toUpperCase(),
      'Entidade': log.entityType,
      'ID Entidade': log.entityId,
      'Detalhes': log.details || '',
      'IP': log.ipAddress || 'N/A'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Logs');
    XLSX.writeFile(wb, `Audit_Logs_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Relatório de Auditoria de Atividades', 14, 15);
    
    const tableData = filteredLogs.map(log => [
      format(new Date(log.timestamp), 'dd/MM HH:mm'),
      log.action.toUpperCase(),
      log.entityType,
      log.entityId,
      log.ipAddress || 'N/A'
    ]);

    doc.autoTable({
      head: [['Data', 'Ação', 'Entidade', 'ID', 'IP']],
      body: tableData,
      startY: 20,
      theme: 'grid',
      styles: { fontSize: 8 }
    });

    doc.save(`Audit_Logs_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Activity className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
          {isSuperAdmin ? 'Auditoria do Sistema' : 'Meus Logs de Atividade'}
        </h3>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-colors text-xs font-bold border"
            style={{ backgroundColor: 'var(--status-completed-bg)', color: 'var(--status-completed-text)', borderColor: 'var(--status-completed-text)' }}
          >
            <Download size={16} />
            Excel
          </button>
          <button 
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-colors text-xs font-bold border"
            style={{ backgroundColor: 'var(--status-cancelled-bg)', color: 'var(--status-cancelled-text)', borderColor: 'var(--status-cancelled-text)' }}
          >
            <FileText size={16} />
            PDF
          </button>
        </div>
      </div>

      <div className="rounded-3xl border overflow-hidden shadow-sm" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
        <div className="p-4 border-b flex flex-col md:flex-row items-center gap-4" style={{ borderColor: 'var(--border-color)' }}>
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar logs..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl outline-none transition-all text-sm"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter style={{ color: 'var(--text-secondary)' }} size={18} />
            <select 
              className="flex-1 md:flex-none px-4 py-2.5 rounded-xl outline-none text-sm font-bold"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            >
              <option value="all">Todas as Ações</option>
              <option value="create">Criação</option>
              <option value="update">Atualização</option>
              <option value="delete">Exclusão</option>
              <option value="login">Login</option>
              <option value="export">Exportação</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Data/Hora</th>
                {isSuperAdmin && <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Usuário</th>}
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Ação</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Entidade</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>IP</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-right" style={{ color: 'var(--text-secondary)' }}>Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="transition-colors group" style={{ borderBottomColor: 'var(--border-color)' }}>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        {format(new Date(log.timestamp), 'dd/MM/yyyy')}
                      </span>
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {format(new Date(log.timestamp), 'HH:mm:ss')}
                      </span>
                    </div>
                  </td>
                  {isSuperAdmin && (
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{log.userEmail}</span>
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border`}
                          style={{ 
                            backgroundColor: log.action === 'create' ? 'var(--status-completed-bg)' :
                                            log.action === 'update' ? 'var(--status-active-bg)' :
                                            log.action === 'delete' ? 'var(--status-cancelled-bg)' :
                                            'var(--bg-secondary)',
                            color: log.action === 'create' ? 'var(--status-completed-text)' :
                                   log.action === 'update' ? 'var(--status-active-text)' :
                                   log.action === 'delete' ? 'var(--status-cancelled-text)' :
                                   'var(--text-secondary)',
                            borderColor: log.action === 'create' ? 'var(--status-completed-text)' :
                                         log.action === 'update' ? 'var(--status-active-text)' :
                                         log.action === 'delete' ? 'var(--status-cancelled-text)' :
                                         'var(--border-color)'
                          }}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>{log.entityType}</span>
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>{log.entityId}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>{log.ipAddress || 'N/A'}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setSelectedLog(log)}
                      className="p-2 rounded-lg transition-all"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="p-4 border-t text-center" style={{ borderColor: 'var(--border-color)' }}>
            <button 
              onClick={() => fetchLogs(true)}
              disabled={loading}
              className="text-xs font-bold flex items-center justify-center gap-2 mx-auto transition-colors"
              style={{ color: 'var(--accent-primary)' }}
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4 rotate-90" />}
              Carregar mais logs
            </button>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[var(--ink)]/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <div className="p-8 border-b flex items-center justify-between" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}>
                  <Activity size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Detalhes da Atividade</h2>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>ID: {selectedLog.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-3 rounded-2xl transition-colors shadow-sm"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Ação</p>
                  <p className="text-sm font-bold uppercase" style={{ color: 'var(--text-primary)' }}>{selectedLog.action}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Data/Hora</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{format(new Date(selectedLog.timestamp), 'dd/MM/yyyy HH:mm:ss')}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Entidade</p>
                  <p className="text-sm font-bold uppercase" style={{ color: 'var(--text-primary)' }}>{selectedLog.entityType} ({selectedLog.entityId})</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>IP de Origem</p>
                  <p className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{selectedLog.ipAddress || 'N/A'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Detalhes</p>
                <div className="p-4 rounded-xl border text-sm" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                  {selectedLog.details || 'Sem detalhes adicionais.'}
                </div>
              </div>

              {(selectedLog.before || selectedLog.after) && (
                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Alterações de Dados</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-center" style={{ color: 'var(--text-secondary)' }}>Antes</p>
                      <pre className="p-4 rounded-xl text-[10px] font-mono overflow-auto max-h-40" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                        {selectedLog.before ? JSON.stringify(selectedLog.before, null, 2) : 'Nenhum dado'}
                      </pre>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-center" style={{ color: 'var(--text-secondary)' }}>Depois</p>
                      <pre className="p-4 rounded-xl text-[10px] font-mono overflow-auto max-h-40 border" style={{ backgroundColor: 'var(--status-completed-bg)', color: 'var(--status-completed-text)', borderColor: 'var(--status-completed-text)' }}>
                        {selectedLog.after ? JSON.stringify(selectedLog.after, null, 2) : 'Nenhum dado'}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>User Agent</p>
                <p className="text-[10px] font-mono break-all" style={{ color: 'var(--text-secondary)' }}>{selectedLog.userAgent || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
