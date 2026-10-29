import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Box, Copy, Crosshair, Maximize, MapPin, MousePointer2, Move3d, Plus, Rotate3d, Scale3d, Trash2 } from 'lucide-react';
import { useProject } from '../lib/project.jsx';
import { useTable } from '../lib/useTable.js';
import { useDraft } from '../lib/useDraft.js';
import { supabase } from '../lib/supabase.js';
import { signedUrl } from '../lib/files.js';
import SceneViewport from '../components/SceneViewport.jsx';

const SHAPES = { box: 'Box', cylinder: 'Cylinder', sphere: 'Sphere', capsule: 'Capsule (character)', cone: 'Cone', plane: 'Flat ground' };
const MODES = [
  ['select', 'Select', MousePointer2], ['translate', 'Move', Move3d], ['rotate', 'Rotate', Rotate3d], ['scale', 'Resize', Scale3d], ['pin', 'Add a note', MapPin],
];

function Save({ state }) {
  return <span className={`save ${state}`} aria-live="polite">{state === 'saving' ? 'Saving…' : state === 'error' ? "Couldn't save" : 'Saved'}</span>;
}

// A row of three numbers that saves when you leave the field or press Enter.
function Vec3({ label, value, onCommit, step = 0.1 }) {
  const [text, setText] = useState(value.map((n) => String(n)));
  useEffect(() => setText(value.map((n) => String(n))), [value.join(',')]);
  const commit = () => {
    const next = text.map((t, i) => { const n = parseFloat(t); return Number.isFinite(n) ? n : value[i]; });
    if (next.some((n, i) => n !== value[i])) onCommit(next); else setText(value.map(String));
  };
  return (
    <div className="vec">
      <span>{label}</span>
      {['X', 'Y', 'Z'].map((ax, i) => (
        <input key={ax} type="number" step={step} aria-label={`${label} ${ax}`} value={text[i]}
          onChange={(e) => setText((t) => t.map((v, j) => (j === i ? e.target.value : v)))}
          onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      ))}
    </div>
  );
}

