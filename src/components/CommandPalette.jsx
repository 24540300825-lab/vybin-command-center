import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NAV } from './Shell.jsx';

export default function CommandPalette({ onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);

  const items = useMemo(() => {
    const all = [
      { label: 'Create a new brief', go: '/briefs?new=1' },
      ...NAV.map((n) => ({ label: `Go to ${n.label}`, go: n.to })),
    ];
    const t = q.trim().toLowerCase();
    return t ? all.filter((x) => x.label.toLowerCase().includes(t)) : all;
  }, [q]);

  const run = (it) => { if (!it) return; onClose(); navigate(it.go); };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setI((n) => Math.min(n + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((n) => Math.max(n - 1, 0)); }
    else if (e.key === 'Enter') run(items[i]);
  };

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} onKeyDown={onKey} placeholder="What do you want to do?" aria-label="Search" />
        <ul>
          {items.length === 0 && <li className="muted pad">Nothing matches "{q}".</li>}
          {items.map((it, n) => (
            <li key={it.label}>
              <button className={n === i ? 'sel' : ''} onMouseEnter={() => setI(n)} onClick={() => run(it)}>{it.label}</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
