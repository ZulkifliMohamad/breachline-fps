// Shared physics for anything that walks: a standing box resolved against the
// world's colliders one axis at a time, so a wall never swallows a fighter and
// sliding along a wall feels right. Player and bots both move through this.
import * as THREE from 'three';

export const STAND_HEIGHT = 1.72;
export const CROUCH_HEIGHT = 1.12;
export const STAND_EYE = 1.6;
export const CROUCH_EYE = 1.02;
const RADIUS = 0.34;
const GRAVITY = 20;

export function createMover(colliders, startX, startZ) {
  const body = {
    position: new THREE.Vector3(startX, 0, startZ),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    height: STAND_HEIGHT,
    onGround: true,
    crouching: false,
  };
  const probe = new THREE.Box3();

  // lift keeps the feet and the crown out of the horizontal tests, so standing
  // on the floor is never read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }

  function setCrouch(want) {
    if (want && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!want && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, STAND_HEIGHT, 0.02)) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * 0.12;
  }

  // wish is a normalised horizontal direction in world space; speed is m/s.
  // accel blends velocity toward wish * speed, friction damps to a stop.
  function step(dt, wishX, wishZ, speed, accel, friction, jump) {
    const blend = Math.min(1, (accel * dt) / Math.max(speed, 0.01));
    body.velocity.x += (wishX * speed - body.velocity.x) * blend;
    body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
    if (body.onGround && wishX === 0 && wishZ === 0) {
      const damp = Math.max(0, 1 - friction * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    if (jump && body.onGround) {
      body.velocity.y = 6.2;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  return {
    body,
    setCrouch,
    step,
    overlaps,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    // World-space wish direction for a yaw and a forward/strafe pair.
    wishFor(yaw, forward, strafe, out) {
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      out.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe);
      if (out.lengthSq() > 0) out.normalize();
      return out;
    },
  };
}
