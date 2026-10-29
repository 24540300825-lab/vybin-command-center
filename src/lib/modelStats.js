// Reads a .glb/.gltf from memory and reports what a producer wants to know. Loaded on demand (three.js is large).
export async function loadGltf(buffer) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject));
}

export async function statsFromScene(gltf) {
  const THREE = await import('three');
  const meshes = new Set(), materials = new Set(), textures = new Set();
  let triangles = 0;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes.add(o.uuid);
    const index = o.geometry.index;
    triangles += index ? index.count / 3 : (o.geometry.attributes.position?.count ?? 0) / 3;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      materials.add(m.uuid);
      for (const v of Object.values(m)) if (v && v.isTexture) textures.add(v.uuid);
    });
  });
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  return {
    triangles: Math.round(triangles),
    meshes: meshes.size,
    materials: materials.size,
    textures: textures.size,
    animations: gltf.animations?.length ?? 0,
    size: [size.x, size.y, size.z].map((n) => Math.round(n * 1000) / 1000), // scene units, normally metres
  };
}

export async function readModelStats(buffer) {
  const gltf = await loadGltf(buffer);
  const stats = await statsFromScene(gltf);
  disposeScene(gltf.scene);
  return stats;
}

export function disposeScene(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose();
    });
  });
}
