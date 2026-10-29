import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Copy, Plus } from 'lucide-react';
import { useProject } from '../lib/project.jsx';
import { useTable } from '../lib/useTable.js';
import { supabase } from '../lib/supabase.js';
import { PERMISSIONS, RUN_STATUS, timeAgo } from '../lib/plain.js';
import { buildPieces, buildPrompt, roughTokens } from '../lib/context.js';

const code = (n) => `BR-${String(n).padStart(3, '0')}`;

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
const chipClass = (s) => ({ needs_review: 's-in_review', done: 's-done', running: 's-submitted', queued: 's-submitted', failed: 'bad', cancelled: '' }[s] ?? '');

function useData(projectId) {
  return {
    briefs: useTable('cc_briefs', projectId),
    sections: useTable('cc_brief_sections', projectId, { order: 'position', ascending: true, limit: 1000 }),
    files: useTable('cc_attachments', projectId, { order: 'created_at', limit: 500 }),
    scenes: useTable('cc_scenes', projectId),
    objects: useTable('cc_scene_objects', projectId, { order: 'created_at', ascending: true, limit: 2000 }),
    notes: useTable('cc_annotations', projectId, { order: 'created_at', ascending: true, limit: 2000 }),
    assets: useTable('cc_assets', projectId),
    guides: useTable('cc_guideline_sections', projectId, { order: 'position', ascending: true, limit: 200 }),
    runs: useTable('cc_runs', projectId),
  };
}

