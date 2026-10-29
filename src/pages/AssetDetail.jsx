import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useProject } from '../lib/project.jsx';
import { useTable } from '../lib/useTable.js';
import { useDraft } from '../lib/useDraft.js';
import { supabase } from '../lib/supabase.js';
import { ASSET_STATUS } from '../lib/plain.js';
import FilesPanel from '../components/FilesPanel.jsx';
import VersionHistory from '../components/VersionHistory.jsx';
import { CATEGORY_NAMES } from './Assets.jsx';

function Save({ state }) {
  return <span className={`save ${state}`} aria-live="polite">{state === 'saving' ? 'Saving…' : state === 'error' ? "Couldn't save. Keep typing to retry." : 'Saved'}</span>;
}

function Detail({ asset, projectId }) {
  const upd = async (fields) => (await supabase.from('cc_assets').update(fields).eq('id', asset.id)).error;
  const [name, setName, s1] = useDraft(asset.name, (v) => upd({ name: v.trim() || asset.name }));
  const [notes, setNotes, s2] = useDraft(asset.notes, (v) => upd({ notes: v }));
  const [tags, setTags, s3] = useDraft(asset.tags.join(', '), (v) => upd({ tags: v.split(',').map((t) => t.trim()).filter(Boolean) }));
  const state = [s1, s2, s3].includes('error') ? 'error' : [s1, s2, s3].includes('saving') ? 'saving' : 'saved';
  return (
    <>
      <div className="editor-head">
        <span className="num">{asset.code}</span>
        <input className="title-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Asset name" />
        <Save state={state} />
      </div>
      <div className="panel">
        <div className="fields">
          <label>Status
            <select value={asset.status} onChange={(e) => upd({ status: e.target.value })}>
              {Object.entries(ASSET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Type
            <select value={asset.category} onChange={(e) => upd({ category: e.target.value })}>
              {Object.entries(CATEGORY_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Tags (separate with commas)
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. forest, hero" />
          </label>
        </div>
        <label className="fieldblock">Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Style, size, where it is used, anything the artist should know." />
        </label>
      </div>
      <FilesPanel projectId={projectId} assetId={asset.id} title="Add a file or a new version" />
      <VersionHistory projectId={projectId} asset={asset} />
    </>
  );
}

export default function AssetDetail() {
  const { assetId } = useParams();
  const { projectId } = useProject();
  const { rows, state } = useTable('cc_assets', projectId);
  const asset = rows.find((a) => a.id === assetId);
  return (
    <div className="page">
      <Link className="crumb" to="/assets"><ArrowLeft size={14} /> All assets</Link>
      {asset ? <Detail key={asset.id} asset={asset} projectId={projectId} />
        : state === 'ready' ? <div className="empty"><p>That asset doesn't exist or was removed.</p></div>
        : <p className="muted">Loading…</p>}
    </div>
  );
}
