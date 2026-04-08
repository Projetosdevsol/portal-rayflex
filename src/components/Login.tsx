import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Zap, LogIn, Mail, Lock } from 'lucide-react';
import { motion } from 'motion/react';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Falha na autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 lg:p-12 rounded-[2rem] border shadow-sm relative z-10"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
      >
        <div className="flex flex-col items-center text-center mb-10">
          <img 
            src="/img/logo-solution.png" 
            alt="Logo Solution" 
            className="w-16 h-16 rounded-2xl object-cover mb-4 shadow-sm border border-[var(--border-color)]"
            referrerPolicy="no-referrer"
          />
          <h1 className="text-xl font-bold tracking-tight mb-0.5 uppercase" style={{ color: 'var(--brand-primary)' }}>GESTOR DE ATIVOS</h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4" style={{ color: 'var(--text-secondary)' }}>
            CLIENTE: RAYFLEX
          </p>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
            Acesse o Sistema
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 text-[10px] font-bold uppercase tracking-wider rounded-lg text-center border" style={{ backgroundColor: 'var(--status-cancelled-bg)', borderColor: 'var(--status-cancelled-text)', color: 'var(--status-cancelled-text)' }}>
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest ml-1" style={{ color: 'var(--text-secondary)' }}>E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} size={16} />
              <input
                type="email"
                required
                className="w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 outline-none transition-all text-sm"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                placeholder="nome@solution-sp.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest ml-1" style={{ color: 'var(--text-secondary)' }}>Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} size={16} />
              <input
                type="password"
                required
                className="w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 outline-none transition-all text-sm"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--bg-primary)' }}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={16} />
                Entrar
              </>
            )}
          </button>
        </form>

        <p className="mt-10 text-center text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)' }}>
          &copy; 2026 Solution TI
        </p>
      </motion.div>
    </div>
  );
};