// Step: pick what Claude gets to see, how much freedom it has, and review the exact message.
function Composer({ projectId, data, parent, initialBriefId, onCreated, onCancel }) {
  const [briefId, setBriefId] = useState(initialBriefId ?? parent?.brief_id ?? '');
  const [permission, setPermission] = useState(parent?.permission ?? 'read_only');
  const [off, setOff] = useState(new Set());
  const [edited, setEdited] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const brief = data.briefs.rows.find((b) => b.id === briefId);

  const pieces = useMemo(() => (brief ? buildPieces({
    brief, sections: data.sections.rows, files: data.files.rows, scenes: data.scenes.rows, sceneObjects: data.objects.rows,
    annotations: data.notes.rows, assets: data.assets.rows, guidelines: data.guides.rows, parent,
  }) : []), [brief, data.sections.rows, data.files.rows, data.scenes.rows, data.objects.rows, data.notes.rows, data.assets.rows, data.guides.rows, parent]);

  // pieces that start switched off (scenes) are tracked as "off" until the owner turns them on
  const [touched, setTouched] = useState(new Set());
  const effectiveOff = useMemo(() => {
    const s = new Set(off);
    for (const p of pieces) if (!p.on && !touched.has(p.id)) s.add(p.id);
    return s;
  }, [pieces, off, touched]);

  const auto = useMemo(() => (brief ? buildPrompt({ brief, pieces, off: effectiveOff, permission }) : ''), [brief, pieces, effectiveOff, permission]);
  useEffect(() => { if (!edited) setText(auto); }, [auto, edited]);

  const toggle = (id) => {
    setTouched((t) => new Set(t).add(id));
    setOff((o) => { const n = new Set(o); const isOff = effectiveOff.has(id); if (isOff) n.delete(id); else n.add(id); return n; });
  };

  const create = async (andSend) => {
    if (!brief || !text.trim()) return;
    setBusy(true); setError('');
    const included = pieces.filter((p) => !effectiveOff.has(p.id)).map((p) => ({ id: p.id, group: p.group, label: p.label }));
    const copied = andSend ? await copyText(text) : false;
    const { data: run, error: err } = await supabase.from('cc_runs').insert({
      project_id: projectId, brief_id: brief.id, parent_run_id: parent?.id ?? null, title: brief.title, mode: 'manual',
      status: andSend ? 'running' : 'draft', permission, prompt: text, context: { included, approx_tokens: roughTokens(text) },
      started_at: andSend ? new Date().toISOString() : null,
    }).select().single();
    if (err) { setBusy(false); setError("We couldn't save this request. Try again."); return; }
    await supabase.from('cc_run_events').insert({ project_id: projectId, run_id: run.id, kind: 'status', text: andSend ? (copied ? 'You copied the message to send to Claude.' : 'You marked the message as sent (copying failed, copy it from the box).') : 'Saved as a draft.' });
    if (andSend && ['draft', 'ready'].includes(brief.status)) await supabase.from('cc_briefs').update({ status: 'submitted' }).eq('id', brief.id);
    setBusy(false);
    onCreated(run.id, andSend && !copied);
  };

  const groups = [...new Set(pieces.map((p) => p.group))];
  return (
    <div className="panel composer">
      <h2>{parent ? 'Ask Claude to revise' : 'New request for Claude'}</h2>
      {!parent && (
        <label className="fieldblock">Which brief is this about?
          <select value={briefId} onChange={(e) => { setBriefId(e.target.value); setOff(new Set()); setTouched(new Set()); setEdited(false); }}>
            <option value="">Choose a brief…</option>
            {data.briefs.rows.map((b) => <option key={b.id} value={b.id}>{code(b.number)}  {b.title}</option>)}
          </select>
        </label>
      )}
      {!brief && data.briefs.state === 'ready' && data.briefs.rows.length === 0 && <p className="muted">Write a brief first. Claude works from briefs. <Link to="/briefs?new=1">Create a brief</Link></p>}
      {brief && (
        <>
          <h3 className="step">1. What should Claude see?</h3>
          {groups.map((g) => (
            <div key={g}>
              <p className="muted small grouphead">{g}</p>
              <ul className="checks pieces">
                {pieces.filter((p) => p.group === g).map((p) => (
                  <li key={p.id}><label><input type="checkbox" checked={!effectiveOff.has(p.id)} onChange={() => toggle(p.id)} /> {p.label}</label></li>
                ))}
              </ul>
            </div>
          ))}
          {pieces.length === 0 && <p className="muted small">This brief has no text yet. Fill in at least one section first.</p>}

          <h3 className="step">2. What may Claude do?</h3>
          <div className="perms">
            {Object.entries(PERMISSIONS).map(([k, v]) => (
              <label key={k} className={'perm' + (permission === k ? ' on' : '')}>
                <input type="radio" name="perm" checked={permission === k} onChange={() => setPermission(k)} />
                <span><strong>{v.label}</strong><small>{v.help}</small></span>
              </label>
            ))}
          </div>

          <h3 className="step">3. Check the message</h3>
          <textarea className="prompt" value={text} onChange={(e) => { setText(e.target.value); setEdited(true); }} rows={16} aria-label="Message to Claude" />
          <p className="muted small">About {roughTokens(text).toLocaleString()} tokens (a rough estimate, not a bill or a usage limit).
            {edited && <> You edited this message. <button className="linkbtn" onClick={() => { setEdited(false); setText(auto); }}>Start again from my choices</button></>}</p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="insp-actions">
            <button className="btn primary" disabled={busy || !text.trim()} onClick={() => create(true)}><Copy size={14} /> Copy message and mark as sent</button>
            <button className="btn" disabled={busy || !text.trim()} onClick={() => create(false)}>Save as draft</button>
            <button className="btn" disabled title="Needs the small helper program on your computer. Not connected yet.">Send to Claude on my computer</button>
            <button className="btn" onClick={onCancel}>Cancel</button>
          </div>
          <p className="muted small">"Copy" puts the message on your clipboard. Paste it into Claude (claude.ai or Claude Code), then come back and paste Claude's reply here.</p>
        </>
      )}
      {!brief && <div className="insp-actions"><button className="btn" onClick={onCancel}>Cancel</button></div>}
    </div>
  );
}

