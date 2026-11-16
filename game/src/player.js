// The player as a fighter: a mover, health, a weapon set and the bomb. Bots
// shoot at the player's hit meshes (invisible boxes that the raycaster still
// sees); the player's own shots never include them in the target list.
import * as THREE from 'three';
import { createMover } from './mover.js';
import { createWeaponSet } from './weapons.js';

const WALK_SPEED = 5.2;
const SPRINT_SPEED = 6.4;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;

export function createPlayer(scene, camera, colliders, spawn) {
  const mover = createMover(colliders, spawn[0], spawn[1]);
  const weapons = createWeaponSet(camera);
  const body = mover.body;
  body.yaw = Math.PI; // face north, down the yard toward the defenders

  // Invisible hit boxes: torso and head. The raycaster intersects them even
  // though they are never rendered.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.38), new THREE.MeshBasicMaterial({ visible: false }));
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  head.position.y = 1.68;
  const hitGroup = new THREE.Group();
  hitGroup.add(torso, head);
  scene.add(hitGroup);

  const fighter = {
    kind: 'player',
    name: 'YOU',
    team: 'atk',
    health: 100,
    alive: true,
    money: 800,
    grenades: 0,
    kills: 0,
    deaths: 0,
    hitMeshes: [torso, head],
    get position() {
      return body.position;
    },
    get eyePosition() {
      return new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z);
    },
  };
  torso.userData.fighter = fighter;
  torso.userData.part = 'torso';
  head.userData.fighter = fighter;
  head.userData.part = 'head';

  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys, frozen) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    mover.setCrouch(crouching);
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    mover.wishFor(body.yaw, forward, strafe, wish);
    const sprinting = keys.has('ShiftLeft') && forward > 0 && !crouching;
    const speed = crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;
    if (frozen) {
      mover.step(dt, 0, 0, speed, GROUND_ACCEL, FRICTION, false);
    } else {
      mover.step(dt, wish.x, wish.z, speed, GROUND_ACCEL, FRICTION, keys.has('Space'));
    }
    hitGroup.position.copy(body.position);
    // Crouch lowers the hit boxes with the eye.
    const drop = body.crouching ? -0.5 : 0;
    torso.position.y = 1.15 + drop;
    head.position.y = 1.68 + drop;
  }

  function damage(amount) {
    if (!fighter.alive) return false;
    fighter.health -= amount;
    if (fighter.health <= 0) {
      fighter.health = 0;
      fighter.alive = false;
      fighter.deaths += 1;
      return true;
    }
    return false;
  }

  function respawn(spawnPoint) {
    body.position.set(spawnPoint[0], 0, spawnPoint[1]);
    body.velocity.set(0, 0, 0);
    body.yaw = Math.PI;
    body.pitch = 0;
    body.eye = 1.6;
    fighter.health = 100;
    fighter.alive = true;
    weapons.refill();
    hitGroup.position.copy(body.position);
  }

  return {
    fighter,
    body,
    weapons,
    look,
    recoil,
    step,
    damage,
    respawn,
    groundSpeed: () => mover.groundSpeed(),
  };
}
