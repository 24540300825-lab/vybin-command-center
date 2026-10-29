import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Box, Library, MessageSquare, HeartPulse, Palette, History, Settings, Search, Sun, Moon, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useProject } from '../lib/project.jsx';
import CommandPalette from './CommandPalette.jsx';

export const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/briefs', label: 'Briefs', icon: FileText },
  { to: '/scenes', label: '3D scenes', icon: Box, soon: true },
  { to: '/assets', label: 'Assets', icon: Library },
  { to: '/claude', label: 'Ask Claude', icon: MessageSquare, soon: true },
  { to: '/health', label: 'Project health', icon: HeartPulse, soon: true },
  { to: '/art', label: 'Art direction', icon: Palette, soon: true },
  { to: '/activity', label: 'Activity', icon: History },
  { to: '/settings', label: 'Setup & connections', icon: Settings },
];

export default function Shell({ children }) {
  const { user, signOut } = useAuth();
  const { name } = useProject();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('cc-theme', next); } catch {}
  };

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand" title={name}>
          <span className="mark" aria-hidden>VB</span>
          <span className="brand-text"><strong>{name}</strong><small>Command Center</small></span>
        </div>
        <nav aria-label="Sections">
          {NAV.map(({ to, label, icon: Icon, end, soon }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => 'nav' + (isActive ? ' on' : '')}>
              <Icon size={18} aria-hidden />
              <span className="nav-label">{label}</span>
              {soon && <span className="soon">Soon</span>}
            </NavLink>
          ))}
        </nav>
        <div className="rail-foot">
          <span className="who" title={user?.email}>{user?.email}</span>
          <button className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="search" onClick={() => setPaletteOpen(true)}>
            <Search size={15} aria-hidden /> <span>Search or jump to…</span> <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-right">
            <button className="status-chip" onClick={() => navigate('/settings')} title="Open setup">
              <i className="dot off" aria-hidden /> Claude on your computer: not connected
            </button>
            <button className="icon-btn" onClick={flip} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