function RunView({ run, data, projectId, onFollowUp }) {
  const navigate = useNavigate();
  const events = useTable('cc_run_events', projectId, { order: 'created_at', ascending: true, limit: 500, extra: (q) => q.eq('run_id', run.id), match: (r) => r.run_id === run.id, extraKey: run.id });
  const brief = data.briefs.rows.find((b) => b.id === run.brief_id);
  const [reply, setReply] = useState('');
  const [feedback, setFeedback] = useState(run.feedback);
  const [error, setError] = useState('');
  const [showPrompt, setShowPrompt] = useState(run.status === 'draft');
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(null);

  const log = (text, kind = 'status') => supabase.from('cc_run_events').insert({ project_id: projectId, run_id: run.id, kind, text });
  const setRun = async (fields) => {
    const { error: err } = await supabase.from('cc_runs').update(fields).eq('id', run.id);
    if (err) setError("We couldn't save that. Try again.");
    return !err;
  };
  const copy = async () => { const ok = await copyText(run.prompt); setCopied(ok ? 'Copied.' : 'Copying was blocked. Select the text in the box and press Ctrl+C.'); return ok; };

  const markSent = async () => {
    await copy();
    if (await setRun({ status: 'running', started_at: new Date().toISOString() })) {
      await log('You copied the message to send to Claude.');
      if (brief && ['draft', 'ready'].includes(brief.status)) await supabase.from('cc_briefs').update({ status: 'submitted' }).eq('id', brief.id);
    }
  };
  const saveReply = async () => {
    if (!reply.trim()) return;
    if (await setRun({ status: 'needs_review', result: reply.trim(), finished_at: new Date().toISOString() })) {
      await log("You pasted Claude's reply.");
      if (brief && ['draft', 'ready', 'submitted'].includes(brief.status)) await supabase.from('cc_briefs').update({ status: 'in_review' }).eq('id', brief.id);
      setReply('');
    }
  };
  const approve = async (markBriefDone) => {
    if (await setRun({ status: 'done', feedback })) {
      await log('You approved the result.');
      if (markBriefDone && brief) await supabase.from('cc_briefs').update({ status: 'done' }).eq('id', brief.id);
    }
  };
  const revise = async () => { if (await setRun({ feedback })) onFollowUp({ ...run, feedback }); };
  const cancel = async () => { if (await setRun({ status: 'cancelled', finished_at: new Date().toISOString() })) await log('You cancelled this request.'); };
  const removeDraft = async () => {
    const { error: err } = await supabase.from('cc_runs').delete().eq('id', run.id).eq('status', 'draft');
    if (err) setError("We couldn't delete that draft. Try again."); else navigate('/claude');
  };

  return (
    <div className="panel runview">
      <div className="panel-head">
        <h2>{run.title}</h2>
        <span className={`chip ${chipClass(run.status)}`}>{RUN_STATUS[run.status]}</span>
      </div>
      <p className="muted small">
        {brief ? <>From <Link className="link" to={`/briefs/${brief.id}`}>{code(brief.number)} {brief.title}</Link> · </> : 'Brief no longer exists · '}
        Claude's freedom: {PERMISSIONS[run.permission].label} · {run.mode === 'manual' ? 'sent by copy and paste' : 'sent to your computer'} · {timeAgo(run.created_at)}
      </p>
      {error && <p className="error" role="alert">{error}</p>}

      {run.status === 'draft' && (
        <div className="insp-actions">
          <button className="btn primary" onClick={markSent}><Copy size={14} /> Copy message and mark as sent</button>
          {confirm
            ? <button className="btn danger sm" onClick={removeDraft} onBlur={() => setConfirm(false)} autoFocus>Delete this draft</button>
            : <button className="btn" onClick={() => setConfirm(true)}>Delete draft</button>}
        </div>
      )}
      {copied && <p className="muted small" role="status">{copied}</p>}

      {run.status === 'running' && run.mode === 'manual' && (
        <div className="stepbox">
          <h3 className="step">Waiting for Claude's reply</h3>
          <p className="muted small">Paste the message into Claude, wait for its answer, then paste the whole answer here.</p>
          <textarea rows={8} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Paste Claude's reply here" aria-label="Claude's reply" />
          <div className="insp-actions">
            <button className="btn primary" disabled={!reply.trim()} onClick={saveReply}>Save the reply</button>
            <button className="btn" onClick={copy}><Copy size={14} /> Copy the message again</button>
            <button className="btn" onClick={cancel}>Cancel this request</button>
          </div>
        </div>
      )}

      {(run.status === 'needs_review' || run.status === 'done') && (
        <div className="stepbox">
          <h3 className="step">Claude's reply</h3>
          <pre className="result">{run.result}</pre>
          {run.status === 'needs_review' && (
            <>
              <label className="fieldblock">Your feedback (optional)
                <textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What should change? Leave empty if it's good." />
              </label>
              <div className="insp-actions">
                <button className="btn primary" onClick={() => approve(true)}>Approve and mark the brief Done</button>
                <button className="btn" onClick={() => approve(false)}>Approve only</button>
                <button className="btn" disabled={!feedback.trim()} onClick={revise}>Ask Claude to revise</button>
              </div>
            </>
          )}
          {run.status === 'done' && <div className="insp-actions"><button className="btn" onClick={() => onFollowUp(run)}>Start a follow-up</button></div>}
        </div>
      )}

      {['failed', 'cancelled'].includes(run.status) && (
        <div className="insp-actions"><button className="btn" onClick={() => onFollowUp(run)}>Try again as a new request</button></div>
      )}
      {run.error && <p className="error">{run.error}</p>}

      <details open={showPrompt} onToggle={(e) => setShowPrompt(e.currentTarget.open)}>
        <summary>The message that was prepared ({run.context?.included?.length ?? 0} pieces, about {(run.context?.approx_tokens ?? roughTokens(run.prompt)).toLocaleString()} tokens)</summary>
        <pre className="result">{run.prompt}</pre>
      </details>
      <h3 className="step">What happened</h3>
      <ul className="feed">
        {events.rows.length === 0 && <li className="muted">Nothing yet.</li>}
        {events.rows.map((e) => <li key={e.id}><span>{e.text}</span><time className="muted">{timeAgo(e.created_at)}</time></li>)}
      </ul>
    </div>
  );
}

