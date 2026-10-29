import { useEffect, useRef, useState } from 'react';

// Interactive 3D preview of a .glb/.gltf kept in storage. Drag to rotate, scroll to zoom. three.js loads only when this opens.
export default function ModelPreview({ url, onStats }) {
  const host = useRef(null);
  const [state, setState] = useState('loading'); // loading | ready | failed
  const [detail, setDetail] = useState('');

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const [THREE, { OrbitControls }, mod] = await Promise.all([
          import('three'),
          import('three/addons/controls/OrbitControls.js'),
          import('../lib/modelStats.js'),
        ]);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const gltf = await mod.loadGltf(await res.arrayBuffer());
        if (disposed || !host.current) return;
        onStats?.(await mod.statsFromScene(gltf));

        const el = host.current;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.4));
        const sun = new THREE.DirectionalLight(0xffffff, 2.2);
        sun.position.set(3, 5, 4);
        scene.add(sun);
        scene.add(gltf.scene);

        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.001);
        const camera = new THREE.PerspectiveCamera(40, 1, radius / 100, radius * 100);
        camera.position.copy(center).add(new THREE.Vector3(1, 0.7, 1.2).normalize().multiplyScalar(radius * 2.6));
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(center);
        controls.enableDamping = true;
        controls.update();

        const grid = new THREE.GridHelper(radius * 4, 20, 0x888888, 0xbbbbbb);
        grid.position.y = box.min.y;
        grid.material.transparent = true; grid.material.opacity = 0.35;
        scene.add(grid);

        const resize = () => {
          const w = el.clientWidth || 300, h = el.clientHeight || 300;
          renderer.setSize(w, h, false);
          camera.aspect = w / h; camera.updateProjectionMatrix();
        };
        resize();
        const ro = new ResizeObserver(resize); ro.observe(el);
        let raf = 0;
        const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
        loop();
        setState('ready');
        cleanup = () => {
          cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
          mod.disposeScene(gltf.scene); grid.geometry.dispose(); grid.material.dispose();
          renderer.dispose(); renderer.domElement.remove();
        };
      } catch (e) {
        if (disposed) return;
        setDetail(String(e?.message || e));
        setState('failed');
      }
    })();
    return () => { disposed = true; cleanup(); };
  }, [url]);

  return (
    <div className="model-view">
      <div ref={host} className="model-canvas" aria-label="3D preview. Drag to rotate, scroll to zoom." />
      {state === 'loading' && <p className="muted model-note">Loading the model…</p>}
      {state === 'failed' && (
        <div className="model-note">
          <p>We couldn't draw a preview of this model, but the file is safely stored.</p>
          <details><summary>Technical details</summary><pre>{detail}</pre></details>
        </div>
      )}
    </div>
  );
}
