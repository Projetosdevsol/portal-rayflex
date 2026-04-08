import React, { useState, useEffect } from 'react';
import { Bell, X, Check, ExternalLink, AlertTriangle, Info, AlertCircle, CheckCircle } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface NotificationBellProps {
  side?: 'left' | 'right';
  align?: 'top' | 'bottom';
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ 
  side = 'right',
  align = 'bottom'
}) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const filteredNotifications = showAll 
    ? notifications 
    : notifications.filter(n => !n.read);

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertTriangle className="text-[var(--status-warning)]" size={16} />;
      case 'error': return <AlertCircle className="text-[var(--status-error)]" size={16} />;
      case 'success': return <CheckCircle className="text-[var(--status-success)]" size={16} />;
      default: return <Info className="text-[var(--status-info)]" size={16} />;
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteNotification(id);
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl transition-all"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--brand-primary)';
          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-secondary)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[var(--accent-primary)] text-white text-[10px] font-bold flex items-center justify-center rounded-full ring-2 ring-[var(--bg-primary)]">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)} 
            />
            <motion.div 
              initial={{ 
                opacity: 0, 
                y: align === 'bottom' ? 10 : -10, 
                scale: 0.95 
              }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ 
                opacity: 0, 
                y: align === 'bottom' ? 10 : -10, 
                scale: 0.95 
              }}
              className={cn(
                "absolute w-80 rounded-2xl shadow-2xl border z-50 overflow-hidden",
                side === 'right' ? "right-0" : "left-0",
                align === 'bottom' ? "mt-2" : "bottom-full mb-2"
              )}
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
            >
              <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <div className="flex flex-col">
                  <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Notificações</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                      {unreadCount} novas
                    </span>
                    <span className="opacity-20" style={{ color: 'var(--text-secondary)' }}>•</span>
                    <button 
                      onClick={() => setShowAll(!showAll)}
                      className="text-[10px] font-bold uppercase tracking-wider hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      {showAll ? 'Ver apenas não lidas' : 'Ver todas'}
                    </button>
                  </div>
                </div>
                {unreadCount > 0 && (
                  <button 
                    onClick={() => markAllAsRead()}
                    className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    Marcar todas
                  </button>
                )}
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                {filteredNotifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      <Bell size={24} />
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {showAll ? 'Nenhuma notificação por enquanto.' : 'Nenhuma notificação não lida.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: 'var(--bg-secondary)' }}>
                    {filteredNotifications.map((n) => (
                      <div 
                        key={n.id} 
                        onClick={() => !n.read && markAsRead(n.id)}
                        className={`p-4 transition-colors relative group cursor-pointer ${!n.read ? 'bg-opacity-10' : ''}`}
                        style={{ 
                          backgroundColor: !n.read ? 'var(--accent-primary)' : 'transparent'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = !n.read ? 'color-mix(in srgb, var(--accent-primary), transparent 80%)' : 'var(--bg-secondary)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = !n.read ? 'color-mix(in srgb, var(--accent-primary), transparent 90%)' : 'transparent'}
                      >
                        <div className="flex gap-3">
                          <div className="mt-0.5">{getIcon(n.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className={`text-xs font-bold truncate ${!n.read ? 'pr-2' : ''}`} style={{ color: 'var(--text-primary)' }}>
                                {n.title}
                              </h4>
                              <button 
                                onClick={(e) => handleDelete(e, n.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 transition-all"
                                style={{ color: 'var(--text-secondary)' }}
                                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--status-error)'}
                                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                                title="Excluir"
                              >
                                <X size={12} />
                              </button>
                            </div>
                            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                              {n.message}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[9px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {new Date(n.createdAt).toLocaleDateString('pt-BR')}
                              </span>
                              {n.link && (
                                <Link 
                                  to={n.link} 
                                  onClick={() => setIsOpen(false)}
                                  className="text-[9px] font-bold flex items-center gap-1 hover:underline"
                                  style={{ color: 'var(--accent-primary)' }}
                                >
                                  Ver Detalhes <ExternalLink size={8} />
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                        {!n.read && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(n.id);
                            }}
                            className="absolute top-4 right-4 p-1 transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-primary)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                            title="Marcar como lida"
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {notifications.length > 0 && (
                <div className="p-3 border-t text-center" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="text-[11px] font-bold transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                  >
                    Fechar
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
