import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Settings as SettingsIcon, 
  Palette, 
  Shield, 
  Activity, 
  User, 
  ChevronRight,
  Monitor,
  Bell,
  Key,
  Database
} from 'lucide-react';
import { SettingsAppearance } from './SettingsAppearance';
import { SettingsSecurity } from './SettingsSecurity';
import { SettingsMonitoring } from './SettingsMonitoring';
import { SettingsProfile } from './SettingsProfile';
import { motion, AnimatePresence } from 'motion/react';

type SettingsTab = 'appearance' | 'security' | 'monitoring' | 'profile';

export const Settings: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  const menuItems = [
    { id: 'appearance', label: 'Aparência', icon: Palette, desc: 'Tema e fontes' },
    { id: 'security', label: 'Segurança', icon: Shield, desc: 'Senhas e acessos' },
    { id: 'monitoring', label: 'Monitoramento', icon: Activity, desc: 'Logs de atividade' },
    { id: 'profile', label: 'Perfil', icon: User, desc: 'Dados e notificações' },
  ] as const;

  const renderContent = () => {
    switch (activeTab) {
      case 'appearance': return <SettingsAppearance />;
      case 'security': return <SettingsSecurity />;
      case 'monitoring': return <SettingsMonitoring />;
      case 'profile': return <SettingsProfile />;
      default: return <SettingsAppearance />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <header className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
          <SettingsIcon size={24} />
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Configurações</h2>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Personalize sua experiência e monitore sua conta.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Menu */}
        <aside className="lg:col-span-3 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all group text-left ${
                  isActive 
                    ? 'shadow-xl' 
                    : 'border hover:bg-opacity-50'
                }`}
                style={{
                  backgroundColor: isActive ? 'var(--btn-primary-bg)' : 'var(--bg-primary)',
                  color: isActive ? 'var(--btn-primary-text)' : 'var(--text-primary)',
                  borderColor: isActive ? 'transparent' : 'var(--border-color)',
                  boxShadow: isActive ? '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' : 'none'
                }}
              >
                <div className={`p-2 rounded-xl transition-colors ${
                  isActive ? '' : 'group-hover:opacity-80'
                }`}
                style={{
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.1)' : 'var(--bg-secondary)',
                  color: isActive ? 'var(--btn-primary-text)' : 'var(--text-secondary)'
                }}>
                  <Icon size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">{item.label}</p>
                  <p className={`text-[10px] uppercase tracking-widest font-bold opacity-60 ${
                    isActive ? '' : ''
                  }`}
                  style={{ color: isActive ? 'var(--btn-primary-text)' : 'var(--text-secondary)' }}>
                    {item.desc}
                  </p>
                </div>
                <ChevronRight size={16} className={`transition-transform ${isActive ? 'translate-x-1' : 'opacity-0 group-hover:opacity-100'}`} />
              </button>
            );
          })}

          {/* Removed Backup do Sistema button */}
        </aside>

        {/* Main Content Area */}
        <main className="lg:col-span-9">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};
