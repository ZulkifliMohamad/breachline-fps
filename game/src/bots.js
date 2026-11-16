// Bot fighters: one module for teammates and enemies. A bot navigates the
// waypoint graph with BFS, holds a site or pushes a lane, sees with line of
// sight and a reaction delay, hears nearby gunfire, shoots in bursts with
// skill-based error, and plants or defuses the bomb when the round asks it to.
// Bots never see through walls and never know where you are until they see or
// hear you: that is what makes the tactics honest.
import * as THREE from 'three';
import { createMover } from './mover.js';
import { WEAPONS } from './weapons.js';
import { WAYPOINTS, WAY_EDGES, SITES } from './world.js';
import { PALETTE } from './palette.js';

const BOT_WALK = 3.7;
const BOT_PUSH = 4.5;
const REACT_MIN = 0.28;
const REACT_MAX = 0.62;
// Scratch vectors: the bot loop runs every fixed step for every bot, so it
// reuses these instead of allocating a new vector per check.
const _eye = new THREE.Vector3();
const _targetEye = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

function eyeOf(fighter, out) {
  out.set(fighter.position.x, fighter.position.y + 1.5, fighter.position.z);
  return out;
}

function nearestNode(position) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    const dx = WAYPOINTS[i][0] - position.x;
    const dz = WAYPOINTS[i][1] - position.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

// Breadth-first path on the waypoint graph, from the node's neighbours.
function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of WAY_EDGES[node] || []) {
      if (prev[next] !== -1) continue;
      prev[next] = node;
      if (next === to) {
        const path = [to];
        let at = to;
        while (at !== from) {
          at = prev[at];
          path.unshift(at);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

function buildBotMesh(scene, team, name) {
  const group = new THREE.Group();
  const trim = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'atk' ? PALETTE.attack : PALETTE.defend),
    roughness: 0.6, metalness: 0.1,
  });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22262c'), roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.32), trim);
  torso.position.y = 1.12;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.36), dark);
  vest.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), skin);
  head.position.y = 1.66;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), dark);
  helmet.position.y = 1.68;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), dark);
  legL.position.set(-0.14, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.24, 1.18, -0.2);
  group.add(torso, vest, head, helmet, legL, legR, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
    }
  });
  scene.add(group);
  return { group, torso, head, gun };
}

