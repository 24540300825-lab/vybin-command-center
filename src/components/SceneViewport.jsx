import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGltf } from '../lib/modelStats.js';

const D2R = Math.PI / 180;
const round = (n) => Math.round(n * 10000) / 10000;

function placeholderGeometry(shape) {
  switch (shape) {
    case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 24).translate(0, 0.5, 0);
    case 'sphere': return new THREE.SphereGeometry(0.5, 24, 16).translate(0, 0.5, 0);
    case 'capsule': return new THREE.CapsuleGeometry(0.25, 0.5, 6, 16).translate(0, 0.5, 0);
    case 'cone': return new THREE.ConeGeometry(0.5, 1, 24).translate(0, 0.5, 0);
    case 'plane': return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    default: return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  }
}
function makePlaceholder(shape, color) {
  const geo = placeholderGeometry(shape);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, side: shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide, transparent: true, opacity: 0.88 });
  const mesh = new THREE.Mesh(geo, mat);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x1a1d29, transparent: true, opacity: 0.5 }));
  mesh.add(edges);
  mesh.userData.disposable = true;
  return mesh;
}
function disposePlaceholder(o) {
  o.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
}

// The 3D view of one scene. It draws what the database says and reports edits back; it owns no data itself.
// objects: [{id, shape, color, position, rotation(deg), scale, modelKey}], models: {modelKey: signedUrl}
const SceneViewport = forwardRef(function SceneViewport(props, ref) {
  const host = useRef(null);
  const latest = useRef(props);
  latest.current = props;
  const api = useRef({});

  useImperativeHandle(ref, () => ({
    frameAll: () => api.current.frameAll?.(),
    focusPoint: (p) => api.current.focusPoint?.(p),
  }));

  useEffect(() => {
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const dom = renderer.domElement;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8294, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(8, 14, 6);
    scene.add(sun);
    const grid = new THREE.GridHelper(60, 60, 0x7d8697, 0xa9b1c0);
    grid.material.transparent = true; grid.material.opacity = 0.35;
    scene.add(grid);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
    camera.position.set(9, 8, 11);
    const orbit = new OrbitControls(camera, dom);
    orbit.enableDamping = true;
    orbit.maxPolarAngle = Math.PI * 0.499;
    const transform = new TransformControls(camera, dom);
    scene.add(transform.getHelper());
    const selBox = new THREE.BoxHelper(new THREE.Object3D(), 0xf4d03f);
    selBox.visible = false;
    scene.add(selBox);

    const entries = new Map();      // object id → {group, contentKey, content, modelKey}
    const pins = new Map();         // annotation id → mesh
    const modelCache = new Map();   // modelKey → {state:'loading'|'ready'|'failed', scene}
    const pinGeo = new THREE.SphereGeometry(0.18, 16, 12);
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let dragging = false;
    let raf = 0;
    let disposed = false;

    const setContent = (e, key, build) => {
      if (e.content) {
        e.group.remove(e.content);
        if (e.content.userData.disposable) disposePlaceholder(e.content);
      }
      e.content = build();
      e.contentKey = key;
      e.group.add(e.content);
    };

    const startLoad = (key) => {
      const url = latest.current.models?.[key];
      if (!url || modelCache.has(key)) return;
      modelCache.set(key, { state: 'loading' });
      (async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          const gltf = await loadGltf(await res.arrayBuffer());
          if (disposed) return;
          modelCache.set(key, { state: 'ready', scene: gltf.scene });
        } catch {
          modelCache.set(key, { state: 'failed' });
          latest.current.onModelFailed?.(key);
        }
        if (!disposed) sync();
      })();
    };

    const updateSel = () => {
      const { selectedId, mode } = latest.current;
      const e = selectedId ? entries.get(selectedId) : null;
      if (e) { selBox.setFromObject(e.group); selBox.visible = true; } else selBox.visible = false;
      const tool = mode === 'translate' || mode === 'rotate' || mode === 'scale';
      if (e && tool) { transform.setMode(mode); if (transform.object !== e.group) transform.attach(e.group); }
      else if (transform.object) transform.detach();
      transform.setTranslationSnap(latest.current.snap ? 0.25 : null);
      transform.setRotationSnap(latest.current.snap ? 15 * D2R : null);
      transform.setScaleSnap(latest.current.snap ? 0.1 : null);
    };

    function sync() {
      if (disposed) return;
      const { objects = [], annotations = [], selectedAnnotationId } = latest.current;
      const seen = new Set();
      for (const o of objects) {
        seen.add(o.id);
        let e = entries.get(o.id);
        if (!e) {
          const group = new THREE.Group();
          group.userData.objectId = o.id;
          scene.add(group);
          e = { group, contentKey: null, content: null };
          entries.set(o.id, e);
        }
        if (!(dragging && transform.object === e.group)) {
          e.group.position.fromArray(o.position);
          e.group.rotation.set(o.rotation[0] * D2R, o.rotation[1] * D2R, o.rotation[2] * D2R);
          e.group.scale.fromArray(o.scale);
        }
        let want = `ph:${o.shape}:${o.color}`;
        if (o.modelKey) {
          startLoad(o.modelKey);
          if (modelCache.get(o.modelKey)?.state === 'ready') want = `model:${o.modelKey}`;
        }
        if (want !== e.contentKey) {
          if (want.startsWith('model:')) setContent(e, want, () => cloneSkinned(modelCache.get(o.modelKey).scene));
          else setContent(e, want, () => makePlaceholder(o.shape, o.color));
        }
      }
      for (const [id, e] of entries) {
        if (seen.has(id)) continue;
        if (transform.object === e.group) transform.detach();
        scene.remove(e.group);
        if (e.content?.userData.disposable) disposePlaceholder(e.content);
        entries.delete(id);
      }
      const pseen = new Set();
      for (const a of annotations) {
        pseen.add(a.id);
        let m = pins.get(a.id);
        if (!m) {
          m = new THREE.Mesh(pinGeo, new THREE.MeshBasicMaterial({ color: 0xf4d03f, depthTest: false, transparent: true }));
          m.renderOrder = 10;
          m.userData.annotationId = a.id;
          scene.add(m);
          pins.set(a.id, m);
        }
        m.position.fromArray(a.position);
        m.material.color.set(a.status === 'resolved' ? 0x4cc38a : 0xf4d03f);
        m.scale.setScalar(a.id === selectedAnnotationId ? 1.5 : 1);
      }
      for (const [id, m] of pins) if (!pseen.has(id)) { scene.remove(m); m.material.dispose(); pins.delete(id); }
      updateSel();
    }
    api.current.sync = sync;

    const frameBox = (box) => {
      if (box.isEmpty()) { camera.position.set(9, 8, 11); orbit.target.set(0, 0, 0); orbit.update(); return; }
      const c = box.getCenter(new THREE.Vector3());
      const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
      camera.position.copy(c).add(new THREE.Vector3(1, 0.8, 1.1).normalize().multiplyScalar(r * 2.4));
      orbit.target.copy(c); orbit.update();
    };
    api.current.frameAll = () => {
      const box = new THREE.Box3();
      entries.forEach((e) => box.expandByObject(e.group));
      frameBox(box);
    };
    api.current.focusPoint = (p) => {
      const t = new THREE.Vector3().fromArray(p);
      const off = camera.position.clone().sub(orbit.target);
      orbit.target.copy(t); camera.position.copy(t).add(off); orbit.update();
    };

    transform.addEventListener('dragging-changed', (ev) => {
      dragging = ev.value;
      orbit.enabled = !ev.value;
      if (!ev.value && transform.object) {
        const g = transform.object;
        latest.current.onTransform?.(g.userData.objectId, {
          position: g.position.toArray().map(round),
          rotation: [g.rotation.x / D2R, g.rotation.y / D2R, g.rotation.z / D2R].map(round),
          scale: g.scale.toArray().map(round),
        });
        selBox.setFromObject(g);
      }
    });
    transform.addEventListener('objectChange', () => { if (transform.object) selBox.setFromObject(transform.object); });

    // click vs drag: only a press-and-release without movement counts as a click
    const ray = new THREE.Raycaster();
    let down = null;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5 || e.button !== 0 || dragging || transform.axis) return;
      const rect = dom.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
      const pinHit = ray.intersectObjects([...pins.values()], false)[0];
      if (pinHit) { latest.current.onSelectAnnotation?.(pinHit.object.userData.annotationId); return; }
      const hit = ray.intersectObjects([...entries.values()].map((x) => x.group), true)[0];
      let objectId = null;
      if (hit) { let n = hit.object; while (n && !n.userData.objectId) n = n.parent; objectId = n?.userData.objectId ?? null; }
      if (latest.current.mode === 'pin') {
        let point = hit?.point;
        if (!point) { point = new THREE.Vector3(); if (!ray.ray.intersectPlane(ground, point)) return; }
        latest.current.onPlacePin?.(point.toArray().map(round), objectId);
      } else {
        latest.current.onSelect?.(objectId);
      }
    };
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);

    const resize = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);
    const loop = () => { raf = requestAnimationFrame(loop); orbit.update(); renderer.render(scene, camera); };
    loop();
    sync();
    if (latest.current.objects?.length) api.current.frameAll();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf); ro.disconnect();
      dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointerup', onUp);
      transform.detach(); transform.dispose(); orbit.dispose();
      entries.forEach((e) => { if (e.content?.userData.disposable) disposePlaceholder(e.content); });
      pins.forEach((m) => m.material.dispose()); pinGeo.dispose();
      grid.geometry.dispose(); grid.material.dispose(); selBox.geometry.dispose();
      renderer.dispose(); dom.remove();
    };
  }, []);

  // whenever the data or tool changes, bring the 3D view in line
  useEffect(() => { api.current.sync?.(); }, [props.objects, props.annotations, props.models, props.selectedId, props.selectedAnnotationId, props.mode, props.snap]);

  return <div ref={host} className="viewport" aria-label="3D scene. Drag to look around, scroll to zoom, click an object to select it." />;
});

export default SceneViewport;
