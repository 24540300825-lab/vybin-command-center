import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useProject } from '../lib/project.jsx';
import { supabase } from '../lib/supabase.js';
import { useBridge } from '../lib/bridge.js';
import { timeAgo } from '../lib/plain.js';

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
    : { key: 'files', ok: true, title: 'File storage', text: 'Ready. Files you add are kept privately and never deleted from here.' });

  const live = await new Promise((resolve) => {
    const ch = supabase.channel(`cc-check:${projectId}:${Math.random().toString(36).slice(2, 7)}`, { config: { private: true } });
    const t = setTimeout(() => { supabase.removeChannel(ch); resolve({ ok: false, detail: 'timed out' }); }, 8000);
    ch.subscribe((s, err) => {
      if (s === 'SUBSCRIBED') { clearTimeout(t); supabase.removeChannel(ch); resolve({ ok: true }); }
      if (s === 'CHANNEL_ERROR' || s === 'CLOSED') { clearTimeout(t); supabase.removeChannel(ch); resolve({ ok: false, detail: `${s}${err?.message ? ': ' + err.message : ''}` }); }
    });
  });
  out.push(live.ok
    ? { key: 'live', ok: true, title: 'Live updates', text: 'Working. Changes in one window appear in your other windows.' }
    : { key: 'live', ok: false, title: 'Live updates', text: "Changes might not appear in other windows until you reload.", fix: 'Run the checks again, or reload the page.', detail: live.detail });
  return out;
}

const LATER = [
  { title: 'Your code on GitHub', text: "Not connected yet. Needed to show what changed and when." },
  { title: 'Your published website', text: "Not connected yet. Needed to show whether the latest update went live." },
];

function ConnectClaude({ projectId }) {
  const bridge = useBridge(projectId);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {ok, text}
  const [confirm, setConfirm] = useState(null);

  const approve = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('cc_bridge_approve_pairing', { p_code: code, p_project: projectId });
    setBusy(false);
    if (error) setMsg({ ok: false, text: /code_not_found/.test(error.message) ? "That code isn't waiting for approval. Check the code in the helper window, or start the helper again for a new one." : "We couldn't connect that computer. Try again." });
    else { setMsg({ ok: true, text: `Connected "${data.name}". Keep the helper window open.` }); setCode(''); }
  };
  const disconnect = async (id) => {
    const { error } = await supabase.rpc('cc_bridge_revoke', { p_device: id });
    setConfirm(null);
    if (error) setMsg({ ok: false, text: "We couldn't disconnect that computer. Try again." });
  };

  return (
    <section className="panel">
      <div className="panel-head"><h2>Claude on your computer</h2></div>
      <p className="muted">A small helper program on your computer lets this website send a request straight to the Claude Code you already use. This website never sees your Claude password or login. The helper works only inside the one project folder you choose, and only as far as each request allows.</p>
      {bridge.devices.length > 0 && (
        <ul className="checks">
          {bridge.devices.map((d) => (
            <li key={d.id}>
              <i className={'dot ' + (d.online ? 'ok' : 'off')} />
              <div className="grow">
                <strong>{d.name}</strong>
                <p>{d.online ? 'Connected and waiting for requests.' : d.last_seen_at ? `Not running. Last seen ${timeAgo(d.last_seen_at)}. Start the helper again.` : 'Paired, but the helper has not checked in yet.'}</p>
                {d.info?.folder && <p className="small">Project folder: {d.info.folder} · Claude Code {d.info.claude}</p>}
              </div>
              {confirm === d.id
                ? <button className="btn danger sm" onClick={() => disconnect(d.id)} onBlur={() => setConfirm(null)} autoFocus>Disconnect this computer</button>
                : <button className="btn sm" onClick={() => setConfirm(d.id)}>Disconnect</button>}
            </li>
          ))}
        </ul>
      )}
      <h3 className="step">{bridge.devices.length ? 'Connect another computer' : 'Connect this computer'}</h3>
      <ol className="steps">
        <li>You need <strong>Node.js</strong> (nodejs.org, the normal installer) and <strong>Claude Code</strong> already installed and signed in on that computer.</li>
        <li>Download these two files into <strong>one new folder</strong> (for example <code>C:\VYBIN-helper</code>), then double-click the starter. Windows or Chrome may warn about a downloaded file: choose "Keep". Both are plain text you can open and read.
          <div className="dl">
            <a className="btn" href="/vybin-bridge.mjs" download="vybin-bridge.mjs"><Download size={14} /> 1. The helper (vybin-bridge.mjs)</a>
            <a className="btn" href="/Start-Vybin-Helper.bat" download="Start-Vybin-Helper.bat"><Download size={14} /> 2. The starter (Start-Vybin-Helper.bat)</a>
          </div>
        </li>
        <li>The helper asks for your project folder, then shows an 8-character code. Type it here:</li>
      </ol>
      <form className="inline-form" onSubmit={approve}>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-1234" aria-label="Connection code" maxLength={9} />
        <button className="btn primary" disabled={busy || code.replace('-', '').length < 8}>Connect</button>
      </form>
      {msg && <p className={msg.ok ? 'ok-text' : 'error'} role="status">{msg.text}</p>}
    </section>
  );
}

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

      <ConnectClaude projectId={projectId} />

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
