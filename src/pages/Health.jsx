import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Plus, X, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useProject } from '../lib/project.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useTable } from '../lib/useTable.js';
import { useBridge } from '../lib/bridge.js';
import { formatSize } from '../lib/files.js';
import { timeAgo } from '../lib/plain.js';

const BUILD_SHA = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : '';
const OWN_REPO = '24540300825-lab/vybin-command-center';

const short = (sha) => (sha ? sha.slice(0, 7) : '');

// ---------- GitHub (public repositories only, no sign-in needed) ----------
async function fetchCommits(repo) {
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=6`, { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 404) return { state: 'private', detail: 'HTTP 404' };
    if (r.status === 403 || r.status === 429) return { state: 'limited', detail: `HTTP ${r.status}` };
    if (!r.ok) return { state: 'error', detail: `HTTP ${r.status}` };
    const list = await r.json();
    return {
      state: 'ok',
      commits: list.map((c) => ({
        sha: c.sha,
        message: String(c.commit.message).split('\n')[0],
        author: c.commit.author?.name ?? '',
        date: c.commit.author?.date ?? c.commit.committer?.date,
        url: c.html_url,
      })),
    };
  } catch (e) {
    return { state: 'error', detail: String(e.message || e) };
  }
}

// A browser can't read another website's status code, so this only learns whether the site answered at all.
async function pingSite(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  const started = Date.now();
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctl.signal });
    return { state: 'up', ms: Date.now() - started };
  } catch (e) {
    return { state: 'down', detail: String(e.name === 'AbortError' ? 'no answer within 9 seconds' : e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

function Badge({ tone, children }) {
  return <span className={`chip ${tone === 'ok' ? 's-ready' : tone === 'bad' ? 'bad' : tone === 'warn' ? 's-in_review' : ''}`}>{children}</span>;
}

function Row({ tone, title, text, extra }) {
  return (
    <li>
      <span className={`dot ${tone === 'ok' ? 'ok' : tone === 'bad' ? 'bad' : 'off'}`} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong>{title}</strong>
        <p>{text}</p>
        {extra}
      </div>
    </li>
  );
}

function CommitList({ repo, refreshKey, onLatest }) {
  const [res, setRes] = useState({ state: 'loading' });
  useEffect(() => {
    let alive = true;
    setRes({ state: 'loading' });
    fetchCommits(repo).then((r) => { if (alive) { setRes(r); if (r.state === 'ok') onLatest?.(r.commits[0]?.sha); } });
    return () => { alive = false; };
  }, [repo, refreshKey]);

  if (res.state === 'loading') return <p className="muted">Looking at {repo}…</p>;
  if (res.state === 'private')
    return <p className="muted">We can't see {repo} from here. It may be private or the name may be mistyped. Nothing is broken; only public repositories can be shown.</p>;
  if (res.state === 'limited')
    return <p className="muted">GitHub asked us to slow down for a while. Try again in a few minutes.</p>;
  if (res.state === 'error')
    return (
      <>
        <p className="muted">We couldn't reach GitHub right now.</p>
        <details><summary>Technical details</summary><pre>{res.detail}</pre></details>
      </>
    );
  return (
    <ul className="feed">
      {res.commits.map((c) => (
        <li key={c.sha}>
          <span style={{ minWidth: 0 }}>
            <a href={c.url} target="_blank" rel="noreferrer">{c.message}</a>
            <small className="muted" style={{ display: 'block' }}>{short(c.sha)}{c.author ? ` · ${c.author}` : ''}</small>
          </span>
          <time className="muted">{c.date ? timeAgo(c.date) : ''}</time>
        </li>
      ))}
    </ul>
  );
}

function SiteRow({ link, refreshKey }) {
  const [res, setRes] = useState(null);
  useEffect(() => {
    let alive = true;
    setRes(null);
    pingSite(link.value).then((r) => { if (alive) setRes(r); });
    return () => { alive = false; };
  }, [link.value, refreshKey]);
  const name = link.label || link.value;
  if (!res) return <Row tone="off" title={name} text="Checking…" />;
  return res.state === 'up'
    ? <Row tone="ok" title={name} text={`Answered in about ${Math.max(1, Math.round(res.ms / 100) / 10)} s. (We can only tell that the site responded, not whether every page works.)`} extra={<a className="more" href={link.value} target="_blank" rel="noreferrer">Open site <ExternalLink size={13} /></a>} />
    : <Row tone="bad" title={name} text="The site didn't answer. It might be down, or your connection might be offline." extra={<details><summary>Technical details</summary><pre>{res.detail}</pre></details>} />;
}

// ---------- Counts and storage from your own database ----------
function useCounts(projectId, refreshKey) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const count = async (table, f) => {
        let q = supabase.from(table).select('id', { count: 'exact', head: true }).eq('project_id', projectId);
        if (f) q = f(q);
        const { count: n, error } = await q;
        return error ? null : n;
      };
      const [briefs, assets, scenes, runs] = await Promise.all([
        count('cc_briefs'), count('cc_assets'), count('cc_scenes'), count('cc_runs'),
      ]);
      const { data: files, error } = await supabase.from('cc_attachments').select('size_bytes,status').eq('project_id', projectId).limit(5000);
      let used = null, kept = null, nFiles = null;
      if (!error) {
        used = files.filter((f) => f.status !== 'archived').reduce((a, f) => a + (f.size_bytes || 0), 0);
        kept = files.filter((f) => f.status === 'archived').reduce((a, f) => a + (f.size_bytes || 0), 0);
        nFiles = files.filter((f) => f.status !== 'archived').length;
      }
      if (alive) setData({ briefs, assets, scenes, runs, used, kept, nFiles });
    })();
    return () => { alive = false; };
  }, [projectId, refreshKey]);
  return data;
}

function AddLink({ onAdd, canEdit }) {
  const [kind, setKind] = useState('github');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState('');
  if (!canEdit) return null;
  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    let v = value.trim();
    if (kind === 'github') {
      v = v.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/$/, '');
      if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(v)) { setMsg('Write it like owner/repository, or paste the GitHub page address.'); return; }
    } else {
      if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
      try { v = new URL(v).origin + (new URL(v).pathname === '/' ? '' : new URL(v).pathname); } catch { setMsg("That doesn't look like a web address."); return; }
    }
    const err = await onAdd({ kind, value: v, label: label.trim() });
    if (err) setMsg(/duplicate|unique/i.test(err) ? 'That one is already on the list.' : "Couldn't save it. Try again.");
    else { setValue(''); setLabel(''); }
  };
  return (
    <form onSubmit={submit} className="fields" style={{ marginTop: 12, alignItems: 'end' }}>
      <label>What to add
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="github">A GitHub repository (code)</option>
          <option value="site">A website to watch</option>
        </select>
      </label>
      <label>{kind === 'github' ? 'Repository (owner/name or its GitHub address)' : 'Website address'}
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === 'github' ? 'for example: your-name/vybin-game' : 'for example: https://your-game.vercel.app'} />
      </label>
      <label>Name (optional)
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="for example: VY/BIN game" />
      </label>
      <div><button className="btn primary" disabled={!value.trim()} type="submit"><Plus size={15} /> Add</button></div>
      {msg && <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>{msg}</p>}
    </form>
  );
}

export default function Health() {
  const { projectId } = useProject();
  const { user } = useAuth();
  const links = useTable('cc_project_links', projectId, { order: 'created_at', ascending: true });
  const bridge = useBridge(projectId);
  const [refreshKey, setRefreshKey] = useState(0);
  const [latest, setLatest] = useState({});
  const counts = useCounts(projectId, refreshKey);
  const [removing, setRemoving] = useState(null);

  const repos = links.rows.filter((l) => l.kind === 'github');
  const sites = links.rows.filter((l) => l.kind === 'site');
  const canEdit = Boolean(user);

  const add = useCallback(async ({ kind, value, label }) => {
    const { data, error } = await supabase.from('cc_project_links').insert({ project_id: projectId, kind, value, label }).select().single();
    if (!error && data) links.setRows((cur) => (cur.some((r) => r.id === data.id) ? cur : [...cur, data]));
    return error ? error.message : null;
  }, [projectId]);
  const remove = async (id) => {
    const { error } = await supabase.from('cc_project_links').delete().eq('id', id);
    setRemoving(null);
    if (!error) links.setRows((cur) => cur.filter((r) => r.id !== id));
  };

  // Is the website that is open right now built from the newest code?
  const newest = latest[OWN_REPO];
  let version;
  if (!BUILD_SHA) version = { tone: 'off', title: 'This website’s version', text: "This copy of the site doesn't know which version of the code it was built from, so it can't compare." };
  else if (!newest) version = { tone: 'off', title: 'This website’s version', text: `Built from code version ${short(BUILD_SHA)}. Waiting for GitHub to compare it with the newest code…` };
  else if (newest === BUILD_SHA) version = { tone: 'ok', title: 'This website is up to date', text: `The site you're using was built from the newest code (${short(BUILD_SHA)}).` };
  else version = { tone: 'warn', title: 'Newer code exists that is not published yet', text: `You're on ${short(BUILD_SHA)}; the newest is ${short(newest)}. Ask Claude to publish the latest update.` };

  return (
    <div className="page">
      <div className="panel-head" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Project health</h1>
        <button className="btn sm" onClick={() => setRefreshKey((n) => n + 1)}><RefreshCw size={14} /> Check again</button>
      </div>
      <p className="lead muted">What's actually happening with your code, your sites and your saved data right now. Everything here is read live. Nothing is estimated.</p>

      <section className="panel" aria-label="Summary">
        <div className="panel-head"><h2>At a glance</h2></div>
        <ul className="checks">
          <Row tone={version.tone === 'warn' ? 'bad' : version.tone} title={version.title} text={version.text} />
          <Row
            tone={bridge.online ? 'ok' : 'off'}
            title="Claude on your computer"
            text={bridge.online ? `Connected: ${bridge.online.name}.` : bridge.devices.length ? 'Paired, but the helper window is not running. Open Start-Vybin-Helper to use Claude.' : 'Not connected yet. See Setup & connections.'}
          />
        </ul>
      </section>

      <section className="panel" aria-label="Your data">
        <div className="panel-head"><h2>Your saved data</h2></div>
        {!counts ? <p className="muted">Counting…</p> : (
          <>
            <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              <div className="stat"><span className="stat-value">{counts.briefs ?? '–'}</span><span className="stat-label">Briefs</span></div>
              <div className="stat"><span className="stat-value">{counts.assets ?? '–'}</span><span className="stat-label">Assets</span></div>
              <div className="stat"><span className="stat-value">{counts.scenes ?? '–'}</span><span className="stat-label">3D scenes</span></div>
              <div className="stat"><span className="stat-value">{counts.runs ?? '–'}</span><span className="stat-label">Claude requests</span></div>
              <div className="stat"><span className="stat-value">{counts.used == null ? '–' : formatSize(counts.used)}</span><span className="stat-label">{counts.nFiles ?? 0} files in use</span>{counts.kept ? <span className="stat-hint">+ {formatSize(counts.kept)} removed from view but kept</span> : null}</div>
            </div>
            <p className="muted" style={{ marginTop: 10 }}>File sizes are the original uploads you added here. Removing a file only hides it; the original is never deleted.</p>
          </>
        )}
      </section>

      <section className="panel" aria-label="Code on GitHub">
        <div className="panel-head"><h2>Code on GitHub</h2></div>
        {links.state !== 'ready' && <p className="muted">Loading…</p>}
        {links.state === 'ready' && repos.length === 0 && <p className="muted">No code repository added yet. Add the one that holds your VY/BIN game below.</p>}
        {repos.map((l) => (
          <div key={l.id} style={{ marginBottom: 16 }}>
            <div className="panel-head">
              <strong>{l.label || l.value} <span className="muted" style={{ fontWeight: 400 }}>· {l.value}</span></strong>
              {removing === l.id
                ? <span><button className="btn sm danger" onClick={() => remove(l.id)}>Stop watching</button> <button className="btn sm" onClick={() => setRemoving(null)}>Cancel</button></span>
                : <button className="btn sm" aria-label={`Stop watching ${l.value}`} onClick={() => setRemoving(l.id)}><X size={14} /></button>}
            </div>
            <CommitList repo={l.value} refreshKey={refreshKey} onLatest={(sha) => setLatest((cur) => ({ ...cur, [l.value]: sha }))} />
          </div>
        ))}
      </section>

      <section className="panel" aria-label="Websites">
        <div className="panel-head"><h2>Websites</h2></div>
        {sites.length === 0 && links.state === 'ready' && <p className="muted">No website added yet. Add your published VY/BIN game to see whether it's reachable.</p>}
        <div>
          {sites.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <ul className="checks" style={{ flex: 1 }}><SiteRow link={l} refreshKey={refreshKey} /></ul>
              {removing === l.id
                ? <span style={{ paddingTop: 8, whiteSpace: 'nowrap' }}><button className="btn sm danger" onClick={() => remove(l.id)}>Stop watching</button> <button className="btn sm" onClick={() => setRemoving(null)}>Cancel</button></span>
                : <button className="btn sm" style={{ marginTop: 8 }} aria-label={`Stop watching ${l.value}`} onClick={() => setRemoving(l.id)}><X size={14} /></button>}
            </div>
          ))}
        </div>
        <AddLink onAdd={add} canEdit={canEdit} />
      </section>

      <section className="panel" aria-label="Not connected">
        <div className="panel-head"><h2>Not connected</h2> <Badge>Optional</Badge></div>
        <ul className="checks">
          <Row tone="off" title="Publish history and build errors (Vercel)" text="Not connected. Reading it needs a read-only Vercel access that you would create and store yourself; it must never be pasted into this site. We can add it later using a private server-side function." />
          <Row tone="off" title="Private GitHub repositories" text="Only public repositories can be shown today, for the same reason." />
        </ul>
      </section>
    </div>
  );
}
