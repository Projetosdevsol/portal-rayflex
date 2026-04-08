import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sun, Moon, Monitor, Type } from 'lucide-react';

export const SettingsAppearance: React.FC = () => {
  const { profile, updatePreferences } = useAuth();
  const preferences = profile?.preferences || { theme: 'light', fontSize: 'medium' };

  const themes = [
    { id: 'light', label: 'Claro', icon: Sun },
    { id: 'dark', label: 'Escuro', icon: Moon },
    { id: 'system', label: 'Sistema', icon: Monitor },
  ] as const;

  const fontSizes = [
    { id: 'small', label: 'Pequeno', size: '14px' },
    { id: 'medium', label: 'Médio', size: '16px' },
    { id: 'large', label: 'Grande', size: '18px' },
    { id: 'extra', label: 'Extra', size: '20px' },
  ] as const;

  const currentIndex = fontSizes.findIndex(fs => fs.id === preferences.fontSize);
  const currentFontSize = fontSizes[currentIndex] || fontSizes[1];

  const handleDecrease = () => {
    if (currentIndex > 0) {
      updatePreferences({ fontSize: fontSizes[currentIndex - 1].id });
    }
  };

  const handleIncrease = () => {
    if (currentIndex < fontSizes.length - 1) {
      updatePreferences({ fontSize: fontSizes[currentIndex + 1].id });
    }
  };

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          {preferences.theme === 'dark' ? <Moon className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} /> : <Sun className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />}
          Tema da Interface
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Escolha como o sistema deve ser exibido para você.</p>
        
        <div className="p-6 rounded-3xl border flex items-center justify-between" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors`}
                 style={{ 
                   backgroundColor: 'var(--bg-secondary)', 
                   color: preferences.theme === 'dark' ? 'var(--status-warning)' : 'var(--accent-primary)' 
                 }}>
              {preferences.theme === 'dark' ? <Moon size={24} /> : <Sun size={24} />}
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Modo {preferences.theme === 'dark' ? 'Escuro' : 'Claro'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {preferences.theme === 'dark' ? 'Ideal para ambientes com pouca luz.' : 'Melhor para ambientes bem iluminados.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => updatePreferences({ theme: preferences.theme === 'dark' ? 'light' : 'dark' })}
            className={`relative w-16 h-8 rounded-full transition-all duration-300`}
            style={{ backgroundColor: preferences.theme === 'dark' ? 'var(--accent-primary)' : 'var(--border-color)' }}
          >
            <div className={`absolute top-1 w-6 h-6 rounded-full shadow-md transition-all duration-300 flex items-center justify-center ${
              preferences.theme === 'dark' ? 'left-9' : 'left-1'
            }`}
            style={{ backgroundColor: 'var(--bg-primary)' }}>
              {preferences.theme === 'dark' ? <Moon size={12} style={{ color: 'var(--accent-primary)' }} /> : <Sun size={12} style={{ color: 'var(--status-warning)' }} />}
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2 px-2">
          <button 
            onClick={() => updatePreferences({ theme: 'system' })}
            className={`flex items-center gap-2 text-xs font-bold transition-colors hover:opacity-80`}
            style={{ color: preferences.theme === 'system' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
          >
            <Monitor size={14} />
            Usar preferência do sistema
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Type className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
          Tamanho da Fonte
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Ajuste o tamanho do texto para melhor leitura.</p>
        
        <div className="p-8 rounded-3xl border space-y-8" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-center gap-12">
            <button
              onClick={handleDecrease}
              disabled={currentIndex === 0}
              className={`flex flex-col items-center gap-2 transition-all ${
                currentIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110 active:scale-95'
              }`}
            >
              <div className="w-14 h-14 rounded-2xl border flex items-center justify-center text-xl font-bold"
                   style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                A-
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Diminuir</span>
            </button>

            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl font-black" style={{ color: 'var(--brand-primary)' }}>
                {currentFontSize.size}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                {currentFontSize.label}
              </span>
            </div>

            <button
              onClick={handleIncrease}
              disabled={currentIndex === fontSizes.length - 1}
              className={`flex flex-col items-center gap-2 transition-all ${
                currentIndex === fontSizes.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110 active:scale-95'
              }`}
            >
              <div className="w-14 h-14 rounded-2xl border flex items-center justify-center text-2xl font-bold"
                   style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                A+
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Aumentar</span>
            </button>
          </div>
          
          <div className="p-4 rounded-xl border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <p className="text-center italic" style={{ color: 'var(--text-secondary)' }}>
              "Este é um exemplo de como o texto será exibido no sistema."
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