function ObjectInspector({ obj, assets, files, onPatch, onDuplicate, onDelete }) {
  const [name, setName, s1] = useDraft(obj.name, (v) => onPatch({ name: v.trim() || obj.name }));
  const [notes, setNotes, s2] = useDraft(obj.notes, (v) => onPatch({ notes: v }));
  const [confirm, setConfirm] = useState(false);
  const usable = assets.filter((a) => {
    const f = files.find((x) => x.id === a.current_attachment_id);
    return f && f.name.toLowerCase().endsWith('.glb');
  });
  const asset = assets.find((a) => a.id === obj.asset_id);
  const assetHasModel = asset && usable.some((a) => a.id === asset.id);
  return (
    <div className="insp">
      <div className="insp-head">
        <input className="bsec-title" value={name} onChange={(e) => setName(e.target.value)} aria-label="Object name" />
        <Save state={s1 === 'error' || s2 === 'error' ? 'error' : s1 === 'saving' || s2 === 'saving' ? 'saving' : 'saved'} />
      </div>

      <h3>Real model</h3>
      <select value={obj.asset_id ?? ''} onChange={(e) => onPatch({ asset_id: e.target.value || null })} aria-label="Real model for this object">
        <option value="">Stand-in shape (no model yet)</option>
        {assets.map((a) => <option key={a.id} value={a.id} disabled={!usable.some((u) => u.id === a.id) && a.id !== obj.asset_id}>
          {a.name}{usable.some((u) => u.id === a.id) ? ` (v${a.current_version})` : ' (no .glb yet)'}
        </option>)}
      </select>
      {obj.asset_id && !assetHasModel && <p className="muted small">That asset has no .glb file yet, so the stand-in is shown. Add a model on the asset's page and it appears here automatically.</p>}
      <p className="muted small">Swapping keeps this object's position, size and notes.</p>

      {!obj.asset_id && (
        <>
          <h3>Stand-in</h3>
          <div className="row2">
            <select value={obj.shape} onChange={(e) => onPatch({ shape: e.target.value })} aria-label="Shape">
              {Object.entries(SHAPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="color" value={obj.color} onChange={(e) => onPatch({ color: e.target.value })} aria-label="Colour" />
          </div>
        </>
      )}

      <h3>Placement</h3>
      <Vec3 label="Position" value={obj.position} onCommit={(v) => onPatch({ position: v })} />
      <Vec3 label="Rotation °" value={obj.rotation} step={5} onCommit={(v) => onPatch({ rotation: v })} />
      <Vec3 label="Size" value={obj.scale} onCommit={(v) => onPatch({ scale: v.map((n) => (n === 0 ? 0.01 : n)) })} />

      <h3>Notes</h3>
      <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember about this object." />

      <div className="insp-actions">
        <button className="btn sm" onClick={onDuplicate}><Copy size={14} /> Duplicate</button>
        {confirm
          ? <button className="btn danger sm" onClick={onDelete} onBlur={() => setConfirm(false)} autoFocus>Delete from this scene</button>
          : <button className="btn sm" onClick={() => setConfirm(true)}><Trash2 size={14} /> Delete</button>}
      </div>
      <p className="muted small">Deleting removes only this object from the scene. The asset and its files are never touched.</p>
    </div>
  );
}

function PinEditor({ a, objectName, onPatch, onDelete, onFocus }) {
  const [title, setTitle, s1] = useDraft(a.title, (v) => onPatch({ title: v }));
  const [body, setBody, s2] = useDraft(a.body, (v) => onPatch({ body: v }));
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="pin">
      <div className="insp-head">
        <input className="bsec-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" aria-label="Note title" />
        <Save state={s1 === 'error' || s2 === 'error' ? 'error' : s1 === 'saving' || s2 === 'saving' ? 'saving' : 'saved'} />
      </div>
      {objectName && <p className="muted small">On: {objectName}</p>}
      <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What should someone know or do here?" />
      <div className="insp-actions">
        <button className="btn sm" onClick={onFocus}><Crosshair size={14} /> Look here</button>
        <button className="btn sm" onClick={() => onPatch({ status: a.status === 'open' ? 'resolved' : 'open' })}>{a.status === 'open' ? 'Mark done' : 'Reopen'}</button>
        {confirm
          ? <button className="btn danger sm" onClick={onDelete} onBlur={() => setConfirm(false)} autoFocus>Delete note</button>
          : <button className="btn sm" onClick={() => setConfirm(true)}><Trash2 size={14} /></button>}
      </div>
    </div>
  );
}

export default function SceneEditor() {
  const { sceneId } = useParams();
  const { projectId } = useProject();
  const scenes = useTable('cc_scenes', projectId);
  const scoped = { extra: (q) => q.eq('scene_id', sceneId), match: (r) => r.scene_id === sceneId, extraKey: sceneId };
  const objs = useTable('cc_scene_objects', projectId, { order: 'created_at', ascending: true, limit: 1000, ...scoped });
  const notes = useTable('cc_annotations', projectId, { order: 'created_at', ascending: true, limit: 1000, ...scoped });
  const assets = useTable('cc_assets', projectId);
  const files = useTable('cc_attachments', projectId, { order: 'created_at', limit: 500 });
  const scene = scenes.rows.find((s) => s.id === sceneId);

  const [mode, setMode] = useState('select');
  const [snap, setSnap] = useState(true);
  const [selected, setSelected] = useState(null);
  const [selectedNote, setSelectedNote] = useState(null);
  const [error, setError] = useState('');
  const [models, setModels] = useState({});
  const view = useRef(null);

  // find the real model file for every object that has one, and get a temporary link to read it
  const wanted = useMemo(() => {
    const m = {};
    for (const o of objs.rows) {
      const a = assets.rows.find((x) => x.id === o.asset_id);
      const f = a && files.rows.find((x) => x.id === a.current_attachment_id);
      if (f && f.name.toLowerCase().endsWith('.glb') && f.status !== 'failed') m[f.id] = f.storage_path;
    }
    return m;
  }, [objs.rows, assets.rows, files.rows]);
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const [id, path] of Object.entries(wanted)) {
        if (models[id]) continue;
        const url = await signedUrl(path, 3600);
        if (alive && url) setModels((cur) => ({ ...cur, [id]: url }));
      }
    })();
    return () => { alive = false; };
  }, [wanted]);

  const viewObjects = useMemo(() => objs.rows.map((o) => {
    const a = assets.rows.find((x) => x.id === o.asset_id);
    return { id: o.id, shape: o.shape, color: o.color, position: o.position, rotation: o.rotation, scale: o.scale, modelKey: a?.current_attachment_id && wanted[a.current_attachment_id] ? a.current_attachment_id : null };
  }), [objs.rows, assets.rows, wanted]);

  const sel = objs.rows.find((o) => o.id === selected) ?? null;
  const selNote = notes.rows.find((n) => n.id === selectedNote) ?? null;

  const patchObj = async (id, fields) => {
    objs.setRows((cur) => cur.map((o) => (o.id === id ? { ...o, ...fields } : o)));
    const { error: err } = await supabase.from('cc_scene_objects').update(fields).eq('id', id);
    if (err) setError("We couldn't save that change. Try again.");
    return err;
  };
  const patchNote = async (id, fields) => {
    notes.setRows((cur) => cur.map((n) => (n.id === id ? { ...n, ...fields } : n)));
    const { error: err } = await supabase.from('cc_annotations').update(fields).eq('id', id);
    if (err) setError("We couldn't save that note. Try again.");
    return err;
  };

  const addObject = async (shape) => {
    const n = objs.rows.length;
    const { data, error: err } = await supabase.from('cc_scene_objects').insert({
      project_id: projectId, scene_id: sceneId, shape, name: `${SHAPES[shape].split(' ')[0]} ${n + 1}`,
      position: [(n % 5) * 2 - 4, 0, Math.floor(n / 5) * 2], scale: shape === 'plane' ? [4, 1, 4] : [1, 1, 1],
    }).select().single();
    if (err) { setError("We couldn't add that object. Try again."); return; }
    objs.setRows((cur) => (cur.some((o) => o.id === data.id) ? cur : [...cur, data]));
    setSelected(data.id); setSelectedNote(null); setMode('translate');
  };
  const duplicate = async (o) => {
    const { id, created_at, updated_at, ...rest } = o;
    const { data, error: err } = await supabase.from('cc_scene_objects').insert({ ...rest, name: `${o.name} copy`, position: [o.position[0] + 1, o.position[1], o.position[2] + 1] }).select().single();
    if (err) { setError("We couldn't duplicate that object. Try again."); return; }
    objs.setRows((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, data]));
    setSelected(data.id);
  };
  const removeObj = async (o) => {
    const { error: err } = await supabase.from('cc_scene_objects').delete().eq('id', o.id);
    if (err) { setError("We couldn't delete that object. Try again."); return; }
    objs.setRows((cur) => cur.filter((x) => x.id !== o.id));
    setSelected(null);
  };
  const placePin = async (position, objectId) => {
    const { data, error: err } = await supabase.from('cc_annotations').insert({ project_id: projectId, scene_id: sceneId, object_id: objectId, position, title: 'New note' }).select().single();
    if (err) { setError("We couldn't add that note. Try again."); return; }
    notes.setRows((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, data]));
    setSelectedNote(data.id); setSelected(null); setMode('select');
  };
  const removeNote = async (n) => {
    const { error: err } = await supabase.from('cc_annotations').delete().eq('id', n.id);
    if (err) { setError("We couldn't delete that note. Try again."); return; }
    notes.setRows((cur) => cur.filter((x) => x.id !== n.id));
    setSelectedNote(null);
  };

  const [sceneName, setSceneName, sn] = useDraft(scene?.name ?? '', async (v) => (await supabase.from('cc_scenes').update({ name: v.trim() || 'Untitled scene' }).eq('id', sceneId)).error);

  if (!scene) {
    return <div className="page">{scenes.state === 'ready' ? <div className="empty"><p>That scene doesn't exist or was removed.</p><Link className="btn" to="/scenes">Back to scenes</Link></div> : <p className="muted">Loading…</p>}</div>;
  }
  const objName = (id) => objs.rows.find((o) => o.id === id)?.name;

  return (
    <div className="stage">
      <div className="stage-top">
        <Link className="icon-btn" to="/scenes" aria-label="Back to all scenes"><ArrowLeft size={16} /></Link>
        <input className="title-input" value={sceneName} onChange={(e) => setSceneName(e.target.value)} aria-label="Scene name" />
        <Save state={sn} />
        <div className="toolbar" role="toolbar" aria-label="Tools">
          {MODES.map(([k, label, Icon]) => (
            <button key={k} className={'tool' + (mode === k ? ' on' : '')} onClick={() => setMode(k)} title={label}><Icon size={15} /><span>{label}</span></button>
          ))}
          <label className="snap"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap</label>
          <button className="tool" onClick={() => view.current?.frameAll()} title="Fit everything in view"><Maximize size={15} /><span>Fit view</span></button>
        </div>
      </div>
      {error && <p className="error stage-err" role="alert">{error}</p>}
      <div className="stage-body">
        <aside className="stage-left">
          <h3>Add a stand-in</h3>
          <div className="addgrid">
            {Object.entries(SHAPES).map(([k, v]) => <button key={k} className="btn sm" onClick={() => addObject(k)}><Plus size={13} /> {v}</button>)}
          </div>
          <h3>In this scene ({objs.rows.length})</h3>
          {objs.state === 'ready' && objs.rows.length === 0 && <p className="muted small">Empty. Add a shape above, then drag it where it belongs.</p>}
          <ul className="objlist">
            {objs.rows.map((o) => (
              <li key={o.id}>
                <button className={o.id === selected ? 'on' : ''} onClick={() => { setSelected(o.id); setSelectedNote(null); if (mode === 'pin') setMode('select'); }}>
                  <Box size={14} /><span className="grow">{o.name}</span>{o.asset_id && <span className="chip s-available">model</span>}
                </button>
              </li>
            ))}
          </ul>
          <h3>Notes ({notes.rows.length})</h3>
          {notes.rows.length === 0 && <p className="muted small">Choose "Add a note", then click on the scene where the note belongs.</p>}
          <ul className="objlist">
            {notes.rows.map((n) => (
              <li key={n.id}>
                <button className={n.id === selectedNote ? 'on' : ''} onClick={() => { setSelectedNote(n.id); setSelected(null); view.current?.focusPoint(n.position); }}>
                  <MapPin size={14} /><span className="grow">{n.title || 'Untitled note'}</span>{n.status === 'resolved' && <span className="chip s-done">done</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="stage-center">
          <SceneViewport
            ref={view}
            objects={viewObjects}
            annotations={notes.rows}
            models={models}
            selectedId={selected}
            selectedAnnotationId={selectedNote}
            mode={mode}
            snap={snap}
            onSelect={(id) => { setSelected(id); setSelectedNote(null); }}
            onSelectAnnotation={(id) => { setSelectedNote(id); setSelected(null); }}
            onTransform={(id, t) => patchObj(id, t)}
            onPlacePin={placePin}
          />
          {mode === 'pin' && <p className="hint">Click where the note belongs.</p>}
        </div>

        <aside className="stage-right">
          {sel && <ObjectInspector key={sel.id} obj={sel} assets={assets.rows} files={files.rows} onPatch={(f) => patchObj(sel.id, f)} onDuplicate={() => duplicate(sel)} onDelete={() => removeObj(sel)} />}
          {selNote && <PinEditor key={selNote.id} a={selNote} objectName={selNote.object_id ? objName(selNote.object_id) : null} onPatch={(f) => patchNote(selNote.id, f)} onDelete={() => removeNote(selNote)} onFocus={() => view.current?.focusPoint(selNote.position)} />}
          {!sel && !selNote && (
            <div className="muted small">
              <p><strong>How to use this</strong></p>
              <p>Drag to look around. Scroll to zoom. Right-drag to pan.</p>
              <p>Click a shape to select it, then use Move, Rotate or Resize.</p>
              <p>Pick "Add a note" and click anywhere to leave a note for yourself or Claude.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
