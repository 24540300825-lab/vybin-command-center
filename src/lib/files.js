import { supabase } from './supabase.js';

export const BUCKET = 'cc-files';
export const MAX_BYTES = 50 * 1024 * 1024; // matches the storage bucket limit
const RESUMABLE_ABOVE = 6 * 1024 * 1024;
// Never accepted: programs that run by themselves. Uploaded files are stored, never executed.
const BLOCKED = new Set(['exe', 'msi', 'scr', 'com', 'dll', 'bat', 'cmd', 'vbs']);

const KINDS = {
  model: ['glb', 'gltf'],
  model_other: ['fbx', 'obj', 'stl', 'blend'],
  image: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'],
  svg: ['svg'],
  video: ['mp4', 'mov', 'webm', 'm4v'],
  audio: ['mp3', 'wav', 'ogg', 'm4a'],
  pdf: ['pdf'],
  text: ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'html', 'css', 'py', 'csv', 'xml', 'yaml', 'yml'],
  archive: ['zip'],
  office: ['docx', 'xlsx', 'pptx'],
  design: ['psd', 'ai', 'eps'],
};
export const KIND_LABEL = {
  model: '3D model', model_other: '3D file', image: 'Image', svg: 'Vector image', video: 'Video', audio: 'Audio', pdf: 'PDF',
  text: 'Text or code', archive: 'Archive', office: 'Office document', design: 'Design file', other: 'File',
};

export const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
export function kindOf(name) {
  const e = extOf(name);
  for (const [k, list] of Object.entries(KINDS)) if (list.includes(e)) return k;
  return 'other';
}
export function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
// Returns a plain-language reason if the file can't be accepted, else null.
export function rejectReason(file) {
  if (BLOCKED.has(extOf(file.name))) return `"${file.name}" is a program file. Programs can't be stored here.`;
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_BYTES) return `"${file.name}" is ${formatSize(file.size)}. The limit is ${formatSize(MAX_BYTES)} for now. Add a link to where the large file lives instead.`;
  return null;
}
function safeName(name) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+/, '');
  return (base || 'file').slice(-100);
}

// Uploads one file. A database record exists before the first byte is sent, so a file is never silently lost.
export async function uploadFile({ projectId, file, briefId = null, assetId = null, onProgress, onStatus }) {
  const id = crypto.randomUUID();
  const path = `${projectId}/${id}/${safeName(file.name)}`;
  const contentType = file.type || 'application/octet-stream';
  const { error: insErr } = await supabase.from('cc_attachments').insert({
    id, project_id: projectId, brief_id: briefId, asset_id: assetId, name: file.name, mime: contentType, size_bytes: file.size,
    storage_path: path, status: 'uploading',
  });
  if (insErr) return { id, error: "We couldn't start that upload. Try again." };

  const fail = async (detail) => {
    await supabase.from('cc_attachments').update({ status: 'failed', meta: { error: String(detail).slice(0, 300) } }).eq('id', id);
    return { id, error: `"${file.name}" didn't finish uploading.` };
  };

  try {
    if (file.size <= RESUMABLE_ABOVE) {
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
      if (error) return fail(error.message);
      onProgress?.(1);
    } else {
      const tus = await import('tus-js-client');
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      await new Promise((resolve, reject) => {
        const up = new tus.Upload(file, {
          endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
          retryDelays: [0, 2000, 5000, 10000, 20000], // dropped connections resume where they stopped
          headers: { authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'x-upsert': 'false' },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          chunkSize: 6 * 1024 * 1024,
          metadata: { bucketName: BUCKET, objectName: path, contentType, cacheControl: '3600' },
          onError: reject,
          onProgress: (sent, total) => onProgress?.(sent / total),
          onSuccess: resolve,
        });
        up.start();
      });
    }
  } catch (e) {
    return fail(e?.message || e);
  }

  // Read what we can from the file itself (3D models) while it is still in memory.
  let meta = {};
  let status = 'uploaded';
  if (kindOf(file.name) === 'model') {
    onStatus?.('processing');
    await supabase.from('cc_attachments').update({ status: 'processing' }).eq('id', id);
    try {
      const { readModelStats } = await import('./modelStats.js');
      meta = { model: await readModelStats(await file.arrayBuffer(), file.name) };
      status = 'ready';
    } catch (e) {
      meta = { processing_error: 'Details could not be read from this model. The file is saved.' };
    }
  }
  const { error: upErr } = await supabase.from('cc_attachments').update({ status, meta }).eq('id', id);
  if (upErr) return { id, error: `"${file.name}" was saved but we couldn't update its record.` };
  return { id, error: null };
}

export async function signedUrl(path, seconds = 3600, download = false) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds, download ? { download: true } : undefined);
  return error ? null : data.signedUrl;
}
