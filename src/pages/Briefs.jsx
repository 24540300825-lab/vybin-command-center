import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useProject } from '../lib/project.jsx';
import { useTable } from '../lib/useTable.js';
import { supabase } from '../lib/supabase.js';
import { BRIEF_STATUS, PRIORITY, TEMPLATES, timeAgo } from '../lib/plain.js';

const code = (n) => `BR-${String(n).padStart(3, '0')}`;

// Keeps a field editable while saving quietly in the background. Remote changes only replace the text when you aren't mid-edit.
function useDraft(remote, save) {
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

function SaveState({ state }) {
  return <span className={`save ${state}`} aria-live="polite">{state === 'saving' ? 'Saving…' : state === 'error' ? "Couldn't save. Keep typing to retry." : 'Saved'}</span>;
}

function Section({ s, first, last, onMove, onRemove }) {
  const [title, setTitle, st1] = useDraft(s.title, async (v) => (await supabase.from('cc_brief_sections').update({ title: v }).eq('id', s.id)).error);
  const [body, setBody, st2] = useDraft(s.body, async (v) => (await supabase.from('cc_brief_sections').update({ body: v }).eq('id', s.id)).error);
  const [confirm, setConfirm] = useState(false);
  const state = st1 === 'error' || st2 === 'error' ? 'error' : st1 === 'saving' || st2 === 'saving' ? 'saving' : 'saved';
  return (
    <section className="bsec">
      <div className="bsec-head">
        <input className="bsec-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Section title" aria-label="Section title" />
        <SaveState state={state} />
        <button className="icon-btn" onClick={() => onMove(-1)} disabled={first} aria-label="Move section up"><ArrowUp size={15} /></button>
        <button className="icon-btn" onClick={() => onMove(1)} disabled={last} aria-label="Move section down"><ArrowDown size={15} /></button>
        {confirm ? (
          <button className="btn danger sm" onClick={onRemove} onBlur={() => setConfirm(false)} autoFocus>Delete this section's text</button>
        ) : (
          <button className="icon-btn" onClick={() => setConfirm(true)} aria-label="Remove section"><Trash2 size={15} /></button>
        )}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write it the way you'd explain it to a person." rows={Math.max(4, body.split('\n').length + 1)} aria-label={`${title || 'Section'} text`} />
    </section>
  );
}

function Editor({ brief, sections, projectId }) {
  const [title, setTitle, tState] = useDraft(brief.title, async (v) => (await supabase.from('cc_briefs').update({ title: v.trim() || 'Untitled brief' }).eq('id', brief.id)).error);
  const [error, setError] = useState('');
  const mine = sections.filter((s) => s.brief_id === brief.id).sort((a, b) => a.position - b.position);

  const patch = async (fields) => {
    const { error: err } = await supabase.from('cc_briefs').update(fields).eq('id', brief.id);
    setError(err ? "We couldn't save that change. Try again." : '');
  };
  const addSection = async () => {
    const position = mine.length ? mine[mine.length - 1].position + 1 : 0;
    const { error: err } = await supabase.from('cc_brief_sections').insert({ brief_id: brief.id, project_id: projectId, position, title: '', body: '' });
    if (err) setError("We couldn't add a section. Try again.");
  };
  const move = async (i, dir) => {
    const a = mine[i], b = mine[i + dir];
    if (!a || !b) return;
    const r = await Promise.all([
      supabase.from('cc_brief_sections').update({ position: b.position }).eq('id', a.id),
      supabase.from('cc_brief_sections').update({ position: a.position }).eq('id', b.id),
    ]);
    if (r.some((x) => x.error)) setError("We couldn't reorder those sections. Try again.");
  };
  const remove = async (id) => {
    const { error: err } = await supabase.from('cc_brief_sections').delete().eq('id', id);
    if (err) setError("We couldn't remove that section. Try again.");
  };

  return (
    <article className="editor">
      <div className="editor-head">
        <span className="num">{code(brief.number)}</span>
        <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Brief title" placeholder="Untitled brief" />
        <SaveState state={tState} />
      </div>
      <div className="meta">
        <label>Status
          <select value={brief.status} onChange={(e) => patch({ status: e.target.value })}>
            {Object.entries(BRIEF_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Priority
          <select value={brief.priority} onChange={(e) => patch({ priority: e.target.value })}>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Due
          <input type="date" value={brief.deadline ?? ''} onChange={(e) => patch({ deadline: e.target.value || null })} />
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {mine.map((s, i) => (
        <Section key={s.id} s={s} first={i === 0} last={i === mine.length - 1} onMove={(d) => move(i, d)} onRemove={() => remove(s.id)} />
      ))}
      <button className="btn" onClick={addSection}><Plus size={15} /> Add a section</button>
      <p className="muted foot">Files, 3D scenes and sending to Claude attach here in the next steps. Your changes save automatically.</p>
    </article>
  );
}

export default function Briefs() {
  const { projectId } = useProject();
  const { briefId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const briefs = useTable('cc_briefs', projectId);
  const sections = useTable('cc_brief_sections', projectId, { order: 'position', ascending: true, limit: 1000 });
  const [choosing, setChoosing] = useState(params.get('new') === '1');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (params.get('new') === '1') setChoosing(true); }, [params]);
  const closeChooser = () => { setChoosing(false); if (params.has('new')) { params.delete('new'); setParams(params, { replace: true }); } };

  const create = async (key) => {
    setCreating(true); setError('');
    const t = TEMPLATES[key];
    const { data: b, error: err } = await supabase.from('cc_briefs').insert({ project_id: projectId, title: 'Untitled brief', template: key }).select().single();
    if (err) { setCreating(false); setError("We couldn't create the brief. Try again."); return; }
    const { error: err2 } = await supabase.from('cc_brief_sections').insert(t.sections.map((title, position) => ({ brief_id: b.id, project_id: projectId, position, title, body: '' })));
    setCreating(false);
    if (err2) setError('The brief was created but its sections could not be added. Use "Add a section".');
    closeChooser();
    navigate(`/briefs/${b.id}`);
  };

  const current = briefs.rows.find((b) => b.id === briefId);

  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Briefs</h1>
        <button className="btn primary" onClick={() => setChoosing(true)}><Plus size={15} /> New brief</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {choosing && (
        <div className="scrim" onMouseDown={closeChooser}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Choose a starting point" onMouseDown={(e) => e.stopPropagation()}>
            <h2>What kind of brief is this?</h2>
            <p className="muted">It only sets up the starting sections. You can add, remove and reorder them freely.</p>
            <div className="tpl">
              {Object.entries(TEMPLATES).map(([k, t]) => (
                <button key={k} disabled={creating} onClick={() => create(k)}>{t.label}</button>
              ))}
            </div>
            <button className="btn" onClick={closeChooser}>Cancel</button>
          </div>
        </div>
      )}

      <div className="split">
        <nav className="list" aria-label="All briefs">
          {briefs.state === 'loading' && <p className="muted pad">Loading…</p>}
          {briefs.state === 'ready' && briefs.rows.length === 0 && (
            <div className="empty">
              <p>No briefs yet.</p>
              <button className="btn primary" onClick={() => setChoosing(true)}>Create your first brief</button>
            </div>
          )}
          {briefs.rows.map((b) => (
            <Link key={b.id} to={`/briefs/${b.id}`} className={'item' + (b.id === briefId ? ' on' : '')}>
              <span className="num">{code(b.number)}</span>
              <span className="grow">{b.title}</span>
              <span className={`chip s-${b.status}`}>{BRIEF_STATUS[b.status]}</span>
              <span className="muted when">{timeAgo(b.updated_at)}</span>
            </Link>
          ))}
        </nav>
        <div className="pane">
          {current ? (
            <Editor key={current.id} brief={current} sections={sections.rows} projectId={projectId} />
          ) : briefId && briefs.state === 'ready' ? (
            <div className="empty"><p>That brief doesn't exist or was removed.</p><Link className="btn" to="/briefs">Back to all briefs</Link></div>
          ) : (
            briefs.rows.length > 0 && <div className="empty"><p>Pick a brief on the left to edit it.</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
