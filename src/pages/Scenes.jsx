import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProject } from '../lib/project.jsx';
import { useTable } from '../lib/useTable.js';
import { supabase } from '../lib/supabase.js';
import { timeAgo } from '../lib/plain.js';

export default function Scenes() {
  const { projectId } = useProject();
  const navigate = useNavigate();
  const { rows, state } = useTable('cc_scenes', projectId);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setBusy(true); setError('');
    const { data, error: err } = await supabase.from('cc_scenes').insert({ project_id: projectId, name: clean }).select().single();
    setBusy(false);
    if (err) setError("We couldn't create that scene. Try again.");
    else navigate(`/scenes/${data.id}`);
  };

  return (
    <div className="page">
      <h1>3D scenes</h1>
      <p className="muted lead">A scene is a place in your world, like a map or a room. Lay out stand-in shapes now, leave notes right on objects, and swap each stand-in for the finished model later without losing where it was placed.</p>
      <form className="inline-form" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name a scene, e.g. Forest clearing" aria-label="Scene name" maxLength={80} />
        <button className="btn primary" disabled={busy || !name.trim()}>Create scene</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="panel">
        {state === 'loading' && <p className="muted">Loading…</p>}
        {state === 'ready' && rows.length === 0 && <p className="muted">No scenes yet. Name your first one above.</p>}
        {rows.length > 0 && (
          <ul className="rows">
            {rows.map((s) => (
              <li key={s.id}><Link to={`/scenes/${s.id}`}><span className="grow">{s.name}</span><span className="muted when">{timeAgo(s.updated_at)}</span></Link></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
