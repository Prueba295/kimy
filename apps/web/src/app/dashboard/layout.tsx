'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Cookies from 'js-cookie';
import {
  LayoutDashboard, FileText, Upload, Users, BookTemplate,
  BarChart3, Settings, LogOut, Brain, Shield, BookOpen,
  Bell, ChevronLeft, Menu, Layers,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'COORDINATOR', 'ADVISOR', 'STUDENT'] },
  { href: '/dashboard/advances', label: 'Avances', icon: FileText, roles: ['ADMIN', 'COORDINATOR', 'ADVISOR', 'STUDENT'] },
  { href: '/dashboard/upload', label: 'Subir Avance', icon: Upload, roles: ['STUDENT'] },
  { href: '/dashboard/bulk-review', label: 'Revisión Masiva', icon: Layers, roles: ['ADMIN', 'COORDINATOR'] },
  { href: '/dashboard/templates', label: 'Doc. Patrón', icon: BookTemplate, roles: ['ADMIN', 'COORDINATOR'] },
  { href: '/dashboard/users', label: 'Usuarios', icon: Users, roles: ['ADMIN', 'COORDINATOR'] },
  { href: '/dashboard/statistics', label: 'Estadísticas', icon: BarChart3, roles: ['ADMIN', 'COORDINATOR', 'ADVISOR'] },
  { href: '/dashboard/fine-tuning', label: 'Fine-tuning IA', icon: Brain, roles: ['ADMIN'] },
  { href: '/dashboard/plagiarism', label: 'Plagio', icon: Shield, roles: ['ADMIN', 'COORDINATOR', 'ADVISOR'] },
  { href: '/dashboard/references', label: 'Referencias', icon: BookOpen, roles: ['ADMIN', 'COORDINATOR', 'ADVISOR'] },
  { href: '/dashboard/settings', label: 'Configuración', icon: Settings, roles: ['ADMIN', 'COORDINATOR', 'ADVISOR', 'STUDENT'] },
];


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userData = Cookies.get('kimy_user');
    if (userData) {
      try { setUser(JSON.parse(userData)); } catch {}
    } else {
      window.location.href = '/login';
    }
  }, []);

  const handleLogout = () => {
    Cookies.remove('kimy_token');
    Cookies.remove('kimy_user');
    window.location.href = '/login';
  };

  const filteredItems = NAV_ITEMS.filter(
    (item) => !user || item.roles.includes(user.role),
  );

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
      {/* Sidebar */}
      <aside
        className={`${collapsed ? 'w-16' : 'w-60'} bg-[#0F172A] flex flex-col transition-all duration-300 flex-shrink-0`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-white/5">
          {!collapsed && (
            <div className="flex items-center gap-2.5 animate-fade-in">
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                <span className="text-sm font-bold text-white">K</span>
              </div>
              <span className="text-base font-semibold text-white">KIMY</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`${collapsed ? 'mx-auto' : 'ml-auto'} p-1.5 rounded-md hover:bg-white/5 text-gray-400 transition-colors`}
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {filteredItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 group ${
                  isActive
                    ? 'bg-primary-500/15 text-primary-300'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? 'text-primary-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-white/5 p-3">
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary-300">
                {user.name?.charAt(0) || 'U'}
              </span>
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-200 truncate">{user.name}</p>
                <p className="text-[10px] text-gray-500">{user.role}</p>
              </div>
            )}
            {!collapsed && (
              <button onClick={handleLogout} className="p-1.5 rounded-md hover:bg-white/5 text-gray-500 hover:text-red-400 transition-colors">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {filteredItems.find((i) => pathname.startsWith(i.href))?.label || 'KIMY'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/notifications"
              className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Bell className="w-4.5 h-4.5 text-gray-500" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-primary-500 rounded-full"></span>
            </Link>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
