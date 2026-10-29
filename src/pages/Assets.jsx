import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProject } from '../lib/project.jsx';
import { useTable } from '../lib/useTable.js';
import { supabase } from '../lib/supabase.js';
import { ASSET_STATUS, timeAgo } from '../lib/plain.js';

const CATEGORIES = { map: 'Map', room: 'Room', character: 'Character', furniture: 'Furniture', prop: 'Prop', vegetation: 'Vegetation', decoration: 'Decoration', lighting: 'Lighting' };

export const CATEGORY_NAMES = CATEGORIES;

export default function Assets() {
  const { projectId } = useProject();
  const { rows, state } = useTable('cc_assets', projectId);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('prop');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setBusy(true); setError('');
    const code = clean.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) + '_' + String(rows.length + 1).padStart(3, '0');
    const { error: err } = await supabase.from('cc_assets').insert({ project_id: projectId, name: clean, category, code, status: 'planned' });
    setBusy(false);
    if (err) setError(err.code === '23505' ? 'An asset with that ID already exists. Try a slightly different name.' : "We couldn't add that asset. Try again.");
    else setName('');
  };

  const setStatus = async (id, status) => {
    const { error: err } = await supabase.from('cc_assets').update({ status }).eq('id', id);
    if (err) setError("We couldn't change that status. Try again.");
  };

  return (
    <div className="page">
      <h1>Assets</h1>
      <p className="muted lead">Every model, character and prop your world needs, and where each one stands.  Open an asset to attach files and preview 3D models.</p>

      <form className="inline-form" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name an asset, e.g. Oak tree" aria-label="Asset name" maxLength={80} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn primary" disabled={busy || !name.trim()}>Add asset</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="panel">
        {state === 'loading' && <p className="muted">Loading…</p>}
        {state === 'ready' && rows.length === 0 && <p className="muted">No assets yet. Name the first thing your world needs and add it above.</p>}
        {rows.length > 0 && (
          <table className="table">
            <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="num">{a.code}</td>
                  <td><Link className="link" to={`/assets/${a.id}`}>{a.name}</Link></td>
                  <td>{CATEGORIES[a.category] ?? a.category}</td>
                  <td>
                    <select className={`chip-select s-${a.status}`} value={a.status} onChange={(e) => setStatus(a.id, e.target.value)} aria-label={`Status of ${a.name}`}>
                      {Object.entries(ASSET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="muted">{timeAgo(a.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
