import React from 'react';
import { ChevronLeft, ChevronRight, FileOutput, FileSpreadsheet, History, LogOut, Plus } from 'lucide-react';
import { navigate, useRoute } from '../router/useRoute';
import { Logo } from './Logo';
import { useAuth } from '../context/AuthContext';

const nav = [
  { label: 'Workspace', href: '/workspace', icon: FileSpreadsheet },
  { label: 'History', href: '/history', icon: History }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [path] = useRoute();
  const { user, loading, signOut } = useAuth();
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem('docbit.appSidebarCollapsed') === '1'; } catch { return false; }
  });
  React.useEffect(() => { if (!loading && !user) navigate('/auth/login'); }, [loading, user]);
  React.useEffect(() => { try { localStorage.setItem('docbit.appSidebarCollapsed', collapsed ? '1' : '0'); } catch {} }, [collapsed]);
  if (loading) return <div className="min-h-screen bg-slate-50 p-6"><div className="skeleton h-8 w-32"/><div className="mt-10 skeleton h-64 w-full"/></div>;
  if (!user) return null;
  const initial = user.displayName?.slice(0, 1).toUpperCase() || 'D';
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  return <div className="min-h-screen bg-[#f6f8fb] text-slate-950">
    <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-slate-200 bg-white lg:flex lg:flex-col transition-[width] duration-200 ${collapsed ? 'w-[72px]' : 'w-[232px]'}`}>
      <div className={`flex h-[72px] items-center border-b border-slate-100 ${collapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
        {collapsed ? <Logo compact /> : <Logo/>}
        <button type="button" onClick={() => setCollapsed(v => !v)} className="icon-button" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>{collapsed ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}</button>
      </div>
      <nav className="flex-1 px-3 py-5" aria-label="Primary navigation">
        {!collapsed && <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Data</p>}
        {nav.map(item => { const Icon=item.icon; const isActive=active(item.href); return <button key={item.href} onClick={()=>navigate(item.href)} className={`app-nav ${isActive?'app-nav-active':''} ${collapsed?'justify-center px-0':''}`} aria-current={isActive?'page':undefined} title={collapsed?item.label:undefined}><Icon size={18}/>{!collapsed&&<span>{item.label}</span>}</button>; })}

      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className={`flex items-center gap-3 rounded-xl px-2 py-2.5 ${collapsed?'justify-center':''}`} title={collapsed ? (user.email || 'Account') : undefined}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-slate-600">{user.photoURL ? <img src={user.photoURL} alt="" className="h-full w-full object-cover"/> : initial}</span>
          {!collapsed&&<div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{user.displayName || 'Account'}</p><p className="truncate text-[10px] text-slate-400">{user.email}</p></div>}
        </div>
        <button onClick={()=>void signOut()} className={`app-nav text-slate-500 ${collapsed?'justify-center px-0':''}`} title={collapsed?'Sign out':undefined}><LogOut size={18}/>{!collapsed&&<span>Sign out</span>}</button>
      </div>
    </aside>
    <div className={collapsed ? 'lg:pl-[72px]' : 'lg:pl-[232px]'}>
      <header className="sticky top-0 z-30 flex h-[64px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-7">
        <div className="lg:hidden"><Logo/></div>
        <div className="hidden lg:block"><p className="text-xs font-semibold text-slate-800">{path==='/workspace'?'Workspace':path==='/history'?'History':'DocBit'}</p><p className="text-[11px] text-slate-400">Focused data preparation</p></div>
        <div className="flex items-center gap-2"><button onClick={()=>navigate('/workspace')} className="hidden sm:inline-flex btn-primary" title="Upload or import data"><Plus size={15}/>Upload</button><button onClick={()=>navigate('/report')} className="hidden sm:inline-flex btn-secondary" title="Generate report"><FileOutput size={15}/>Report</button><button onClick={()=>navigate('/history')} className="icon-button" title="History" aria-label="History"><History size={18}/></button><button onClick={()=>void signOut()} className="avatar-button" aria-label="Sign out" title="Sign out">{initial}</button></div>
      </header>
      <main className="min-h-[calc(100vh-64px)] pb-[calc(72px+var(--safe-bottom))] lg:pb-0">{children}</main>
    </div>
    <nav className="mobile-bottom-nav lg:hidden" aria-label="Mobile navigation">
      {nav.map(item=>{const Icon=item.icon;const isActive=active(item.href);return <button key={item.href} onClick={()=>navigate(item.href)} className={isActive?'mobile-nav-active':''} aria-current={isActive?'page':undefined}><Icon size={19}/><span>{item.label}</span></button>})}
    </nav>
  </div>;
}
