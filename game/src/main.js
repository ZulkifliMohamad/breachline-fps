// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. The simulation (movement, bots, bomb, economy) never reads
// the frame rate; rendering only reads the simulation's state.
// ?shot=start|play|end with &seed=N stages a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createBot } from './bots.js';
import { createCombat, createGrenades } from './combat.js';
import { createMatch, ROUND_SECONDS } from './game.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const combat = createCombat(scene);
const grenades = createGrenades(scene, world.colliders);
const hud = createHud(world);
const player = createPlayer(scene, camera, world.colliders, SPAWNS.attack[0]);

const allies = [
  createBot(scene, { name: 'Rook', team: 'atk', skill: 0.55, spawn: SPAWNS.attack[1], weaponId: 'rifle', role: 'attack', site: 'A', colliders: world.colliders }),
  createBot(scene, { name: 'Vex', team: 'atk', skill: 0.5, spawn: SPAWNS.attack[2], weaponId: 'smg', role: 'attack', site: 'A', colliders: world.colliders }),
];
const enemies = [
  createBot(scene, { name: 'Havoc', team: 'def', skill: 0.62, spawn: SPAWNS.defend[0], weaponId: 'rifle', role: 'defend', site: 'A', colliders: world.colliders }),
  createBot(scene, { name: 'Bishop', team: 'def', skill: 0.58, spawn: SPAWNS.defend[1], weaponId: 'rifle', role: 'defend', site: 'A', colliders: world.colliders }),
  createBot(scene, { name: 'Nomad', team: 'def', skill: 0.5, spawn: SPAWNS.defend[2], weaponId: 'smg', role: 'defend', site: 'B', colliders: world.colliders }),
  createBot(scene, { name: 'Onyx', team: 'def', skill: 0.45, spawn: SPAWNS.defend[3], weaponId: 'rifle', role: 'defend', site: 'B', colliders: world.colliders }),
];
const allBots = [...allies, ...enemies];
const fighters = [player.fighter, ...allBots.map((b) => b.fighter)];

const matchCtx = {
  scene,
  player,
  allies,
  enemies,
  hud,
  audio,
  grenades,
  combat,
  random,
  playerDamage(amount) {
    const died = player.damage(amount);
    hud.setHealth(player.fighter.health);
    return died;
  },
  botDamage(target, amount) {
    const wrapper = allBots.find((b) => b.fighter === target);
    if (!wrapper) return false;
    return wrapper.damage(amount);
  },
};
const game = createMatch(matchCtx);
const match = game.match;

const input = createInput(renderer.domElement, onLockChange);
const direction = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
const minimapFighters = [];