export default function AskClaude() {
  const { projectId } = useProject();
  const { runId } = useParams();
  const navigate = useNavigate();
  const data = useData(projectId);
  const [composer, setComposer] = useState(null); // {parent?}
  const run = data.runs.rows.find((r) => r.id === runId);

  useEffect(() => { if (runId) setComposer(null); }, [runId]);
  const created = (id) => { setComposer(null); navigate(`/claude/${id}`); };

  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Ask Claude</h1>
        <button className="btn primary" onClick={() => { setComposer({}); navigate('/claude'); }}><Plus size={15} /> New request</button>
      </div>
      <p className="muted lead">Turn a brief into a message for Claude, keep track of what happened, and review the result before anything is called done. For now you copy the message to Claude yourself. Sending straight from here needs a small helper on your computer, which isn't connected yet.</p>
      <div className="split">
        <nav className="list" aria-label="All requests">
          {data.runs.state === 'ready' && data.runs.rows.length === 0 && <div className="empty"><p>No requests yet.</p></div>}
          {data.runs.rows.map((r) => (
            <Link key={r.id} to={`/claude/${r.id}`} className={'item' + (r.id === runId ? ' on' : '')}>
              <span className="grow">{r.title}</span>
              <span className={`chip ${chipClass(r.status)}`}>{RUN_STATUS[r.status]}</span>
              <span className="muted when">{timeAgo(r.updated_at)}</span>
            </Link>
          ))}
        </nav>
        <div className="pane">
          {composer ? (
            <Composer key={composer.parent?.id ?? 'new'} projectId={projectId} data={data} parent={composer.parent} onCreated={created} onCancel={() => setComposer(null)} />
          ) : run ? (
            <RunView key={run.id} run={run} data={data} projectId={projectId} onFollowUp={(parent) => setComposer({ parent })} />
          ) : runId && data.runs.state === 'ready' ? (
            <div className="empty"><p>That request doesn't exist or was removed.</p></div>
          ) : (
            <div className="empty"><p>Pick a request on the left, or start a new one.</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
