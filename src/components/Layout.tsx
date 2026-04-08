import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Monitor, 
  Server, 
  Printer, 
  Key, 
  History, 
  LogOut,
  Menu,
  X,
  Zap,
  ShieldCheck,
  CheckSquare,
  FileText,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { NotificationBell } from './NotificationBell';
import { UniversalSearch } from './UniversalSearch';
import { getInitials } from '../utils/format';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SidebarItem: React.FC<{ to: string, icon: any, label: string, active: boolean, depth?: number }> = ({ to, icon: Icon, label, active, depth = 0 }) => (
  <Link
    to={to}
    className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group",
      depth > 0 ? "pl-8" : "",
      active 
        ? "bg-[var(--brand-primary)] text-[var(--bg-primary)] shadow-sm" 
        : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--brand-primary)]"
    )}
  >
    <Icon size={depth > 0 ? 14 : 18} className={cn(active ? "text-[var(--bg-primary)]" : "text-[var(--text-secondary)] group-hover:text-[var(--brand-primary)]")} />
    <span className={cn("font-medium", depth > 0 ? "text-xs" : "text-sm")}>{label}</span>
  </Link>
);

const SidebarSubmenu: React.FC<{ icon: any, label: string, children: React.ReactNode, active: boolean }> = ({ icon: Icon, label, children, active }) => {
  const [isOpen, setIsOpen] = useState(active);

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between w-full gap-3 px-3 py-2 rounded-lg transition-all duration-200 group",
          active 
            ? "text-[var(--brand-primary)]" 
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--brand-primary)]"
        )}
      >
        <div className="flex items-center gap-3">
          <Icon size={18} className={cn(active ? "text-[var(--brand-primary)]" : "text-[var(--text-secondary)] group-hover:text-[var(--brand-primary)]")} />
          <span className="font-medium text-sm">{label}</span>
        </div>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, logout, isSuperAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const isManager = profile?.role === 'manager';
  const isAdminOrSuperAdmin = isSuperAdmin || profile?.role === 'admin';

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  type NavItem = {
    to?: string;
    icon: any;
    label: string;
    roles?: string[];
    children?: NavItem[];
  };

  const navItems: NavItem[] = [
    { to: '/controle', icon: LayoutDashboard, label: 'Controle' },
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    {
      label: 'Ativos',
      icon: Monitor,
      children: [
        { to: '/collaborators', icon: Users, label: 'Colaboradores', roles: ['editor', 'super_admin', 'admin', 'manager'] },
        { to: '/machines', icon: Monitor, label: 'Máquinas' },
        { to: '/servers', icon: Server, label: 'Servidores' },
        { to: '/printers', icon: Printer, label: 'Impressoras' },
        { to: '/licenses', icon: Key, label: 'Licenças', roles: ['editor', 'super_admin', 'admin', 'manager'] },
      ]
    },
    {
      label: 'Gestão',
      icon: CheckSquare,
      children: [
        { to: '/tasks', icon: CheckSquare, label: 'Tarefas', roles: ['super_admin'] },
        { to: '/reports', icon: FileText, label: 'Relatórios', roles: ['editor', 'super_admin', 'admin', 'manager'] },
        { to: '/users', icon: ShieldCheck, label: 'Usuários', roles: ['super_admin'] },
        { to: '/audit-reports', icon: History, label: 'Auditoria', roles: ['super_admin'] },
      ]
    },
    { to: '/settings', icon: SettingsIcon, label: 'Configurações' },
  ];

  const filterNavItems = (items: NavItem[]): NavItem[] => {
    return items
      .filter(item => !item.roles || item.roles.includes(profile?.role || 'viewer'))
      .map(item => ({
        ...item,
        children: item.children ? filterNavItems(item.children) : undefined
      }))
      .filter(item => !item.children || item.children.length > 0 || item.to);
  };

  const filteredNavItems = filterNavItems(navItems);

  const renderNavItem = (item: NavItem, depth = 0) => {
    if (item.children) {
      const isActive = item.children.some(child => location.pathname === child.to);
      return (
        <SidebarSubmenu key={item.label} icon={item.icon} label={item.label} active={isActive}>
          {item.children.map(child => renderNavItem(child, depth + 1))}
        </SidebarSubmenu>
      );
    }
    return (
      <SidebarItem 
        key={item.to} 
        to={item.to!} 
        icon={item.icon} 
        label={item.label} 
        active={location.pathname === item.to}
        depth={depth}
      />
    );
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg-secondary)] text-[var(--text-primary)]">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-[var(--bg-primary)] border-r border-[var(--border-color)] fixed top-0 h-full max-h-screen z-20 p-8">
        <div className="flex flex-col flex-1">
          <div className="flex items-center gap-3 mb-12">
            <img 
              src="/img/logo-solution.png" 
              alt="Logo Solution" 
              className="w-10 h-10 rounded-xl object-cover shadow-sm border border-[var(--border-color)]"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col">
              <h1 className="font-bold text-sm tracking-tight text-[var(--brand-primary)] uppercase leading-tight">GESTOR DE ATIVOS</h1>
              <p className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-widest leading-tight">CLIENTE: RAYFLEX</p>
            </div>
          </div>

          <div className="mb-8">
            <UniversalSearch />
          </div>

          <nav className="space-y-1 flex-1 overflow-y-auto pr-2 min-h-0 scrollbar-thin">
            <p className="text-[10px] font-bold text-[var(--text-secondary)] opacity-60 uppercase tracking-[0.2em] mb-4 ml-3">Menu Principal</p>
            {filteredNavItems.map(item => renderNavItem(item))}
          </nav>

          <div className="mt-auto pt-8 border-t border-[var(--border-color)]">
            <div className="flex items-center gap-3 mb-6 px-2">
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] font-bold text-xs border border-[var(--border-color)]">
                {getInitials(profile?.displayName || '')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)] truncate">{profile?.displayName}</p>
                <p className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-widest">
                  {profile?.role === 'super_admin' ? 'Super Admin' : 
                   profile?.role === 'admin' ? 'Administrador' :
                   profile?.role === 'manager' ? 'Gestor' :
                   profile?.role === 'editor' ? 'Editor' : 'Visualizador'}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between px-2">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors uppercase tracking-widest"
              >
                <LogOut size={14} />
                Sair
              </button>
              <NotificationBell side="left" align="top" />
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[var(--bg-primary)]/80 backdrop-blur-md border-b border-[var(--border-color)] px-6 flex items-center justify-between z-30">
        <div className="flex items-center gap-3 flex-1">
          <UniversalSearch />
        </div>
        <div className="flex items-center gap-4 ml-4">
          <NotificationBell />
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] active:scale-95 transition-transform"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-[var(--ink)]/40 backdrop-blur-sm z-40" 
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-72 bg-[var(--bg-primary)] z-50 p-8 flex flex-col shadow-2xl" 
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-12">
                <img 
                  src="/img/logo-solution.png" 
                  alt="Logo Solution" 
                  className="w-10 h-10 rounded-xl object-cover shadow-sm border border-[var(--border-color)]"
                  referrerPolicy="no-referrer"
                />
                <div className="flex flex-col">
                  <h1 className="font-bold text-sm tracking-tight text-[var(--brand-primary)] uppercase leading-tight">GESTOR DE ATIVOS</h1>
                  <p className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-widest leading-tight">CLIENTE: RAYFLEX</p>
                </div>
              </div>

              <nav className="space-y-1 flex-1 overflow-y-auto pr-2 min-h-0">
                <p className="text-[10px] font-bold text-[var(--text-secondary)] opacity-60 uppercase tracking-[0.2em] mb-4 ml-3">Menu Principal</p>
                {filteredNavItems.map(item => (
                  <div key={item.label || item.to} onClick={() => setIsMobileMenuOpen(false)}>
                    {renderNavItem(item)}
                  </div>
                ))}
              </nav>

              <div className="pt-8 border-t border-[var(--border-color)]">
                <div className="flex items-center gap-3 mb-8 px-2">
                  <div className="w-11 h-11 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] font-bold text-xs border border-[var(--border-color)]">
                    {getInitials(profile?.displayName || '')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-[var(--text-primary)] truncate">{profile?.displayName}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest">
                      {profile?.role === 'super_admin' ? 'Super Admin' : 
                       profile?.role === 'admin' ? 'Administrador' :
                       profile?.role === 'manager' ? 'Gestor' :
                       profile?.role === 'editor' ? 'Editor' : 'Visualizador'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-3 w-full py-4 text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95"
                >
                  <LogOut size={18} />
                  Sair do Sistema
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="max-w-7xl mx-auto p-6 lg:p-12">
          {children}
        </div>
      </main>
    </div>
  );
};
