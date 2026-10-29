import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useProject } from '../lib/project.jsx';
import { supabase } from '../lib/supabase.js';

// Each check says what it found in plain words; raw detail stays behind "Technical details".
async function runChecks({ projectId, user }) {
  const out = [];
  const db = await supabase.from('cc_projects').select('id').limit(1);
  out.push(db.error
    ? { key: 'db', ok: false, title: 'Your project data', text: "Can't reach your saved data right now.", fix: 'Check your internet connection, then run the checks again.', detail: db.error.message }
    : { key: 'db', ok: true, title: 'Your project data', text: 'Connected. Your briefs and assets are saved.' });

  out.push({ key: 'auth', ok: true, title: 'Your sign-in', text: `Signed in as ${user.email}.` });

  const st = await supabase.storage.from('cc-files').list(projectId, { limit: 1 });
  out.push(st.error
    ? { key: 'files', ok: false, title: 'File storage', text: "Your private file storage isn't reachable.", fix: 'Run the checks again in a minute.', detail: st.error.message }
    : { key: 'files', ok: true, title: 'File storage', text: 'Ready. Uploading files comes in the next step.' });

  const live = await new Promise((resolve) => {
    const ch = supabase.channel('cc-check-' + Math.random().toString(36).slice(2, 7));
    const t = setTimeout(() => { supabase.removeChannel(ch); resolve({ ok: false, detail: 'timed out' }); }, 8000);
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED') { clearTimeout(t); supabase.removeChannel(ch); resolve({ ok: true }); }
      if (s === 'CHANNEL_ERROR' || s === 'CLOSED') { clearTimeout(t); supabase.removeChannel(ch); resolve({ ok: false, detail: s }); }
    });
  });
  out.push(live.ok
    ? { key: 'live', ok: true, title: 'Live updates', text: 'Working. Changes in one window appear in your other windows.' }
    : { key: 'live', ok: false, title: 'Live updates', text: "Changes might not appear in other windows until you reload.", fix: 'Run the checks again, or reload the page.', detail: live.detail });
  return out;
}

const LATER = [
  { title: 'Claude on your computer', text: 'Not set up yet. This lets Claude work on your real project files. Setup is a guided step that comes with the Ask Claude section.' },
  { title: 'Your code on GitHub', text: "Not connected yet. Needed to show what changed and when." },
  { title: 'Your published website', text: "Not connected yet. Needed to show whether the latest update went live." },
];

export default function Settings() {
  const { user } = useAuth();
  const { projectId, name } = useProject();
  const [checks, setChecks] = useState(null);

  const run = useCallback(async () => {
    setChecks(null);
    setChecks(await runChecks({ projectId, user }));
  }, [projectId, user]);
  useEffect(() => { run(); }, [run]);

  return (
    <div className="page">
      <h1>Setup &amp; connections</h1>
      <p className="muted lead">These checks run on their own. If something needs attention, it says what to do.</p>

      <section className="panel">
        <div className="panel-head"><h2>{name}</h2><button className="btn sm" onClick={run} disabled={!checks}>Run checks again</button></div>
        {!checks && <p className="muted">Checking…</p>}
        <ul className="checks">
          {checks?.map((c) => (
            <li key={c.key}>
              <i className={'dot ' + (c.ok ? 'ok' : 'bad')} aria-label={c.ok ? 'Working' : 'Needs attention'} />
              <div>
                <strong>{c.title}</strong>
                <p>{c.text}</p>
                {c.fix && <p className="fix">{c.fix}</p>}
                {c.detail && <details><summary>Technical details</summary><pre>{c.detail}</pre></details>}
              </div>
            </li>
          ))}
          {LATER.map((c) => (
            <li key={c.title}>
              <i className="dot off" aria-label="Not connected" />
              <div><strong>{c.title}</strong><p>{c.text}</p></div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
