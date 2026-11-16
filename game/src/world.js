// Depot 9: an original freight yard at dusk. Two bomb sites, three lanes, one
// mid building. Attackers spawn south, defenders north. Every box is a collider
// for fighters and a surface a bullet stops on. Waypoints are the graph the bots
// navigate; sites are the rectangles the bomb can be planted in.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Map bounds: x in [-26, 26], z in [-18, 18]. Sites are axis-aligned rectangles.
export const SITES = {
  A: { name: 'A', minX: -25, maxX: -15, minZ: -17, maxZ: -9, label: 'SITE A' },
  B: { name: 'B', minX: 15, maxX: 25, minZ: -17, maxZ: -9, label: 'SITE B' },
};
export const SPAWNS = {
  attack: [[-4, 15], [0, 15.5], [4, 15]],
  defend: [[-20, -13], [-8, -14], [8, -14], [20, -13]],
};
// Waypoint graph: nodes the bots walk between. Edges are listed per node index.
export const WAYPOINTS = [
  [-4, 15], [0, 15.5], [4, 15], // 0-2 attacker spawn
  [-14, 8], [0, 8], [14, 8], // 3-5 south yard
  [-20, 0], [-8, 0], [0, 0], [8, 0], [20, 0], // 6-10 mid line
  [-22, -6], [-12, -6], [0, -6], [12, -6], [22, -6], // 11-15 north yard
  [-20, -13], [-8, -14], [8, -14], [20, -13], // 16-19 defender spawn
  [-20, -12], [20, -12], // 20-21 site fronts
  [-12, 12], [12, 12], // 22-23 flank lanes
  [-24, 4], [24, 4], // 24-25 far flanks
];
export const WAY_EDGES = [
  [3, 4, 22], [4, 5, 23], [5, 23],
  [6, 7, 22, 24], [7, 8, 4], [8, 9, 5], [9, 10, 23], [10, 25],
  [6, 24], [7, 11, 12], [8, 12, 13], [9, 13, 14], [10, 15, 25],
  [11, 16, 20], [12, 17], [13, 18], [14, 19], [15, 21],
  [16, 20], [17, 12], [18, 13], [19, 21],
  [20, 11, 16], [21, 15, 19],
  [22, 3, 6], [23, 5, 10],
  [24, 6, 11], [25, 10, 15],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  // Container paint: a few muted industrial colours, still inside the palette's
  // family so the yard reads as one place.
  const containerPaint = ['#5a3b2e', '#2e4a5a', '#4a5a2e', '#5a2e3b', '#3b4a5a'].map(
    (color) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0.15 }),
  );

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, paint = -1) {
    const mat = paint >= 0 ? containerPaint[paint % containerPaint.length] : materials[material];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter. The yard is open to the dusk sky.
  box(52.8, 0.4, 36.8, 0, -0.2, 0, 'ground');
  box(0.6, 5.0, 36.8, -26.3, 2.5, 0, 'surface');
  box(0.6, 5.0, 36.8, 26.3, 2.5, 0, 'surface');
  box(52.8, 5.0, 0.6, 0, 2.5, -18.3, 'surface');
  box(52.8, 5.0, 0.6, 0, 2.5, 18.3, 'surface');

  // Mid building: a warehouse shell with two door gaps, splitting the yard into
  // A-long (west), mid (centre doors) and B-long (east).
  box(10, 4.2, 0.8, -8, 2.1, -2, 'surface');
  box(10, 4.2, 0.8, 8, 2.1, -2, 'surface');
  box(6, 4.2, 0.8, 0, 2.1, -6, 'surface');
  box(26, 0.5, 8.4, 0, 4.45, -4, 'hairline'); // roof slab over the mid block
  box(0.8, 4.2, 8.4, -13, 2.1, -4, 'surface');
  box(0.8, 4.2, 8.4, 13, 2.1, -4, 'surface');

  // Site A: container stack and crates on the west pad.
  box(6, 2.6, 2.4, -22, 1.3, -13, 'surface', 1);
  box(6, 2.6, 2.4, -22, 3.9, -13, 'surface', 3);
  box(2.4, 2.6, 6, -16.5, 1.3, -14.5, 'surface', 0);
  box(1.4, 1.1, 1.4, -18, 0.55, -10.5, 'hairline');
  box(1.4, 1.1, 1.4, -20.5, 0.55, -10.5, 'hairline');
  // Site B: warehouse corner and crates on the east pad.
  box(6, 2.6, 2.4, 22, 1.3, -13, 'surface', 2);
  box(2.4, 2.6, 6, 16.5, 1.3, -14.5, 'surface', 4);
  box(1.4, 1.1, 1.4, 18, 0.55, -10.5, 'hairline');
  box(1.4, 1.1, 1.4, 20.5, 0.55, -10.5, 'hairline');
  box(3.2, 1.0, 1.2, 21, 0.5, -16.5, 'hairline');

  // South yard cover: crates and a low wall the attackers advance behind.
  box(3.6, 1.1, 1.2, -14, 0.55, 10, 'hairline');
  box(1.2, 1.1, 3.6, -6, 0.55, 11, 'hairline');
  box(3.6, 1.1, 1.2, 6, 0.55, 10, 'hairline');
  box(1.2, 1.1, 3.6, 14, 0.55, 11, 'hairline');
  box(2.2, 2.2, 2.2, 0, 1.1, 12, 'surface', 1);
  box(1.6, 0.8, 1.6, -19, 0.4, 12, 'hairline');
  box(1.6, 0.8, 1.6, 19, 0.4, 12, 'hairline');

  // Mid-lane pillars and flank containers.
  box(1.2, 3.4, 1.2, -4, 1.7, 3, 'hairline');
  box(1.2, 3.4, 1.2, 4, 1.7, 3, 'hairline');
  box(4.8, 2.4, 2.2, -23, 1.2, 4, 'surface', 0);
  box(4.8, 2.4, 2.2, 23, 1.2, 4, 'surface', 2);
  box(1.4, 1.1, 1.4, -10, 0.55, -10, 'hairline');
  box(1.4, 1.1, 1.4, 10, 0.55, -10, 'hairline');

  // Site markers: a hazard stripe frame on the ground at each site, plus a
  // floating letter so a site reads at a glance from anywhere in the yard.
  const siteMarkers = [];
  for (const site of Object.values(SITES)) {
    const cx = (site.minX + site.maxX) / 2;
    const cz = (site.minZ + site.maxZ) / 2;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(site.maxX - site.minX, 0.06, site.maxZ - site.minZ),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.16 }),
    );
    frame.position.set(cx, 0.03, cz);
    group.add(frame);
    siteMarkers.push(frame);
  }

  // Lighting: low amber sun from the west, cool sky fill, and a dusk gradient.
  // Bright enough that the yard reads at a glance even in the mid shadow.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8fa3bf'), new THREE.Color(PALETTE.ground), 1.5);
  scene.add(sky);
  const ambient = new THREE.AmbientLight(new THREE.Color('#5a6b80'), 0.5);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.6);
  sun.position.set(-18, 16, 10);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a7ea6'), 0.9);
  fill.position.set(14, 10, 14);
  scene.add(fill);

  // Bomb-site lamps: two warm point lights so the sites glow at dusk.
  for (const site of Object.values(SITES)) {
    const cx = (site.minX + site.maxX) / 2;
    const cz = (site.minZ + site.maxZ) / 2;
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 16, 1.8);
    lamp.position.set(cx, 4.4, cz);
    scene.add(lamp);
  }

  return {
    colliders,
    shootables,
    group,
    siteMarkers,
    // Flat list of wall rectangles for the 2D minimap: [x, z, w, d].
    minimapWalls: [
      [-26.3, 0, 0.6, 36.8], [26.3, 0, 0.6, 36.8], [0, -18.3, 52.8, 0.6], [0, 18.3, 52.8, 0.6],
      [-8, -2, 10, 0.8], [8, -2, 10, 0.8], [0, -6, 6, 0.8],
      [-13, -4, 0.8, 8.4], [13, -4, 0.8, 8.4],
      [-22, -13, 6, 2.4], [-16.5, -14.5, 2.4, 6], [22, -13, 6, 2.4], [16.5, -14.5, 2.4, 6],
      [-23, 4, 4.8, 2.2], [23, 4, 4.8, 2.2],
    ],
  };
}
