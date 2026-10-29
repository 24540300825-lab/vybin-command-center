import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { useAuth } from './auth.jsx';

const ProjectCtx = createContext(null);
export const useProject = () => useContext(ProjectCtx);

// Finds (or creates, for the allowed owner) the Command Center project for the signed-in person.
export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ status: 'loading', projectId: null, name: '', error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setState((s) => ({ ...s, status: 'loading' }));
    (async () => {
      const { data: id, error } = await supabase.rpc('cc_bootstrap_project', { p_name: 'VY/BIN Studio' });
      if (!alive) return;
      if (error) {
        const notAllowed = /not_allowed/.test(error.message);
        setState({ status: notAllowed ? 'not_allowed' : 'error', projectId: null, name: '', error: error.message });
        return;
      }
      const { data: p } = await supabase.from('cc_projects').select('name').eq('id', id).single();
      if (alive) setState({ status: 'ready', projectId: id, name: p?.name ?? 'VY/BIN Studio', error: null });
    })();
    return () => { alive = false; };
  }, [user?.id, attempt]);

  return <ProjectCtx.Provider value={{ ...state, retry: () => setAttempt((n) => n + 1) }}>{children}</ProjectCtx.Provider>;
}
