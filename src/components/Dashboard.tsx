import React, { useEffect, useState } from 'react';
import { collection, query, limit, orderBy, onSnapshot } from 'firebase/firestore';
import { db, formatDate, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Monitor, 
  Server, 
  Printer, 
  Key, 
  Users,
  Clock,
  Activity,
  HardDrive,
  Cpu
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';
import { motion } from 'motion/react';

const StatCard = ({ title, value, icon: Icon, color, delay }: { title: string, value: number | string, icon: any, color: string, delay: number }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="p-6 rounded-2xl border flex items-center gap-5 transition-all group"
    style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
  >
    <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center text-white shadow-sm group-hover:scale-110 transition-transform`}>
      <Icon size={22} />
    </div>
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--text-secondary)' }}>{title}</p>
      <h3 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{value}</h3>
    </div>
  </motion.div>
);

// Helper for colors
const COLORS = ['#D30A11', '#333333', '#666666', '#999999', '#CCCCCC', '#FF5722', '#4CAF50', '#2196F3', '#FFC107', '#9C27B0'];

export const Dashboard: React.FC = () => {
  const { isSuperAdmin, profile, loading: authLoading } = useAuth();
  const [stats, setStats] = useState({
    machines: 0,
    servers: 0,
    printers: 0,
    licenses: 0,
    collaborators: 0
  });
  
  const [detailedStats, setDetailedStats] = useState({
    machinesByOS: [] as any[],
    machinesByStatus: [] as any[],
    collaboratorsBySector: [] as any[],
    licensesUsage: [] as any[],
  });

  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !profile) return;

    const fetchStats = () => {
      const collections = ['machines', 'servers', 'printers', 'licenses', 'collaborators'];
      const unsubscribes = collections.map((c, index) => {
        return onSnapshot(collection(db, c), (snapshot) => {
          
          // Process detailed stats
          if (c === 'machines') {
            const osCounts: Record<string, number> = {};
            const statusCounts: Record<string, number> = {};
            
            const statusMap: Record<string, string> = {
              'available': 'Disponível',
              'in-use': 'Em Uso',
              'maintenance': 'Manutenção',
              'retired': 'Aposentado',
              'deactivated': 'Desativado'
            };

            snapshot.docs.forEach(doc => {
              const data = doc.data();
              const os = data.os || 'Outro';
              osCounts[os] = (osCounts[os] || 0) + 1;
              
              const status = statusMap[data.status] || data.status || 'Desconhecido';
              statusCounts[status] = (statusCounts[status] || 0) + 1;
            });

            setDetailedStats(prev => ({
              ...prev,
              machinesByOS: Object.entries(osCounts).map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] })),
              machinesByStatus: Object.entries(statusCounts).map(([name, value], i) => ({ name, value, color: COLORS[(i + 4) % COLORS.length] }))
            }));
          }

          if (c === 'collaborators') {
            const sectorCounts: Record<string, number> = {};
            snapshot.docs.forEach(doc => {
              const data = doc.data();
              const sector = data.allocation_sector || data.sector_responsible || 'Não Definido';
              sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
            });
            
            const sortedSectors = Object.entries(sectorCounts)
              .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 5); // Top 5 sectors

            setDetailedStats(prev => ({ ...prev, collaboratorsBySector: sortedSectors }));
          }

          if (c === 'licenses') {
            const licenses = snapshot.docs.map(doc => {
              const data = doc.data();
              return {
                name: data.softwareName || 'Desconhecido',
                total: Number(data.quantity) || 0,
                used: Number(data.used) || 0
              };
            }).sort((a, b) => b.used - a.used).slice(0, 5); // Top 5 most used licenses

            setDetailedStats(prev => ({ ...prev, licensesUsage: licenses }));
          }

          setStats(prev => ({
            ...prev,
            [c]: snapshot.size
          }));
          
          if (index === collections.length - 1) setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, c);
          if (index === collections.length - 1) setLoading(false);
        });
      });
      return () => {
        unsubscribes.forEach(unsub => unsub());
      };
    };

    const unsubStats = fetchStats();

    let unsubscribeLogs: () => void;
    if (isSuperAdmin) {
      const logsQuery = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(5));
      unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: formatDate(doc.data().timestamp)
        }));
        setRecentLogs(logs);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'auditLogs');
      });
    }

    return () => {
      unsubStats();
      if (unsubscribeLogs) unsubscribeLogs();
    };
  }, [isSuperAdmin, authLoading, profile]);

  const chartData = [
    { name: 'Máquinas', value: stats.machines, color: 'var(--accent-primary)' },
    { name: 'Servidores', value: stats.servers, color: 'var(--brand-primary)' },
    { name: 'Impressoras', value: stats.printers, color: '#666666' },
    { name: 'Licenças', value: stats.licenses, color: '#999999' },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-3 rounded-xl border shadow-lg" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
          <p className="font-bold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{label || payload[0].name}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
              {entry.name}: <span style={{ color: 'var(--text-primary)' }}>{entry.value}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Visão Geral</h2>
          <p className="text-sm mt-1 font-medium" style={{ color: 'var(--text-secondary)' }}>Mapping completo e status em tempo real da infraestrutura Solution.</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
          <div className="w-2 h-2 rounded-full bg-[var(--status-success)] animate-pulse" />
          Sistema Online
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard title="Máquinas" value={stats.machines} icon={Monitor} color="bg-[var(--accent-primary)]" delay={0.1} />
        <StatCard title="Servidores" value={stats.servers} icon={Server} color="bg-[var(--brand-primary)]" delay={0.2} />
        <StatCard title="Impressoras" value={stats.printers} icon={Printer} color="bg-[var(--text-secondary)]" delay={0.3} />
        <StatCard title="Licenças" value={stats.licenses} icon={Key} color="bg-[var(--text-secondary)] opacity-80" delay={0.4} />
        <StatCard title="Colaboradores" value={stats.collaborators} icon={Users} color="bg-[var(--text-secondary)] opacity-60" delay={0.5} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribuição de Ativos */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="p-6 rounded-3xl border h-[350px] flex flex-col shadow-sm"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        >
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
            Distribuição de Ativos
          </h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Máquinas por Sistema Operacional */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="p-6 rounded-3xl border h-[350px] flex flex-col shadow-sm"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        >
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)]" />
            Sistemas Operacionais (Máquinas)
          </h3>
          <div className="flex-1 flex items-center justify-center min-h-0">
             <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={detailedStats.machinesByOS}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {detailedStats.machinesByOS.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  verticalAlign="bottom" 
                  height={36} 
                  iconType="circle"
                  wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Status das Máquinas */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="p-6 rounded-3xl border h-[350px] flex flex-col shadow-sm"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        >
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--status-info)]" />
            Status das Máquinas
          </h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={detailedStats.machinesByStatus} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                  {detailedStats.machinesByStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Colaboradores por Setor */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="p-6 rounded-3xl border h-[350px] flex flex-col shadow-sm"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        >
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--status-warning)]" />
            Top 5 Setores (Colaboradores)
          </h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={detailedStats.collaboratorsBySector} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={30}>
                  {detailedStats.collaboratorsBySector.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Uso de Licenças */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="p-6 rounded-3xl border h-[350px] flex flex-col shadow-sm lg:col-span-2"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        >
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--status-success)]" />
            Utilização de Licenças (Top 5)
          </h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={detailedStats.licensesUsage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  verticalAlign="top" 
                  height={36} 
                  iconType="circle"
                  wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                />
                <Bar dataKey="total" name="Total Disponível" fill="var(--text-secondary)" radius={[4, 4, 0, 0]} barSize={20} opacity={0.5} />
                <Bar dataKey="used" name="Em Uso" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {isSuperAdmin && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
          className="p-8 rounded-[2rem] border shadow-sm"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
              Atividades Recentes
            </h3>
            <button className="text-[10px] font-bold hover:text-[var(--accent-primary)] transition-colors uppercase tracking-widest border-b-2 pb-0.5" style={{ color: 'var(--brand-primary)', borderColor: 'var(--brand-primary)' }}>Ver Tudo</button>
          </div>
          <div className="space-y-4">
            {recentLogs.map((log) => (
              <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl border transition-all gap-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                <div className="flex items-center gap-5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm`} style={{ 
                    backgroundColor: log.severity === 'critical' ? 'var(--status-cancelled-bg)' : 'var(--bg-primary)', 
                    color: log.severity === 'critical' ? 'var(--status-cancelled-text)' : 'var(--text-secondary)', 
                    borderColor: log.severity === 'critical' ? 'var(--status-cancelled-text)' : 'var(--border-color)' 
                  }}>
                    <Clock size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>
                      {log.action} <span className="opacity-30 mx-2" style={{ color: 'var(--text-secondary)' }}>/</span> {log.entityType}
                    </p>
                    <p className="text-[10px] font-medium mt-1 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{log.userEmail} • {format(log.timestamp, 'HH:mm', { locale: ptBR })}</p>
                  </div>
                </div>
                <div className="sm:text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)' }}>
                    {format(log.timestamp, 'dd MMM yyyy', { locale: ptBR })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

