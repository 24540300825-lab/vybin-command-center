import { useEffect, useRef, useState } from 'react';

// Keeps a field editable while saving quietly in the background. Remote changes only replace the text when you aren't mid-edit.
// save(value) must resolve to an error (or null/undefined on success).
export function useDraft(remote, save) {
  const [value, setValue] = useState(remote);
  const [state, setState] = useState('saved'); // saved | saving | error
  const dirty = useRef(false);
  const timer = useRef(null);
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => { if (!dirty.current) setValue(remote); }, [remote]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (next) => {
    setValue(next); dirty.current = true; setState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const err = await latest.current(next);
      if (err) setState('error'); else { dirty.current = false; setState('saved'); }
    }, 700);
  };
  return [value, change, state];
}
