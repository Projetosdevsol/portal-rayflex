import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, where, Timestamp } from 'firebase/firestore';
import { db, formatDate, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  FileText, 
  Download, 
  Calendar, 
  User, 
  Database, 
  AlertTriangle,
  Search,
  ChevronRight,
  Clock
} from 'lucide-react';
import { motion } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const AuditReports: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'user' | 'entity' | 'critical'>('all');
  const [filterValue, setFilterValue] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const { profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading || !profile) return;
    fetchLogs();
  }, [authLoading, profile]);

  const fetchLogs = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'));
      
      // If not super admin, must filter by userId
      if (!profile.role?.includes('super_admin')) {
        q = query(
          collection(db, 'auditLogs'),
          where('userId', '==', profile.uid),
          orderBy('timestamp', 'desc')
        );
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: formatDate(doc.data().timestamp)
      }));
      setLogs(data);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'auditLogs');
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const searchStr = filterValue.toLowerCase();
    const matchesValue = !searchStr || 
      log.userEmail?.toLowerCase().includes(searchStr) ||
      log.entityType?.toLowerCase().includes(searchStr) ||
      log.action?.toLowerCase().includes(searchStr) ||
      log.details?.toLowerCase().includes(searchStr) ||
      log.justification?.toLowerCase().includes(searchStr);

    const matchesType = filterType === 'all' ? matchesValue :
      (filterType === 'user' && log.userEmail?.toLowerCase().includes(searchStr)) ||
      (filterType === 'entity' && log.entityType?.toLowerCase().includes(searchStr)) ||
      (filterType === 'critical' && (log.severity === 'high' || log.severity === 'critical'));
    
    const logDate = log.timestamp;
    const startDate = dateRange.start ? new Date(dateRange.start + 'T00:00:00') : null;
    const endDate = dateRange.end ? new Date(dateRange.end + 'T23:59:59') : null;
    const matchesDate = (!startDate || logDate >= startDate) &&
                        (!endDate || logDate <= endDate);

    return matchesType && matchesDate;
  });

  const exportToExcel = () => {
    const data = filteredLogs.map(log => ({
      Data: format(log.timestamp, 'dd/MM/yyyy HH:mm:ss'),
      Usuário: log.userEmail,
      Ação: log.action,
      Entidade: log.entityType,
      ID: log.entityId,
      Detalhes: log.details,
      Justificativa: log.justification,
      Gravidade: log.severity
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório de Auditoria');
    XLSX.writeFile(workbook, `Relatorio_Auditoria_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Relatório de Auditoria - Solution TI', 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, 14, 22);

    const tableData = filteredLogs.map(log => [
      format(log.timestamp, 'dd/MM/yyyy HH:mm'),
      log.userEmail,
      log.action,
      log.entityType,
      log.severity
    ]);

    (doc as any).autoTable({
      head: [['Data', 'Usuário', 'Ação', 'Entidade', 'Gravidade']],
      body: tableData,
      startY: 30,
    });

    doc.save(`Relatorio_Auditoria_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const exportToJSON = () => {
    const data = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Relatorio_Auditoria_${format(new Date(), 'yyyyMMdd')}.json`;
    link.click();
  };

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Relatórios de Auditoria</h2>
          <p className="mt-1 text-[var(--text-secondary)]">Análise detalhada de todas as ações realizadas no sistema.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportToExcel} className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold transition-all text-xs bg-[var(--bg-secondary)] text-[var(--status-success)] hover:opacity-80">
            <Download size={16} />
            Excel
          </button>
          <button onClick={exportToPDF} className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold transition-all text-xs bg-[var(--bg-secondary)] text-[var(--status-cancelled-text)] hover:opacity-80">
            <FileText size={16} />
            PDF
          </button>
          <button onClick={exportToJSON} className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold transition-all text-xs bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:opacity-80">
            <Database size={16} />
            JSON
          </button>
        </div>
      </header>

      <div className="flex lg:hidden mb-4">
        <button 
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold shadow-sm bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)]"
        >
          <Search size={18} className="text-[var(--accent-primary)]" />
          {isFilterOpen ? 'Ocultar Filtros' : 'Mostrar Filtros'}
          <span className="ml-auto bg-[var(--bg-secondary)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full text-[10px]">
            {filteredLogs.length}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className={`lg:col-span-1 space-y-6 ${isFilterOpen ? 'block' : 'hidden lg:block'}`}>
          <div className="p-6 rounded-3xl shadow-sm space-y-6 bg-[var(--bg-primary)] border border-[var(--border-color)]">
            <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-widest text-[var(--text-primary)]">
              <Search size={16} className="text-[var(--accent-primary)]" />
              Filtros
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Tipo de Filtro</label>
                <select 
                  className="w-full px-4 py-2 rounded-xl outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 text-sm font-medium bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                >
                  <option value="all">Todos os Logs</option>
                  <option value="user">Por Usuário</option>
                  <option value="entity">Por Entidade</option>
                  <option value="critical">Ações Críticas</option>
                </select>
              </div>

              {filterType !== 'critical' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Valor do Filtro</label>
                  <input 
                    type="text"
                    className="w-full px-4 py-2 rounded-xl outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)]"
                    placeholder={filterType === 'all' ? 'Pesquisar em tudo...' : `Filtrar por ${filterType === 'user' ? 'usuário' : 'entidade'}...`}
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Período</label>
                <div className="space-y-2">
                  <input 
                    type="date"
                    className="w-full px-4 py-2 rounded-xl outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)]"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  />
                  <input 
                    type="date"
                    className="w-full px-4 py-2 rounded-xl outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)]"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[var(--brand-primary)] p-6 rounded-3xl text-[var(--bg-primary)] shadow-xl shadow-black/20">
            <h4 className="font-bold text-sm mb-1">Resumo</h4>
            <p className="text-xs opacity-60 mb-4">Mostrando {filteredLogs.length} de {logs.length} registros.</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                <span className="text-[var(--status-cancelled-text)]">Críticos</span>
                <span>{filteredLogs.filter(l => l.severity === 'critical').length}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                <span className="text-[var(--status-warning-text)]">Altos</span>
                <span>{filteredLogs.filter(l => l.severity === 'high').length}</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="w-8 h-8 border-3 border-t-[var(--accent-primary)] rounded-full animate-spin border-[var(--bg-secondary)] border-t-[var(--accent-primary)]" />
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log, index) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  key={log.id}
                  className="p-4 rounded-2xl shadow-sm hover:shadow-md transition-all group bg-[var(--bg-primary)] border border-[var(--border-color)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[var(--bg-secondary)]"
                        style={{ 
                          color: log.severity === 'critical' ? 'var(--status-cancelled-text)' : log.severity === 'high' ? 'var(--status-warning-text)' : 'var(--text-secondary)'
                        }}
                      >
                        {log.severity === 'critical' || log.severity === 'high' ? <AlertTriangle size={20} /> : <Clock size={20} />}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                          <span className="font-bold uppercase text-[10px] tracking-widest text-[var(--text-primary)]">{log.action}</span>
                          <ChevronRight size={12} className="opacity-30 text-[var(--text-secondary)]" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">{log.entityType}</span>
                          <span className="text-[10px] opacity-30 font-mono text-[var(--text-secondary)]">#{log.entityId?.slice(-6)}</span>
                        </div>
                        <p className="text-sm mb-2 leading-relaxed text-[var(--text-primary)]">{log.details}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                          <span className="flex items-center gap-1">
                            <User size={10} />
                            {log.userEmail}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar size={10} />
                            {format(log.timestamp, 'dd/MM/yyyy HH:mm')}
                          </span>
                        </div>
                      </div>
                    </div>
                    {log.justification && (
                      <div className="hidden md:block max-w-[150px] text-right">
                        <p className="text-[9px] font-bold opacity-30 uppercase mb-1 text-[var(--text-secondary)]">Justificativa</p>
                        <p className="text-[10px] italic opacity-60 line-clamp-2 text-[var(--text-secondary)]" title={log.justification}>
                          "{log.justification}"
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {filteredLogs.length === 0 && (
                <div className="rounded-3xl p-12 text-center border-2 border-dashed bg-[var(--bg-secondary)] border-[var(--border-color)]">
                  <Search className="w-12 h-12 opacity-10 mx-auto mb-4 text-[var(--text-secondary)]" />
                  <p className="font-medium text-[var(--text-secondary)]">Nenhum registro encontrado com os filtros atuais.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
