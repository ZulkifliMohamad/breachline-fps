// Combat resolution: one hitscan ray per shot, tracers, and grenades.
// A shot is checked against the world's surfaces first and the fighters'
// hit meshes second; the first intersection wins, so cover really protects.
// Grenades are simulated bodies with a fuse, a bounce and an area blast.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const tracers = [];
const TRACER_LIFE = 0.09;

export function createCombat(scene) {
  const raycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3();

  function spawnTracer(from, to, color = PALETTE.accent) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const material = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: TRACER_LIFE });
  }

  function stepTracers(dt) {
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const tracer = tracers[i];
      tracer.life -= dt;
      if (tracer.life <= 0) {
        scene.remove(tracer.line);
        tracer.line.geometry.dispose();
        tracer.line.material.dispose();
        tracers.splice(i, 1);
      } else {
        tracer.line.material.opacity = (tracer.life / TRACER_LIFE) * 0.85;
      }
    }
  }

  // Fires one hitscan shot. shootables are the world's meshes, fighters carry
  // hitMeshes whose userData is { fighter, part }. Returns what the bullet hit.
  function fireHitscan(origin, dir, spread, random, range, shootables, fighters) {
    direction.copy(dir);
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
    direction.normalize();
    raycaster.set(origin, direction);
    raycaster.far = range;
    const meshes = [];
    for (const fighter of fighters) {
      if (fighter.alive) meshes.push(...fighter.hitMeshes);
    }
    const hits = raycaster.intersectObjects(shootables.concat(meshes), false);
    const hit = hits[0];
    if (!hit) {
      const end = origin.clone().addScaledVector(direction, range);
      return { hit: false, point: end, fighter: null, part: null, blocked: false };
    }
    if (hit.object.userData.fighter) {
      return { hit: true, point: hit.point, fighter: hit.object.userData.fighter, part: hit.object.userData.part, blocked: false };
    }
    return { hit: true, point: hit.point, fighter: null, part: null, blocked: true };
  }

  // Line of sight between two eye positions: true when nothing solid is in the way.
  function hasLineOfSight(from, to, shootables) {
    direction.copy(to).sub(from);
    const distance = direction.length();
    if (distance < 0.01) return true;
    direction.normalize();
    raycaster.set(from, direction);
    raycaster.far = distance;
    return raycaster.intersectObjects(shootables, false).length === 0;
  }

  return { spawnTracer, stepTracers, fireHitscan, hasLineOfSight };
}

// Grenades: thrown bodies with gravity, a bounce off the world's colliders and
// a fuse. On detonation every fighter inside the blast radius takes falloff
// damage and the world shakes. One manager owns all live grenades.
export function createGrenades(scene, colliders) {
  const live = [];
  const probe = new THREE.Box3();
  const blastMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, depthWrite: false });
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 22, 1.6);
  scene.add(flashLight);

  function throwGrenade(position, velocity, owner) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), roughness: 0.5, metalness: 0.4 }),
    );
    mesh.position.copy(position);
    scene.add(mesh);
    live.push({ mesh, velocity: velocity.clone(), fuse: 1.7, owner, blast: 0 });
    return live[live.length - 1];
  }

  function overlaps(x, y, z) {
    probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }

  // Returns blast events { position, owner } for the caller to damage and shake.
  function step(dt, fighters) {
    const events = [];
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const grenade = live[i];
      if (grenade.blast > 0) {
        grenade.blast -= dt;
        const scale = 1 + (0.35 - grenade.blast) * 22;
        grenade.mesh.scale.setScalar(Math.max(0.01, scale));
        grenade.mesh.material.opacity = Math.max(0, grenade.blast / 0.35);
        if (grenade.blast <= 0) {
          scene.remove(grenade.mesh);
          live.splice(i, 1);
        }
        continue;
      }
      grenade.fuse -= dt;
      grenade.velocity.y -= 18 * dt;
      const next = grenade.mesh.position.clone().addScaledVector(grenade.velocity, dt);
      const hit = overlaps(next.x, next.y, next.z);
      if (hit) {
        // Bounce: kill the velocity component that ran into the box, dampened.
        if (overlaps(next.x, grenade.mesh.position.y, grenade.mesh.position.z)) grenade.velocity.x *= -0.45;
        if (overlaps(grenade.mesh.position.x, next.y, grenade.mesh.position.z)) grenade.velocity.y *= -0.45;
        if (overlaps(grenade.mesh.position.x, grenade.mesh.position.y, next.z)) grenade.velocity.z *= -0.45;
        grenade.velocity.multiplyScalar(0.7);
      } else {
        grenade.mesh.position.copy(next);
      }
      if (grenade.mesh.position.y < 0.09) {
        grenade.mesh.position.y = 0.09;
        grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.45;
        grenade.velocity.x *= 0.7;
        grenade.velocity.z *= 0.7;
      }
      if (grenade.fuse <= 0) {
        grenade.blast = 0.35;
        grenade.mesh.material = blastMaterial.clone();
        grenade.mesh.scale.setScalar(1);
        flashLight.position.copy(grenade.mesh.position);
        flashLight.intensity = 60;
        setTimeout(() => { flashLight.intensity = 0; }, 120);
        events.push({ position: grenade.mesh.position.clone(), owner: grenade.owner });
      }
    }
    return events;
  }

  return { throwGrenade, step, count: () => live.length };
}
