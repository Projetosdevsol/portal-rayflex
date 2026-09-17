import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Users, Monitor, Server, Printer, PlugZap, Key, ChevronRight } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const UniversalSearch: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<{ type: string, items: any[], icon: any, label: string, path: string }[]>([]);
  const { collaborators, machines, servers, printers, ups, licenses } = useData();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }

    const searchStr = searchTerm.toLowerCase();
    
    const collections = [
      { type: 'collaborator', items: collaborators, icon: Users, label: 'Colaboradores', path: '/collaborators' },
      { type: 'machine', items: machines, icon: Monitor, label: 'Máquinas', path: '/machines' },
      { type: 'server', items: servers, icon: Server, label: 'Servidores', path: '/servers' },
      { type: 'printer', items: printers, icon: Printer, label: 'Impressoras', path: '/printers' },
      { type: 'ups', items: ups, icon: PlugZap, label: 'Nobreaks', path: '/ups' },
      { type: 'license', items: licenses, icon: Key, label: 'Licenças', path: '/licenses' },
    ];

    const filteredResults = collections.map(col => {
      const filtered = col.items.filter(item => {
        return Object.values(item).some(val => 
          val && String(val).toLowerCase().includes(searchStr)
        );
      }).slice(0, 5); // Limit to 5 results per category

      return { ...col, items: filtered };
    }).filter(col => col.items.length > 0);

    setResults(filteredResults);
  }, [searchTerm, collaborators, machines, servers, printers, ups, licenses]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const handleItemClick = (path: string, id: string) => {
    setIsOpen(false);
    setSearchTerm('');
    if (path === '/collaborators') {
      navigate(`${path}/${id}`);
    } else {
      // For other assets, we navigate to the list and maybe we should highlight it?
      // For now just navigate to the list.
      navigate(path);
    }
  };

  const getItemLabel = (type: string, item: any) => {
    switch (type) {
      case 'collaborator': return item.name;
      case 'machine': return item.hostname;
      case 'server': return item.brand_model || item.hostname;
      case 'printer': return `${item.brand} ${item.model}`;
      case 'ups': return `${item.brand} ${item.model}`;
      case 'license': return item.name;
      default: return item.id;
    }
  };

  const getItemSublabel = (type: string, item: any) => {
    switch (type) {
      case 'collaborator': return item.login;
      case 'machine': return item.serialNumber;
      case 'server': return item.unit;
      case 'printer': return item.ipAddress;
      case 'ups': return item.location || item.serialNumber;
      case 'license': return item.key;
      default: return '';
    }
  };

  return (
    <div className="relative" ref={searchRef}>
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] group-focus-within:text-[var(--brand-primary)] transition-colors" size={16} />
        <input
          type="text"
          placeholder="Busca universal..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full pl-10 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] transition-all"
        />
        {searchTerm && (
          <button 
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--accent-primary)]"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {isOpen && searchTerm.trim() && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full left-0 right-0 mt-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden z-50 max-h-[400px] overflow-y-auto scrollbar-thin"
          >
            {results.length > 0 ? (
              <div className="p-2 space-y-4">
                {results.map((category) => (
                  <div key={category.type}>
                    <div className="flex items-center gap-2 px-3 py-1 mb-1">
                      <category.icon size={12} className="text-[var(--brand-primary)]" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">{category.label}</span>
                    </div>
                    <div className="space-y-1">
                      {category.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleItemClick(category.path, item.id)}
                          className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[var(--bg-secondary)] transition-colors text-left group"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold text-[var(--text-primary)] truncate group-hover:text-[var(--brand-primary)] transition-colors">
                              {getItemLabel(category.type, item)}
                            </span>
                            <span className="text-[10px] text-[var(--text-secondary)] truncate">
                              {getItemSublabel(category.type, item)}
                            </span>
                          </div>
                          <ChevronRight size={14} className="text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <Search size={32} className="mx-auto mb-3 text-[var(--text-secondary)] opacity-20" />
                <p className="text-sm text-[var(--text-secondary)]">Nenhum resultado encontrado para "{searchTerm}"</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
