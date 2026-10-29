import { useRef, useState } from 'react';
import { File as FileIcon, Image as ImageIcon, Box, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useTable } from '../lib/useTable.js';
import { KIND_LABEL, formatSize, kindOf, rejectReason, uploadFile } from '../lib/files.js';
import { timeAgo } from '../lib/plain.js';
import FilePreview from './FilePreview.jsx';

const STATUS = { uploading: 'Uploading…', processing: 'Reading details…', uploaded: 'Saved', ready: 'Saved', failed: "Didn't finish" };

// Files attached to one brief or one asset. Pass briefId or assetId.
export default function FilesPanel({ projectId, briefId = null, assetId = null, title = 'Files' }) {
  const col = briefId ? 'brief_id' : 'asset_id';
  const key = briefId ?? assetId;
  const { rows } = useTable('cc_attachments', projectId, {
    order: 'created_at', ascending: false, extra: (q) => q.eq(col, key), match: (r) => r[col] === key, extraKey: key,
  });
  const files = rows.filter((r) => r.status !== 'archived');
  const input = useRef(null);
  const [progress, setProgress] = useState({}); // id → 0..1 for uploads running in this window
  const [problems, setProblems] = useState([]);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const add = async (list) => {
    const bad = [];
    for (const file of Array.from(list)) {
      const why = rejectReason(file);
      if (why) { bad.push(why); continue; }
      const tmp = `${file.name}:${file.size}`;
      setProgress((p) => ({ ...p, [tmp]: 0 }));
      const res = await uploadFile({
        projectId, file, briefId, assetId,
        onProgress: (f) => setProgress((p) => ({ ...p, [tmp]: f })),
      });
      setProgress((p) => { const n = { ...p }; delete n[tmp]; return n; });
      if (res.error) bad.push(res.error + ' It is listed below so you can try again.');
    }
    setProblems(bad);
  };

  // "Remove" hides the file from this list. The stored original is never deleted.
  const archive = async (f) => {
    const { error } = await supabase.from('cc_attachments').update({ status: 'archived' }).eq('id', f.id);
    setConfirm(null);
    if (error) setProblems(["We couldn't remove that file from the list. Try again."]);
  };

  const icon = (name) => { const k = kindOf(name); return k === 'model' ? <Box size={16} /> : k === 'image' || k === 'svg' ? <ImageIcon size={16} /> : <FileIcon size={16} />; };
  const running = Object.entries(progress);

  return (
    <section className="panel files">
      <div className="panel-head">
        <h2>{title}</h2>
        <button className="btn sm" onClick={() => input.current?.click()}><Upload size={14} /> Add files</button>
        <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      <div
        className={'drop' + (over ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        Drop files here, or use "Add files". 3D models (.glb), images, PDFs, video and documents all work. Up to 50 MB each.
      </div>
      {problems.map((p, i) => <p key={i} className="error" role="alert">{p}</p>)}
      {running.map(([k, f]) => (
        <div key={k} className="uprow"><span className="grow">{k.split(':')[0]}</span><progress value={f} max="1" /><span className="muted small">{Math.round(f * 100)}%</span></div>
      ))}
      {files.length === 0 && running.length === 0 && <p className="muted small">Nothing attached yet.</p>}
      <ul className="filelist">
        {files.map((f) => (
          <li key={f.id}>
            <button className="filebtn" onClick={() => f.status !== 'uploading' && setOpen(f)} disabled={f.status === 'uploading'}>
              {icon(f.name)}
              <span className="grow">{f.name}</span>
              <span className="muted small">{KIND_LABEL[kindOf(f.name)]} · {formatSize(f.size_bytes)}</span>
            </button>
            <span className={'chip' + (f.status === 'failed' ? ' bad' : '')}>{STATUS[f.status] ?? f.status}</span>
            <span className="muted small when">{timeAgo(f.created_at)}</span>
            {confirm === f.id ? (
              <button className="btn sm" onClick={() => archive(f)} onBlur={() => setConfirm(null)} autoFocus>Hide from list (original stays safe)</button>
            ) : (
              <button className="btn sm" onClick={() => setConfirm(f.id)}>Remove</button>
            )}
          </li>
        ))}
      </ul>
      {open && <FilePreview file={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
