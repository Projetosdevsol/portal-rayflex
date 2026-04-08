import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Key, Clock, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { addDays, format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const SettingsSecurity: React.FC = () => {
  const { profile, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordStatus = profile?.passwordStatus || {
    lastChanged: new Date().toISOString(),
    expiresAt: addDays(new Date(), 90).toISOString(),
    mustChange: false
  };

  const daysUntilExpiry = differenceInDays(parseISO(passwordStatus.expiresAt), new Date());

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    // Password strength check
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
    const isLongEnough = newPassword.length >= 8;

    if (!hasUpper || !hasNumber || !hasSpecial || !isLongEnough) {
      setError('A senha deve ter pelo menos 8 caracteres, uma letra maiúscula, um número e um caractere especial.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Reauthenticate
      const credential = EmailAuthProvider.credential(user.email!, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Update password
      await updatePassword(user, newPassword);
      
      // Update status in Firestore
      const newStatus = {
        lastChanged: new Date().toISOString(),
        expiresAt: addDays(new Date(), 90).toISOString(),
        mustChange: false
      };
      
      await updateDoc(doc(db, 'users', user.uid), {
        passwordStatus: newStatus
      });

      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/wrong-password') {
        setError('Senha atual incorreta.');
      } else {
        setError('Erro ao alterar senha. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Password Status Card */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Shield className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
          Status da Senha
        </h3>
        
        <div className="p-6 rounded-3xl border grid grid-cols-1 md:grid-cols-2 gap-6" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                <Clock size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Última troca</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {format(parseISO(passwordStatus.lastChanged), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center`}
                   style={{ 
                     backgroundColor: daysUntilExpiry < 7 ? 'var(--status-cancelled-bg)' : 'var(--status-completed-bg)',
                     color: daysUntilExpiry < 7 ? 'var(--status-cancelled-text)' : 'var(--status-completed-text)'
                   }}>
                <AlertCircle size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Vencimento</p>
                <p className={`text-sm font-bold`} style={{ color: daysUntilExpiry < 7 ? 'var(--status-cancelled-text)' : 'var(--text-primary)' }}>
                  Em {daysUntilExpiry} dias ({format(parseISO(passwordStatus.expiresAt), "dd/MM/yyyy")})
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center items-center p-6 rounded-2xl border text-center space-y-2" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            {daysUntilExpiry < 7 ? (
              <>
                <AlertCircle className="w-8 h-8 animate-pulse" style={{ color: 'var(--status-cancelled-text)' }} />
                <p className="text-sm font-bold" style={{ color: 'var(--status-cancelled-text)' }}>Sua senha expira em breve!</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Recomendamos a troca imediata para manter sua conta segura.</p>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-8 h-8" style={{ color: 'var(--status-completed-text)' }} />
                <p className="text-sm font-bold" style={{ color: 'var(--status-completed-text)' }}>Sua senha está segura</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Tudo certo com suas credenciais de acesso.</p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Change Password Form */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Key className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
          Alterar Senha
        </h3>
        
        <form onSubmit={handlePasswordChange} className="p-8 rounded-3xl border space-y-6" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
          {error && (
            <div className="p-4 rounded-xl flex items-center gap-3 text-sm font-medium" style={{ backgroundColor: 'var(--status-cancelled-bg)', color: 'var(--status-cancelled-text)', border: '1px solid var(--status-cancelled-text)' }}>
              <AlertCircle size={18} />
              {error}
            </div>
          )}
          
          {success && (
            <div className="p-4 rounded-xl flex items-center gap-3 text-sm font-medium" style={{ backgroundColor: 'var(--status-completed-bg)', color: 'var(--status-completed-text)', border: '1px solid var(--status-completed-text)' }}>
              <CheckCircle2 size={18} />
              Senha alterada com sucesso!
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest ml-1" style={{ color: 'var(--text-secondary)' }}>Senha Atual</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                placeholder="••••••••"
              />
            </div>
            
            <div className="hidden md:block" />

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest ml-1" style={{ color: 'var(--text-secondary)' }}>Nova Senha</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest ml-1" style={{ color: 'var(--text-secondary)' }}>Confirmar Nova Senha</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl border space-y-2" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Requisitos de Segurança</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { label: 'Mínimo 8 caracteres', met: newPassword.length >= 8 },
                { label: 'Uma letra maiúscula', met: /[A-Z]/.test(newPassword) },
                { label: 'Um número', met: /[0-9]/.test(newPassword) },
                { label: 'Um caractere especial', met: /[!@#$%^&*(),.?":{}|<>]/.test(newPassword) },
              ].map((req, i) => (
                <li key={i} className={`flex items-center gap-2 text-xs font-medium`} style={{ color: req.met ? 'var(--status-completed-text)' : 'var(--text-secondary)' }}>
                  <div className={`w-1.5 h-1.5 rounded-full`} style={{ backgroundColor: req.met ? 'var(--status-completed-text)' : 'var(--border-color)' }} />
                  {req.label}
                </li>
              ))}
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full sm:w-auto px-8 py-3 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            Atualizar Senha
          </button>
        </form>
      </section>
    </div>
  );
};
