import React from 'react';
import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { auth, db } from './firebase';
import { doc, getDocFromServer } from 'firebase/firestore';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { AssetList } from './components/AssetList';
import { CollaboratorDetails } from './components/CollaboratorDetails';
import { AuditReports } from './components/AuditReports';
import { UserManagement } from './components/UserManagement';
import { Controle } from './components/Controle';
import { TaskList } from './components/TaskList';
import { Settings } from './components/Settings';
import { Reports } from './components/Reports';
import { ErrorBoundary } from './components/ErrorBoundary';
import { 
  Users, 
  Monitor, 
  Server, 
  Printer, 
  Key,
  CheckSquare
} from 'lucide-react';
import blueprint from '../firebase-blueprint.json';

const ProtectedRoute = ({ children, superAdminOnly = false }: { children: React.ReactNode, superAdminOnly?: boolean }) => {
  const { user, loading, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div className="w-12 h-12 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--bg-primary)', borderTopColor: 'var(--brand-primary)' }} />
      </div>
    );
  }

  if (!user) return <Navigate to="/" />;
  if (superAdminOnly && !isSuperAdmin) return <Navigate to="/dashboard" />;

  return <Layout>{children}</Layout>;
};

const AppContent = () => {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />

      <Route path="/collaborators" element={
        <ProtectedRoute>
          <AssetList 
            collectionName="collaborators" 
            title="Colaboradores" 
            icon={Users}
            schema={blueprint.entities.collaborator}
            columns={[
              { key: 'name', label: 'Usuário', render: (val, item) => <Link to={`/collaborators/${item.id}`} className="font-bold whitespace-nowrap" style={{ color: 'var(--brand-primary)' }}>{val}</Link> },
              { key: 'login', label: 'Login' },
              { key: 'email', label: 'E-mail' },
              { key: 'aliases', label: 'Aliases' },
              { key: 'email_password', label: 'Senha E-mail' },
              { key: 'sector_responsible', label: 'Setor/Responsável' },
              { key: 'allocation_sector', label: 'Setor Alocado' },
              { key: 'status', label: 'Status', render: (val) => (
                <span 
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase"
                  style={{ 
                    backgroundColor: 'var(--bg-secondary)',
                    color: val === 'active' ? 'var(--status-success)' : val === 'deactivated' ? 'var(--status-cancelled-text)' : 'var(--text-secondary)'
                  }}
                >
                  {val === 'active' ? 'Ativado' : 'Desativado'}
                </span>
              )}
            ]}
          />
        </ProtectedRoute>
      } />

      <Route path="/collaborators/:id" element={
        <ProtectedRoute>
          <CollaboratorDetails />
        </ProtectedRoute>
      } />

      <Route path="/machines" element={
        <ProtectedRoute>
          <AssetList 
            collectionName="machines" 
            title="Máquinas" 
            icon={Monitor}
            schema={blueprint.entities.machine}
            columns={[
              { key: 'hostname', label: 'Hostname', render: (val) => <span className="font-mono font-bold" style={{ color: 'var(--brand-primary)' }}>{val}</span> },
              { key: 'collaborator_id', label: 'Colaborador' },
              { key: 'invoiceNumber', label: 'Número NF' },
              { key: 'danfeKey', label: 'Chave Danfe' },
              { key: 'serialNumber', label: 'Número de Série' },
              { key: 'biosDate', label: 'Data da BIOS' },
              { key: 'os_license', label: 'Licença SO' },
              { key: 'location', label: 'Local' },
              { key: 'processor', label: 'Processador' },
              { key: 'memory', label: 'Memória' },
              { key: 'disk', label: 'Disco' },
              { key: 'ups', label: 'Nobreak?' },
              { key: 'activated', label: 'Ativada?' },
              { key: 'usb_enabled', label: 'USB?' },
              { key: 'unit', label: 'Unidade' },
              { key: 'status', label: 'Status', render: (val) => (
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ 
                      backgroundColor: val === 'available' ? 'var(--status-success)' : val === 'in-use' ? 'var(--status-info)' : val === 'maintenance' ? 'var(--status-warning)' : val === 'deactivated' ? 'var(--status-cancelled-text)' : 'var(--text-secondary)'
                    }}
                  />
                  <span 
                    className="text-[10px] font-bold uppercase"
                    style={{ 
                      color: 'var(--text-primary)'
                    }}
                  >
                    {val === 'available' ? 'Ativado' : 
                     val === 'in-use' ? 'em uso' : 
                     val === 'maintenance' ? 'manutenção' : 
                     'Desativado'}
                  </span>
                </div>
              )}
            ]}
          />
        </ProtectedRoute>
      } />

      <Route path="/servers" element={
        <ProtectedRoute>
          <AssetList 
            collectionName="servers" 
            title="Servidores" 
            icon={Server}
            schema={blueprint.entities.server}
            columns={[
              { key: 'machine_id', label: 'Máquina Associada', render: (val) => <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{val}</span> },
              { key: 'brand_model', label: 'Marca/Modelo' },
              { key: 'configuration', label: 'Configuração' },
              { key: 'programs', label: 'Programas' },
              { key: 'cals', label: 'CALs' },
              { key: 'storage', label: 'Armazenamento' },
              { key: 'application', label: 'Aplicação' },
              { key: 'bios_date', label: 'Data BIOS' },
              { key: 'status', label: 'Status', render: (val) => (
                <span 
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase"
                  style={{ 
                    backgroundColor: 'var(--bg-secondary)',
                    color: val === 'online' ? 'var(--status-success)' : val === 'offline' ? 'var(--status-cancelled-text)' : 'var(--status-warning)'
                  }}
                >
                  {val === 'online' ? 'Ativado' : val === 'offline' ? 'Desativado' : 'manutenção'}
                </span>
              )}
            ]}
          />
        </ProtectedRoute>
      } />

      <Route path="/printers" element={
        <ProtectedRoute>
          <AssetList 
            collectionName="printers" 
            title="Impressoras" 
            icon={Printer}
            schema={blueprint.entities.printer}
            columns={[
              { key: 'brand', label: 'Marca' },
              { key: 'model', label: 'Modelo' },
              { key: 'connectionType', label: 'Tipo de Conexão' },
              { key: 'ipAddress', label: 'Endereço IP/Compartilhamento' },
              { key: 'location', label: 'Localização' },
              { key: 'nextMaintenanceDate', label: 'Próxima Manutenção' },
              { key: 'status', label: 'Status' }
            ]}
          />
        </ProtectedRoute>
      } />

      <Route path="/licenses" element={
        <ProtectedRoute>
          <AssetList 
            collectionName="licenses" 
            title="Licenças de Software" 
            icon={Key}
            schema={blueprint.entities.license}
            columns={[
              { key: 'softwareName', label: 'Software', render: (val) => <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{val}</span> },
              { key: 'assignedUserIds', label: 'Usuários' },
              { key: 'quantity', label: 'Total' },
              { key: 'used', label: 'Em uso' },
              { key: 'expirationDate', label: 'Expira em' }
            ]}
          />
        </ProtectedRoute>
      } />

      <Route path="/controle" element={
        <ProtectedRoute>
          <Controle />
        </ProtectedRoute>
      } />

      <Route path="/audit-reports" element={
        <ProtectedRoute superAdminOnly>
          <AuditReports />
        </ProtectedRoute>
      } />

      <Route path="/users" element={
        <ProtectedRoute superAdminOnly>
          <UserManagement />
        </ProtectedRoute>
      } />

      <Route path="/tasks" element={
        <ProtectedRoute superAdminOnly>
          <TaskList />
        </ProtectedRoute>
      } />

      <Route path="/reports" element={
        <ProtectedRoute>
          <Reports />
        </ProtectedRoute>
      } />

      <Route path="/settings" element={
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

// Test connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

const App = () => {
  return (
    <HashRouter>
      <ErrorBoundary>
        <AuthProvider>
          <DataProvider>
            <AppContent />
          </DataProvider>
        </AuthProvider>
      </ErrorBoundary>
    </HashRouter>
  );
};

export default App;
