import quillGold from '@/assets/quill-gold.png?inline';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, Home, Compass, Feather, Sparkles } from 'lucide-react';
import QuillIcon from '@/components/QuillIcon';

const navItems = [
  { to: '/', label: '主页', icon: Home },
  { to: '/transactions', label: '账本', icon: BookOpen },
  { to: '/settlement', label: '代收代付', icon: Feather },
  { to: '/reflection', label: '回顾', icon: Compass },
  { to: '/settings', label: '设置', icon: Sparkles },
];

export function Layout() {
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <main className="page"><Outlet /></main>
      <button className="fab" aria-label="Record a transaction" title="Record" onClick={() => navigate('/quick-entry')}>
        <img src={quillGold} className="fab-quill" />
      </button>
      <nav className="bottom-nav" aria-label="Main navigation">
        {navItems.map(({to,label,icon:Icon}) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon size={19} strokeWidth={1.7} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