export function createBot(scene, options) {
  const { name, team, skill, spawn, weaponId, role, site } = options;
  const def = WEAPONS[weaponId] || WEAPONS.rifle;
  const mover = createMover(options.colliders, spawn[0], spawn[1]);
  const body = mover.body;
  const parts = buildBotMesh(scene, team, name);
  const fighter = {
    kind: 'bot',
    name,
    team,
    health: 100,
    alive: true,
    hitMeshes: [parts.torso, parts.head],
    get position() {
      return body.position;
    },
    get eyePosition() {
      return new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z);
    },
  };
  parts.torso.userData.fighter = fighter;
  parts.torso.userData.part = 'torso';
  parts.head.userData.fighter = fighter;
  parts.head.userData.part = 'head';

  const bot = {
    fighter,
    body,
    role,
    site: site || null,
    weaponId,
    def,
    skill, // 0..1: reaction speed, aim error and burst discipline
    state: 'hold',
    path: [],
    pathIndex: 0,
    goalNode: nearestNode(body.position),
    target: null,
    lastSeen: new THREE.Vector3(),
    lastSeenTime: -99,
    spottedUntil: 0, // minimap: enemies show while recently seen or heard
    reactUntil: 0,
    aimTime: 0,
    burstLeft: 0,
    burstPause: 0,
    mag: def.mag,
    cooldown: 0,
    reloadLeft: 0,
    holdNode: nearestNode(body.position),
    holdYaw: team === 'def' ? 0 : Math.PI,
    plantProgress: 0,
    defuseProgress: 0,
    carrier: false,
    stuckTime: 0,
    lastProgress: new THREE.Vector3(spawn[0], 0, spawn[1]),
    progressAt: 0,
    fall: 0,
    heardAt: null,
    heardTime: -99,
  };

  function setGoal(node, ctx) {
    const from = nearestNode(body.position);
    bot.path = findPath(from, node);
    bot.pathIndex = 0;
    bot.goalNode = node;
  }

  function steerToward(target, dt, speed) {
    const dx = target.x - body.position.x;
    const dz = target.z - body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const wantYaw = Math.atan2(-dx, -dz);
    let diff = wantYaw - body.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    body.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    const forward = Math.cos(diff) > 0.3 ? 1 : 0;
    const strafe = Math.sin(diff) > 0.4 ? 1 : Math.sin(diff) < -0.4 ? -1 : 0;
    const wish = mover.wishFor(body.yaw, forward, strafe, _wish);
    mover.step(dt, wish.x, wish.z, speed, 30, 8, false);
    return dist < 0.6;
  }

  function visibleEnemy(ctx) {
    let best = null;
    let bestScore = Infinity;
    for (const other of ctx.fighters) {
      if (other === fighter || !other.alive || other.team === team) continue;
      eyeOf(other, _targetEye);
      eyeOf(fighter, _eye);
      const dist = _eye.distanceTo(_targetEye);
      if (dist > 48) continue;
      // Field of view: about 100 degrees around the bot's facing.
      const dx = _targetEye.x - _eye.x;
      const dz = _targetEye.z - _eye.z;
      const angle = Math.atan2(-dx, -dz);
      let diff = angle - body.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 1.1 && dist > 4) continue;
      if (!ctx.combat.hasLineOfSight(_eye, _targetEye, ctx.world.shootables)) continue;
      const score = dist + Math.abs(diff) * 6;
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    return best;
  }

  function shootAt(dt, ctx, events) {
    const target = bot.target;
    if (!target || !target.alive) return;
    bot.cooldown -= dt;
    if (bot.reloadLeft > 0) {
      bot.reloadLeft -= dt;
      if (bot.reloadLeft <= 0) bot.mag = bot.def.mag;
      return;
    }
    if (bot.burstPause > 0) {
      bot.burstPause -= dt;
      return;
    }
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(ctx.random() * 3);
      bot.burstPause = 0;
    }
    if (bot.cooldown > 0) return;
    bot.cooldown = bot.def.fireGap * (bot.def.kind === 'smg' ? 1.15 : 1);
    if (bot.mag <= 0) {
      bot.reloadLeft = bot.def.reloadTime;
      return;
    }
    bot.mag -= 1;
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.burstPause = 0.55 + ctx.random() * 0.5 - bot.skill * 0.25;
    // Aim error: skill, distance, target speed and aim time all count. A
    // crouched bot aiming for a second is far deadlier than a running one.
    eyeOf(target, _targetEye);
    eyeOf(fighter, _eye);
    const dist = _eye.distanceTo(_targetEye);
    const targetSpeed = target.kind === 'bot' ? 3.5 : ctx.playerSpeed || 0;
    const crouchBonus = body.crouching ? 0.6 : 1;
    const error = (0.055 - bot.skill * 0.032) * (1 + dist / 26) * (1 + targetSpeed / 7) * crouchBonus * Math.max(0.45, 1 - bot.aimTime * 0.5);
    const headChance = 0.08 + bot.skill * 0.1;
    const aimAtHead = ctx.random() < headChance;
    if (aimAtHead) _targetEye.y += 0.18;
    else _targetEye.y -= 0.35;
    const dir = _aim.copy(_targetEye).sub(_eye).normalize();
    const result = ctx.combat.fireHitscan(_eye, dir, error, ctx.random, bot.def.range, ctx.world.shootables, ctx.fighters.filter((f) => f !== fighter));
    _muzzle.copy(_eye).addScaledVector(dir, 0.7);
    ctx.combat.spawnTracer(_muzzle, result.point, team === 'atk' ? PALETTE.attack : PALETTE.defend);
    events.push({ type: 'noise', position: _eye.clone(), radius: 26 });
    if (target.kind === 'player') ctx.audio.distantShot();
    if (result.fighter) {
      const damage = bot.def.damage * (result.part === 'head' ? bot.def.headMult : 1);
      events.push({ type: 'damage', target: result.fighter, amount: damage, part: result.part, attacker: fighter, weapon: bot.def.name });
    }
  }

  function step(dt, ctx, events) {
    if (!fighter.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      parts.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    const time = ctx.time;
    const enemy = visibleEnemy(ctx);
    if (enemy) {
      if (bot.target !== enemy) {
        bot.target = enemy;
        bot.reactUntil = time + REACT_MIN + ctx.random() * (REACT_MAX - REACT_MIN) * (1.2 - bot.skill);
        bot.aimTime = 0;
      }
      bot.lastSeen.copy(enemy.position);
      bot.lastSeenTime = time;
      bot.spottedUntil = time + 3;
    } else if (bot.target && time - bot.lastSeenTime > 2.5) {
      bot.target = null;
    }
    // Hearing: a recent gunshot nearby pulls the bot to investigate.
    if (ctx.noises.length > 0) {
      for (const noise of ctx.noises) {
        if (noise.position.distanceTo(body.position) < noise.radius) {
          bot.heardAt = noise.position.clone();
          bot.heardTime = time;
          bot.spottedUntil = Math.max(bot.spottedUntil, time + 1.5);
        }
      }
    }

    const bomb = ctx.round.bomb;
    const phase = ctx.round.phase;
    const engaging = bot.target && time >= bot.reactUntil;
    if (engaging) bot.aimTime += dt;
    else bot.aimTime = Math.max(0, bot.aimTime - dt * 2);

    // Decide what to do this tick.
    let moving = false;
    let speed = BOT_WALK;
    if (phase === 'buy') {
      bot.state = 'hold';
    } else if (bomb.state === 'planted' && team === 'def') {
      bot.state = 'defuse';
    } else if (bomb.state === 'planted' && team === 'atk') {
      bot.state = 'guard';
    } else if (team === 'def') {
      bot.state = engaging ? 'engage' : 'hold';
    } else {
      // Attackers: push the assigned site, plant when there, guard the bomb.
      if (bot.carrier && bot.site) {
        const site = SITES[bot.site];
        const inSite = body.position.x >= site.minX && body.position.x <= site.maxX && body.position.z >= site.minZ && body.position.z <= site.maxZ;
        if (inSite && !engaging) bot.state = 'plant';
        else bot.state = engaging ? 'engage' : 'push';
      } else if (bomb.state === 'dropped') {
        bot.state = 'fetch';
      } else {
        bot.state = engaging ? 'engage' : 'push';
      }
    }

    if (bot.state === 'hold') {
      const hold = WAYPOINTS[bot.holdNode];
      const dx = hold[0] - body.position.x;
      const dz = hold[1] - body.position.z;
      if (Math.hypot(dx, dz) > 0.8) {
        moving = steerToward(new THREE.Vector3(hold[0], 0, hold[1]), dt, BOT_WALK);
      } else {
        // Scan the lane the bot is guarding.
        body.yaw += Math.sin(time * 0.5 + bot.holdNode) * 0.0016;
        mover.setCrouch(false);
        mover.step(dt, 0, 0, BOT_WALK, 30, 8, false);
      }
      if (bot.heardAt && time - bot.heardTime < 3 && !enemy) {
        body.yaw = Math.atan2(-(bot.heardAt.x - body.position.x), -(bot.heardAt.z - body.position.z));
      }
    } else if (bot.state === 'push' || bot.state === 'fetch' || bot.state === 'defuse' || bot.state === 'guard') {
      let goal;
      if (bot.state === 'fetch') goal = bomb.position;
      else if (bot.state === 'defuse') goal = bomb.position;
      else if (bot.state === 'guard') goal = new THREE.Vector3(body.position.x, 0, body.position.z);
      else goal = bot.site ? new THREE.Vector3((SITES[bot.site].minX + SITES[bot.site].maxX) / 2, 0, (SITES[bot.site].minZ + SITES[bot.site].maxZ) / 2) : new THREE.Vector3(0, 0, -6);
      if (bot.state === 'guard') {
        // Hold a perimeter around the planted bomb, facing outward.
        const gx = bomb.position.x + Math.sin(time * 0.2 + bot.holdNode) * 4;
        const gz = bomb.position.z + Math.cos(time * 0.2 + bot.holdNode) * 4;
        moving = steerToward(new THREE.Vector3(gx, 0, gz), dt, BOT_WALK);
      } else {
        const goalNode = nearestNode(goal);
        if (goalNode !== bot.goalNode || bot.path.length === 0) setGoal(goalNode, ctx);
        const waypoint = WAYPOINTS[bot.path[Math.min(bot.pathIndex, bot.path.length - 1)]];
        const arrived = steerToward(new THREE.Vector3(waypoint[0], 0, waypoint[1]), dt, bot.state === 'push' ? BOT_PUSH : BOT_WALK);
        if (arrived && bot.pathIndex < bot.path.length - 1) bot.pathIndex += 1;
        moving = true;
        speed = BOT_PUSH;
      }
      // Stuck detection: no progress in 2.5 s means pick a new route.
      if (time - bot.progressAt > 2.5) {
        if (body.position.distanceTo(bot.lastProgress) < 0.4 && moving) {
          bot.path = [];
          bot.goalNode = -1;
        }
        bot.lastProgress.copy(body.position);
        bot.progressAt = time;
      }
    } else if (bot.state === 'plant') {
      mover.setCrouch(false);
      mover.step(dt, 0, 0, BOT_WALK, 30, 8, false);
      bot.plantProgress += dt;
      if (bot.plantProgress >= 3) {
        bot.plantProgress = 0;
        events.push({ type: 'planted', by: fighter, site: bot.site });
      }
    } else if (bot.state === 'engage') {
      // Strafe perpendicular to the target while firing: a moving target is
      // harder to hit, and a bot that stands still is a free kill.
      const targetPos = bot.target.position;
      const dx = targetPos.x - body.position.x;
      const dz = targetPos.z - body.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      const wantYaw = Math.atan2(-dx, -dz);
      let diff = wantYaw - body.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      body.yaw += Math.max(-4 * dt, Math.min(4 * dt, diff));
      const strafeDir = Math.sin(time * 0.9 + bot.holdNode) > 0 ? 1 : -1;
      const keep = dist > 20 ? 1 : dist < 8 ? -1 : 0;
      const wish = mover.wishFor(body.yaw, keep, strafeDir, _wish);
      mover.setCrouch(dist > 18);
      mover.step(dt, wish.x, wish.z, BOT_WALK * 0.7, 30, 8, false);
    }

    if (bot.state === 'defuse' && bomb.state === 'planted') {
      const dist = body.position.distanceTo(bomb.position);
      if (dist < 1.6) {
        mover.step(dt, 0, 0, BOT_WALK, 30, 8, false);
        bot.defuseProgress += dt;
        if (Math.floor(bot.defuseProgress * 2) !== Math.floor((bot.defuseProgress - dt) * 2)) {
          ctx.audio.defuseBeep();
        }
        if (bot.defuseProgress >= 5) {
          bot.defuseProgress = 0;
          events.push({ type: 'defused', by: fighter });
        }
      } else {
        bot.defuseProgress = 0;
      }
    } else {
      bot.defuseProgress = 0;
    }
    if (bot.state !== 'plant') bot.plantProgress = 0;

    if (engaging) shootAt(dt, ctx, events);
    else if (bot.reloadLeft <= 0 && bot.mag < bot.def.mag * 0.4) bot.reloadLeft = bot.def.reloadTime;

    // Sync the visible body to the simulated one.
    parts.group.position.copy(body.position);
    parts.group.rotation.y = body.yaw;
    parts.group.position.y = body.position.y;
    if (body.crouching) parts.group.scale.y = 0.72;
    else parts.group.scale.y = 1;
  }

  function damage(amount) {
    if (!fighter.alive) return false;
    fighter.health -= amount;
    if (fighter.health <= 0) {
      fighter.health = 0;
      fighter.alive = false;
      return true;
    }
    return false;
  }

  function respawn(spawnPoint, weapon, newSite, newRole) {
    body.position.set(spawnPoint[0], 0, spawnPoint[1]);
    body.velocity.set(0, 0, 0);
    body.yaw = team === 'def' ? 0 : Math.PI;
    body.pitch = 0;
    body.eye = 1.6;
    fighter.health = 100;
    fighter.alive = true;
    bot.fall = 0;
    bot.target = null;
    bot.plantProgress = 0;
    bot.defuseProgress = 0;
    bot.carrier = false;
    bot.path = [];
    bot.goalNode = -1;
    bot.holdNode = nearestNode(body.position);
    bot.state = 'hold';
    if (weapon) {
      bot.weaponId = weapon;
      bot.def = WEAPONS[weapon];
      bot.mag = bot.def.mag;
    }
    bot.reloadLeft = 0;
    bot.cooldown = 0;
    bot.burstLeft = 0;
    if (newSite) bot.site = newSite;
    if (newRole) bot.role = newRole;
    parts.group.rotation.set(0, body.yaw, 0);
    parts.group.scale.y = 1;
    parts.group.position.copy(body.position);
  }

  return { fighter, bot, body, parts, step, damage, respawn, setGoal };
}
