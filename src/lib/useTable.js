import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';

// Loads rows for the current project and keeps them live (insert / update / delete) without a refresh.
// `extra` narrows the query (e.g. one brief's files), `match` does the same for live changes, `extraKey` re-runs when the narrowing changes.
export function useTable(table, projectId, { order = 'updated_at', ascending = false, limit = 200, extra, match, extraKey = '' } = {}) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error | offline
  const [error, setError] = useState(null);
  const orderRef = useRef({ order, ascending });
  orderRef.current = { order, ascending };
  const matchRef = useRef(match);
  matchRef.current = match;

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const load = async () => {
      let q = supabase.from(table).select('*').eq('project_id', projectId).order(order, { ascending }).limit(limit);
      if (extra) q = extra(q);
      const { data, error: err } = await q;
      if (!alive) return;
      if (err) { setError(err.message); setState('error'); return; }
      setRows(data); setState('ready');
    };
    load();

    const sortRows = (list) => {
      const { order: o, ascending: a } = orderRef.current;
      return [...list].sort((x, y) => {
        const xv = x[o], yv = y[o];
        const c = xv < yv ? -1 : xv > yv ? 1 : 0;
        return a ? c : -c;
      });
    };
    const channel = supabase
      .channel(`cc:${table}:${projectId}:${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `project_id=eq.${projectId}` }, (p) => {
        setRows((cur) => {
          if (p.eventType === 'DELETE') return cur.filter((r) => r.id !== p.old.id);
          const without = cur.filter((r) => r.id !== p.new.id);
          if (matchRef.current && !matchRef.current(p.new)) return without;
          return sortRows([p.new, ...without]).slice(0, limit);
        });
      })
      .subscribe((status) => {
        if (!alive) return;
        if (status === 'SUBSCRIBED') { setState((s) => (s === 'offline' ? 'ready' : s)); load(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setState((s) => (s === 'ready' ? 'offline' : s));
      });
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [table, projectId, order, ascending, limit, extraKey]);

  return { rows, state, error, setRows };
}
