import React, { useState } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { Logo } from './Logo';
import { navigate } from '../router/useRoute';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();
  const go = (path: string) => { setOpen(false); navigate(path); };
  return <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
    <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
      <Logo />
      <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
        <button onClick={() => navigate('/workspace')} className="text-sm font-medium text-slate-600 hover:text-slate-950">Workspace</button>
        <button onClick={() => navigate('/documentation')} className="text-sm font-medium text-slate-600 hover:text-slate-950">Resources</button>
      </nav>
      <div className="hidden items-center gap-2 md:flex">
        {!loading && user ? <button onClick={() => navigate('/workspace')} className="btn-secondary">Open workspace <ArrowRight size={15}/></button> : <><button onClick={() => navigate('/auth/login')} className="btn-ghost">Log in</button><button onClick={() => navigate('/auth/signup')} className="btn-primary">Get started</button></>}
      </div>
      <button className="focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 md:hidden" onClick={() => setOpen(v => !v)} aria-label="Menu">{open ? <X/> : <Menu/>}</button>
    </div>
    {open && <div className="border-t border-slate-200 bg-white px-5 py-4 md:hidden"><div className="grid gap-1">
      <button onClick={() => go('/workspace')} className="mobile-menu-item">Workspace</button>
      <button onClick={() => go('/documentation')} className="mobile-menu-item">Documentation</button>
      <button onClick={() => go(user ? '/workspace' : '/auth/login')} className="mobile-menu-item">{user ? 'Open workspace' : 'Log in'}</button>
      {!user && <button onClick={() => go('/auth/signup')} className="btn-primary mt-2 justify-center">Get started</button>}
    </div></div>}
  </header>;
}
