import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Building, Bell, Save, CheckCircle2, RefreshCw } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const SettingsProfile: React.FC = () => {
  const { profile, updatePreferences } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [sector, setSector] = useState(profile?.sector || '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const notifications = profile?.preferences?.notifications || {
    email: true,
    browser: true,
    system: true
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);
    setSuccess(false);

    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName,
        sector
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleNotification = (key: keyof typeof notifications) => {
    updatePreferences({
      notifications: {
        ...notifications,
        [key]: !notifications[key]
      }
    });
  };

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <User className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
          Dados Pessoais
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Mantenha suas informações de contato atualizadas.</p>
        
        <form onSubmit={handleUpdateProfile} className="p-8 rounded-3xl border space-y-6" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
          {success && (
            <div className="p-4 rounded-xl flex items-center gap-3 text-sm font-medium" style={{ backgroundColor: 'var(--status-completed-bg)', color: 'var(--status-completed-text)', border: '1px solid var(--status-completed-text)' }}>
              <CheckCircle2 size={18} />
              Perfil atualizado com sucesso!
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest ml-1" style={{ color: 'var(--text-secondary)' }}>Nome Completo</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl outline-none transition-all"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  placeholder="Seu nome"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest ml-1" style={{ color: 'var(--text-secondary)' }}>E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-secondary)' }} />
                <input
                  type="email"
                  disabled
                  value={profile?.email || ''}
                  className="w-full pl-10 pr-4 py-3 rounded-xl cursor-not-allowed"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', opacity: 0.7 }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest ml-1" style={{ color: 'var(--text-secondary)' }}>Setor</label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl outline-none transition-all"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  placeholder="Ex: TI, RH, Financeiro"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full sm:w-auto px-8 py-3 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Salvar Alterações
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Bell className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
          Preferências de Notificação
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Escolha como você deseja receber alertas do sistema.</p>
        
        <div className="rounded-3xl border divide-y divide-[var(--border-color)]" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
          {[
            { key: 'email', label: 'Notificações por E-mail', desc: 'Receba alertas importantes diretamente na sua caixa de entrada.' },
            { key: 'browser', label: 'Notificações no Navegador', desc: 'Alertas em tempo real enquanto você navega no sistema.' },
            { key: 'system', label: 'Alertas do Sistema', desc: 'Notificações internas sobre vencimentos e manutenções.' },
          ].map((item) => (
            <div key={item.key} className="p-6 flex items-center justify-between gap-4" style={{ borderColor: 'var(--border-color)' }}>
              <div className="space-y-1">
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
              </div>
              
              <button
                onClick={() => handleToggleNotification(item.key as any)}
                className={`relative w-12 h-6 rounded-full transition-colors`}
                style={{ backgroundColor: notifications[item.key as keyof typeof notifications] ? 'var(--accent-primary)' : 'var(--border-color)' }}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                  notifications[item.key as keyof typeof notifications] ? 'left-7' : 'left-1'
                }`} style={{ backgroundColor: 'var(--bg-primary)' }} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
