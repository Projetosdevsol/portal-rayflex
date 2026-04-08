import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  Cell
} from 'recharts';
import { motion } from 'motion/react';
import { FileText, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface SectorData {
  sector: string;
  machines: number;
  collaborators: number;
}

const COLORS = ['#D30A11', '#333333', '#666666', '#999999', '#CCCCCC', '#FF5722', '#4CAF50', '#2196F3', '#FFC107', '#9C27B0'];

export const Reports: React.FC = () => {
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !profile) return;

    let machinesData: any[] = [];
    let collaboratorsData: any[] = [];
    let machinesLoaded = false;
    let collaboratorsLoaded = false;

    const processData = () => {
      if (!machinesLoaded || !collaboratorsLoaded) return;

      const sectorMap: Record<string, SectorData> = {};

      // Process Collaborators
      collaboratorsData.forEach(collab => {
        const sector = collab.allocation_sector || collab.sector_responsible || 'Não Definido';
        if (!sectorMap[sector]) {
          sectorMap[sector] = { sector, machines: 0, collaborators: 0 };
        }
        sectorMap[sector].collaborators += 1;
      });

      // Process Machines (matching by collaborator_id if possible, or we can just count machines assigned to collaborators in those sectors)
      // Since machines have 'assignedTo' (collaborator ID), we can map machine -> collaborator -> sector
      // Let's build a collaborator ID to sector map first
      const collabSectorMap: Record<string, string> = {};
      collaboratorsData.forEach(collab => {
        const sector = collab.allocation_sector || collab.sector_responsible || 'Não Definido';
        collabSectorMap[collab.id] = sector;
      });

      machinesData.forEach(machine => {
        let sector = 'Não Definido';
        if (machine.assignedTo && collabSectorMap[machine.assignedTo]) {
          sector = collabSectorMap[machine.assignedTo];
        } else if (machine.collaborator_id && collabSectorMap[machine.collaborator_id]) {
          sector = collabSectorMap[machine.collaborator_id];
        }
        
        if (!sectorMap[sector]) {
          sectorMap[sector] = { sector, machines: 0, collaborators: 0 };
        }
        sectorMap[sector].machines += 1;
      });

      const finalData = Object.values(sectorMap).sort((a, b) => b.collaborators - a.collaborators);
      setData(finalData);
      setLoading(false);
    };

    const unsubMachines = onSnapshot(collection(db, 'machines'), (snapshot) => {
      machinesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      machinesLoaded = true;
      processData();
    });

    const unsubCollaborators = onSnapshot(collection(db, 'collaborators'), (snapshot) => {
      collaboratorsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      collaboratorsLoaded = true;
      processData();
    });

    return () => {
      unsubMachines();
      unsubCollaborators();
    };
  }, [authLoading, profile]);

  const exportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatório: Máquinas e Colaboradores por Setor', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 30);

    const tableColumn = ["Setor", "Colaboradores", "Máquinas", "Total"];
    const tableRows = data.map(item => [
      item.sector,
      item.collaborators.toString(),
      item.machines.toString(),
      (item.collaborators + item.machines).toString()
    ]);

    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [211, 10, 17], textColor: 255, fontStyle: 'bold' },
    });

    doc.save('relatorio_setores.pdf');
  };

  const exportExcel = () => {
    const exportData = data.map(item => ({
      'Setor': item.sector,
      'Colaboradores': item.collaborators,
      'Máquinas': item.machines,
      'Total': item.collaborators + item.machines
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Setores");
    XLSX.writeFile(wb, "relatorio_setores.xlsx");
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-3 rounded-xl border shadow-lg" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
          <p className="font-bold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{label}</p>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--bg-secondary)', borderTopColor: 'var(--brand-primary)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Relatórios</h2>
          <p className="text-sm mt-1 font-medium" style={{ color: 'var(--text-secondary)' }}>Análise de distribuição de máquinas e colaboradores por setor.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={exportPDF}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors border font-bold text-sm hover:bg-[var(--bg-secondary)]"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <FileText size={18} className="text-[var(--accent-primary)]" />
            Exportar PDF
          </button>
          <button 
            onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors border font-bold text-sm hover:bg-[var(--bg-secondary)]"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            <Download size={18} className="text-[var(--status-success)]" />
            Exportar Excel
          </button>
        </div>
      </header>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-3xl border shadow-sm"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
      >
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)]" />
          Gráfico: Máquinas e Colaboradores por Setor
        </h3>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
              <XAxis 
                dataKey="sector" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }} 
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="top" 
                height={36} 
                iconType="circle"
                wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
              />
              <Bar dataKey="collaborators" name="Colaboradores" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} barSize={30} />
              <Bar dataKey="machines" name="Máquinas" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} barSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-3xl border shadow-sm overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
      >
        <div className="p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-3" style={{ color: 'var(--text-secondary)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--status-info)]" />
            Tabela de Dados
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>Setor</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-center" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>Colaboradores</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-center" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>Máquinas</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-center" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr key={index} className="transition-colors hover:bg-[var(--bg-secondary)]" style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td className="p-4 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{row.sector}</td>
                  <td className="p-4 text-sm font-medium text-center" style={{ color: 'var(--text-secondary)' }}>
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                      {row.collaborators}
                    </span>
                  </td>
                  <td className="p-4 text-sm font-medium text-center" style={{ color: 'var(--text-secondary)' }}>
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]">
                      {row.machines}
                    </span>
                  </td>
                  <td className="p-4 text-sm font-bold text-center" style={{ color: 'var(--text-primary)' }}>
                    {row.collaborators + row.machines}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Nenhum dado encontrado.
                  </td>
                </tr>
              )}
            </tbody>
            {data.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <td className="p-4 text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>Total Geral</td>
                  <td className="p-4 text-sm font-bold text-center" style={{ color: 'var(--text-primary)' }}>
                    {data.reduce((acc, curr) => acc + curr.collaborators, 0)}
                  </td>
                  <td className="p-4 text-sm font-bold text-center" style={{ color: 'var(--text-primary)' }}>
                    {data.reduce((acc, curr) => acc + curr.machines, 0)}
                  </td>
                  <td className="p-4 text-sm font-bold text-center" style={{ color: 'var(--text-primary)' }}>
                    {data.reduce((acc, curr) => acc + curr.collaborators + curr.machines, 0)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </motion.div>
    </div>
  );
};
