import { lazy, Suspense, useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { KIND_LABEL, formatSize, kindOf, signedUrl } from '../lib/files.js';

const ModelPreview = lazy(() => import('./ModelPreview.jsx'));

function Stat({ label, value }) {
  return <div className="mstat"><strong>{value}</strong><span>{label}</span></div>;
}

export default function FilePreview({ file, onClose }) {
  const kind = kindOf(file.name);
  const [url, setUrl] = useState(null);
  const [text, setText] = useState(null);
  const [live, setLive] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const u = await signedUrl(file.storage_path);
      if (!alive) return;
      if (!u) { setFailed(true); return; }
      setUrl(u);
      if (kind === 'text' && file.size_bytes < 400_000) {
        try { const r = await fetch(u); const t = await r.text(); if (alive) setText(t); } catch { /* shown as download only */ }
      }
    })();
    return () => { alive = false; };
  }, [file.storage_path]);

  const download = async () => { const u = await signedUrl(file.storage_path, 300, true); if (u) window.location.href = u; };
  const m = live ?? file.meta?.model;

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog preview" role="dialog" aria-modal="true" aria-label={`Preview of ${file.name}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="preview-head">
          <div className="grow"><strong>{file.name}</strong><div className="muted small">{KIND_LABEL[kind]} · {formatSize(file.size_bytes)}</div></div>
          <button className="btn sm" onClick={download}><Download size={14} /> Download</button>
          <button className="icon-btn" onClick={onClose} aria-label="Close preview"><X size={16} /></button>
        </div>
        <div className="preview-body">
          {failed && <p className="error">We couldn't open this file right now. Try again in a moment.</p>}
          {!url && !failed && <p className="muted">Opening…</p>}
          {url && kind === 'model' && file.name.toLowerCase().endsWith('.glb') && (
            <Suspense fallback={<p className="muted">Loading the 3D viewer…</p>}><ModelPreview url={url} onStats={setLive} /></Suspense>
          )}
          {url && (kind === 'image' || kind === 'svg') && <img className="preview-img" src={url} alt={file.name} />}
          {url && kind === 'video' && <video src={url} controls className="preview-img" />}
          {url && kind === 'audio' && <audio src={url} controls />}
          {url && kind === 'pdf' && <p>PDFs open in their own tab.<br /><a className="btn" href={url} target="_blank" rel="noreferrer">Open the PDF</a></p>}
          {url && kind === 'text' && (text != null ? <pre className="preview-text">{text}</pre> : <p className="muted">Too large to show here. Use Download.</p>)}
          {url && !['model', 'image', 'svg', 'video', 'audio', 'pdf', 'text'].includes(kind) && (
            <p className="muted">There's no preview for this kind of file. It's stored safely. Use Download to open it.</p>
          )}
          {url && kind === 'model' && !file.name.toLowerCase().endsWith('.glb') && <p className="muted">Only .glb models can be previewed for now.</p>}
        </div>
        {m && (
          <div className="mstats">
            <Stat label="triangles" value={m.triangles.toLocaleString()} />
            <Stat label="meshes" value={m.meshes} />
            <Stat label="materials" value={m.materials} />
            <Stat label="textures" value={m.textures} />
            <Stat label="animations" value={m.animations} />
            <Stat label="size (units)" value={m.size.join(' × ')} />
          </div>
        )}
        {file.meta?.processing_error && <p className="muted small">{file.meta.processing_error}</p>}
      </div>
    </div>
  );
}
