import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useTable } from '../lib/useTable.js';
import { useDraft } from '../lib/useDraft.js';
import { formatSize } from '../lib/files.js';
import { timeAgo } from '../lib/plain.js';
import FilePreview from './FilePreview.jsx';

function Note({ v }) {
  const [text, setText, state] = useDraft(v.note, async (t) => (await supabase.from('cc_asset_versions').update({ note: t }).eq('id', v.id)).error);
  return (
    <input className="vnote" value={text} onChange={(e) => setText(e.target.value)} placeholder="What changed in this version? (optional)" aria-label={`Note for version ${v.version}`}
      title={state === 'error' ? "Couldn't save this note" : undefined} />
  );
}

// Every file added to an asset becomes the next version. Older versions are kept and can be made current again.
export default function VersionHistory({ projectId, asset }) {
  const mine = { extra: (q) => q.eq('asset_id', asset.id), match: (r) => r.asset_id === asset.id, extraKey: asset.id };
  const versions = useTable('cc_asset_versions', projectId, { order: 'version', ascending: false, ...mine });
  const files = useTable('cc_attachments', projectId, { order: 'created_at', ...mine });
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const fileOf = (id) => files.rows.find((f) => f.id === id);

  const makeCurrent = async (v) => {
    setError('');
    const { error: err } = await supabase.rpc('cc_set_current_version', { p_version_id: v.id });
    if (err) setError("We couldn't switch versions. Try again.");
  };

  if (versions.state === 'ready' && versions.rows.length === 0) {
    return <section className="panel"><h2>Versions</h2><p className="muted small">No versions yet. The first file you add becomes version 1. Add a newer file later and it becomes the next version; older ones are kept.</p></section>;
  }
  return (
    <section className="panel">
      <h2>Versions</h2>
      <p className="muted small">The current version is the one your world should use. Older versions are never deleted.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="filelist">
        {versions.rows.map((v) => {
          const f = fileOf(v.attachment_id);
          const isCurrent = asset.current_attachment_id === v.attachment_id;
          return (
            <li key={v.id} className="vrow">
              <span className="num">v{v.version}</span>
              <div className="grow vmain">
                <button className="filebtn" onClick={() => f && setOpen(f)} disabled={!f}>
                  <span className="grow">{f ? f.name : 'File'}</span>
                  {f && <span className="muted small">{formatSize(f.size_bytes)}</span>}
                </button>
                <Note v={v} />
              </div>
              <span className="muted small when">{timeAgo(v.created_at)}</span>
              {isCurrent ? <span className="chip s-available">Current</span> : <button className="btn sm" onClick={() => makeCurrent(v)}>Make current</button>}
            </li>
          );
        })}
      </ul>
      {open && <FilePreview file={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
