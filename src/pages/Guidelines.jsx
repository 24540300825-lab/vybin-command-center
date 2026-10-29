import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useProject } from '../lib/project.jsx';
import { useTable } from '../lib/useTable.js';
import { useDraft } from '../lib/useDraft.js';
import { supabase } from '../lib/supabase.js';
import { STARTER_GUIDELINES } from '../lib/plain.js';

function Save({ state }) {
  return <span className={`save ${state}`} aria-live="polite">{state === 'saving' ? 'Saving…' : state === 'error' ? "Couldn't save. Keep typing to retry." : 'Saved'}</span>;
}

function Rule({ s, first, last, onMove, onRemove }) {
  const upd = async (f) => (await supabase.from('cc_guideline_sections').update(f).eq('id', s.id)).error;
  const [title, setTitle, a] = useDraft(s.title, (v) => upd({ title: v }));
  const [body, setBody, b] = useDraft(s.body, (v) => upd({ body: v }));
  const [confirm, setConfirm] = useState(false);
  const state = [a, b].includes('error') ? 'error' : [a, b].includes('saving') ? 'saving' : 'saved';
  return (
    <section className="bsec panel">
      <div className="bsec-head">
        <input className="bsec-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rule group title" aria-label="Title" />
        <Save state={state} />
        <label className="snap" title="When on, Claude reads this whenever you send it a brief">
          <input type="checkbox" checked={s.include_in_context} onChange={(e) => upd({ include_in_context: e.target.checked })} /> Send to Claude
        </label>
        <button className="icon-btn" onClick={() => onMove(-1)} disabled={first} aria-label="Move up"><ArrowUp size={15} /></button>
        <button className="icon-btn" onClick={() => onMove(1)} disabled={last} aria-label="Move down"><ArrowDown size={15} /></button>
        {confirm
          ? <button className="btn danger sm" onClick={onRemove} onBlur={() => setConfirm(false)} autoFocus>Delete this group</button>
          : <button className="icon-btn" onClick={() => setConfirm(true)} aria-label="Remove"><Trash2 size={15} /></button>}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={Math.max(3, body.split('\n').length + 1)} placeholder="Write it the way you'd explain it to a new artist joining the studio." aria-label={`${title || 'Rule'} text`} />
    </section>
  );
}

export default function Guidelines() {
  const { projectId } = useProject();
  const { rows, state } = useTable('cc_guideline_sections', projectId, { order: 'position', ascending: true, limit: 200 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const addStarter = async () => {
    setBusy(true); setError('');
    const { error: err } = await supabase.from('cc_guideline_sections').insert(STARTER_GUIDELINES.map(([title, body], position) => ({ project_id: projectId, position, title, body })));
    setBusy(false);
    if (err) setError("We couldn't set up the starter groups. Try again.");
  };
  const add = async () => {
    const position = rows.length ? rows[rows.length - 1].position + 1 : 0;
    const { error: err } = await supabase.from('cc_guideline_sections').insert({ project_id: projectId, position, title: '', body: '' });
    if (err) setError("We couldn't add a group. Try again.");
  };
  const move = async (i, d) => {
    const a = rows[i], b = rows[i + d];
    if (!a || !b) return;
    const r = await Promise.all([
      supabase.from('cc_guideline_sections').update({ position: b.position }).eq('id', a.id),
      supabase.from('cc_guideline_sections').update({ position: a.position }).eq('id', b.id),
    ]);
    if (r.some((x) => x.error)) setError("We couldn't reorder those. Try again.");
  };
  const remove = async (id) => {
    const { error: err } = await supabase.from('cc_guideline_sections').delete().eq('id', id);
    if (err) setError("We couldn't remove that group. Try again.");
  };

  return (
    <div className="page">
      <h1>Art direction</h1>
      <p className="muted lead">The look and the rules of VY/BIN, written once. Every group switched on is sent to Claude together with a brief, so you don't have to repeat yourself. Nothing here is filled in for you except the safety rules below, which come from your own project rules. Edit them freely.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {state === 'ready' && rows.length === 0 && (
        <section className="panel">
          <h2>Start with the usual groups</h2>
          <p className="muted">Style, colour, materials, characters, camera, performance limits, naming and safety rules. Only the safety rules come with text. The rest start empty for you to fill in.</p>
          <button className="btn primary" onClick={addStarter} disabled={busy}>Set up the groups</button>
        </section>
      )}
      {rows.map((s, i) => <Rule key={s.id} s={s} first={i === 0} last={i === rows.length - 1} onMove={(d) => move(i, d)} onRemove={() => remove(s.id)} />)}
      {rows.length > 0 && <button className="btn" onClick={add}><Plus size={15} /> Add a group</button>}
    </div>
  );
}