let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let elapsed = 0;
let minimapAt = 0;
let recentNoises = [];
let baseFov = 74;

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (match.phase === 'menu' || match.phase === 'matchEnd') {
    game.startMatch();
    started = true;
    input.requestLock();
  } else if (!player.fighter.alive) {
    // Down: hide the panel and spectate from where you fell.
    hud.hideOverlay();
  } else {
    input.requestLock();
  }
});
hud.onBuy(
  (id) => game.buyWeapon(id),
  () => game.buyGrenade(),
);

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (match.phase === 'live' && player.fighter.alive) {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  const body = player.body;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const body = player.body;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function throwGrenade() {
  const fighter = player.fighter;
  if (fighter.grenades <= 0 || match.phase !== 'live' || !fighter.alive) return;
  fighter.grenades -= 1;
  hud.setGrenades(fighter.grenades);
  camera.getWorldDirection(direction);
  const origin = camera.position.clone().addScaledVector(direction, 0.5);
  const velocity = direction.clone().multiplyScalar(16);
  velocity.y += 3.5;
  velocity.add(player.body.velocity);
  grenades.throwGrenade(origin, velocity, fighter);
  audio.grenadePin();
  recentNoises.push({ position: origin.clone(), radius: 20, time: elapsed });
}

function shootPlayer() {
  const weapons = player.weapons;
  if (!weapons.ready()) {
    if (weapons.state.mag === 0 && weapons.state.reserve !== 0) {
      if (weapons.reload()) audio.reload();
    } else {
      audio.dryFire();
    }
    return;
  }
  if (!weapons.takeRound()) return;
  camera.getWorldDirection(direction);
  const spread = weapons.spread(player.groundSpeed());
  const result = combat.fireHitscan(
    camera.position,
    direction,
    spread,
    random,
    weapons.def().range,
    world.shootables,
    fighters.filter((f) => f !== player.fighter),
  );
  const muzzle = cameraTarget.copy(camera.position).addScaledVector(direction, 0.7);
  combat.spawnTracer(muzzle, result.point);
  weapons.pullTrigger();
  audio.shot(weapons.def().kind);
  recentNoises.push({ position: camera.position.clone(), radius: 26, time: elapsed });
  player.recoil(weapons.recoil() * (0.9 + random() * 0.2), (random() * 2 - 1) * 0.003);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
  if (result.fighter) {
    const damage = weapons.def().damage * (result.part === 'head' ? weapons.def().headMult : 1);
    game.applyDamage(result.fighter, damage, result.part, player.fighter, weapons.def().name);
    hud.hitMarker(result.fighter.health <= 0, result.fighter.health <= 0 ? 4000 : 90);
    audio.hit(result.fighter.health <= 0);
  }
}

function step(dt) {
  elapsed += dt;
  const phase = match.phase;
  const frozenMove = phase === 'buy' || phase === 'menu' || phase === 'matchEnd' || !player.fighter.alive;
  player.step(dt, input.state.keys, frozenMove);
  player.weapons.step(dt, input.state.aiming && player.fighter.alive);

  // Aim-down-sights tightens the field of view for marksman shots.
  const targetFov = input.state.aiming && player.fighter.alive
    ? (player.weapons.def().kind === 'dmr' ? 55 : 64)
    : baseFov;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
  }
  hud.setCrosshairGap(6 + player.weapons.spread(player.groundSpeed()) * 900 + player.groundSpeed() * 1.2);

  const botCtx = {
    time: elapsed,
    fighters,
    world,
    combat,
    random,
    round: match,
    noises: recentNoises,
    audio,
    playerSpeed: player.groundSpeed(),
  };
  const events = [];
  for (const bot of allBots) bot.step(dt, botCtx, events);
  game.handleEvents(events);
  // Noises fade: bots only react to gunfire from the last 1.5 seconds.
  recentNoises = recentNoises.filter((noise) => elapsed - noise.time < 1.5);

  const blasts = grenades.step(dt, fighters);
  for (const blast of blasts) {
    audio.explosion();
    for (const fighter of fighters) {
      if (!fighter.alive) continue;
      const dist = fighter.position.distanceTo(blast.position);
      if (dist > 7) continue;
      const damage = Math.max(15, 120 * (1 - dist / 7));
      game.applyDamage(fighter, damage, 'torso', blast.owner, 'FRAG-1');
    }
    if (player.fighter.position.distanceTo(blast.position) < 12) hud.shake(1);
  }
  combat.stepTracers(dt);
  game.step(dt, input, elapsed);

  // Minimap at ~7 Hz: cheap, and the dots do not need frame precision.
  if (elapsed - minimapAt > 0.14) {
    minimapAt = elapsed;
    minimapFighters.length = 0;
    for (const fighter of fighters) {
      const wrapper = allBots.find((b) => b.fighter === fighter);
      minimapFighters.push({
        kind: fighter.kind,
        team: fighter.team,
        alive: fighter.alive,
        position: fighter.position,
        spottedUntil: wrapper ? wrapper.bot.spottedUntil : 0,
      });
    }
    hud.drawMinimap({
      sites: SITES,
      fighters: minimapFighters,
      bomb: match.bomb,
      time: elapsed,
      playerYaw: player.body.yaw,
    });
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.fighter.alive) player.look(look.x, look.y);
    const live = match.phase === 'live' && player.fighter.alive && input.state.locked;
    if (live && input.state.firing && player.weapons.def().auto) shootPlayer();
    if (live && input.state.firing && !player.weapons.def().auto) {
      // Semi-automatic weapons fire once per click, not while held.
      if (input.consume('MouseDown')) shootPlayer();
    }
    if (input.consume('KeyR') && player.fighter.alive) {
      if (player.weapons.reload()) audio.reload();
    }
    if (input.consume('KeyG')) throwGrenade();
    if (input.consume('KeyM')) audio.toggleMute();
    if (input.consume('KeyB') && match.phase === 'buy') {
      if (document.getElementById('buy-menu').hidden) hud.showBuy(player.fighter.money);
      else hud.hideBuy();
    }
    if (match.phase === 'buy') {
      if (input.consume('Digit1')) game.buyWeapon('rifle');
      if (input.consume('Digit2')) game.buyWeapon('smg');
      if (input.consume('Digit3')) game.buyWeapon('dmr');
      if (input.consume('Digit4')) game.buyGrenade();
    }
    input.clearPressed();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function teleportBot(bot, x, z, yaw) {
  bot.body.position.set(x, 0, z);
  bot.body.yaw = yaw;
  bot.parts.group.position.set(x, 0, z);
  bot.parts.group.rotation.y = yaw;
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    player.body.position.set(0, 0, 15.5);
    player.body.yaw = Math.PI;
    player.body.pitch = 0;
    settle(10);
    aimAt(new THREE.Vector3(0, 1.6, -6));
    hud.showOverlay('start');
    paintTwiceThenReady();
    return;
  }
  game.startMatch();
  match.phase = 'live';
  match.roundLeft = 96;
  hud.hideBuy();
  if (name === 'play') {
    // Mid-round: the player holds mid with the rifle, an enemy is in the
    // lane ahead, and one shot has already landed for the hit marker.
    player.body.position.set(0, 0, 6);
    player.body.yaw = Math.PI;
    player.body.pitch = 0;
    player.weapons.equip('rifle');
    player.weapons.refill();
    player.fighter.money = 1200;
    hud.setMoney(1200);
    teleportBot(enemies[0], -2.5, -4, 0);
    teleportBot(enemies[1], 3.5, -7, 0);
    teleportBot(allies[0], -3, 9, Math.PI);
    settle(30);
    aimAt(new THREE.Vector3(-2.5, 1.3, -4));
    shootPlayer();
    paintTwiceThenReady();
    return;
  }
  // end: the match is over, attackers take Depot 9.
  match.score.atk = 5;
  match.score.def = 2;
  match.round = 7;
  game.endMatch('atk');
  player.body.position.set(-6, 0, 10);
  player.body.yaw = Math.PI * 0.85;
  settle(10);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Semi-auto fire needs a click edge: track mousedown as a consumable press.
window.addEventListener('mousedown', (event) => {
  if (event.button === 0 && input.state.locked) input.state.pressed.add('MouseDown');
});

syncCamera();
hud.setHealth(100);
hud.setAmmo(player.weapons.state.mag, player.weapons.state.reserve, player.weapons.def().name);
hud.setMoney(player.fighter.money);
hud.setScore(0, 0, 1);
hud.setTimer(ROUND_SECONDS, false);
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
