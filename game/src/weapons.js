// The armoury: four guns and a grenade, each with its own numbers. A weapon
// owns its magazine, its cooldown and its view model; main.js owns the ray and
// the damage, combat.js owns the tracer. Spread grows with movement and recoil,
// and aiming down sights tightens it: stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'PD-9', kind: 'pistol', price: 0,
    mag: 12, reserve: Infinity, damage: 26, headMult: 3,
    fireGap: 0.16, reloadTime: 1.4, auto: false,
    spreadStill: 0.004, spreadMove: 0.03, recoil: 0.007, range: 60,
  },
  rifle: {
    id: 'rifle', name: 'VK-47', kind: 'rifle', price: 2700,
    mag: 30, reserve: 90, damage: 34, headMult: 3,
    fireGap: 0.1, reloadTime: 2.1, auto: true,
    spreadStill: 0.0024, spreadMove: 0.03, recoil: 0.011, range: 90,
  },
  smg: {
    id: 'smg', name: 'KX-9', kind: 'smg', price: 1500,
    mag: 32, reserve: 96, damage: 22, headMult: 2.5,
    fireGap: 0.072, reloadTime: 1.7, auto: true,
    spreadStill: 0.005, spreadMove: 0.036, recoil: 0.007, range: 55,
  },
  dmr: {
    id: 'dmr', name: 'RAIL-7', kind: 'dmr', price: 3800,
    mag: 10, reserve: 20, damage: 82, headMult: 2,
    fireGap: 0.85, reloadTime: 2.6, auto: false,
    spreadStill: 0.0006, spreadMove: 0.05, recoil: 0.03, range: 120,
  },
};
export const GRENADE_PRICE = 300;

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const model = new THREE.Group();
  model.scale.setScalar(0.6);
  if (def.kind === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.24), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), grip);
    handle.position.set(0, -0.08, 0.08);
    model.add(slide, handle);
    model.position.set(0.22, -0.2, -0.45);
  } else if (def.kind === 'dmr') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.5), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.55), grip);
    barrel.position.set(0, 0.03, -0.5);
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.2), accent);
    scope.position.set(0, 0.08, -0.1);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.24), grip);
    stock.position.set(0, -0.02, 0.16);
    model.add(receiver, barrel, scope, stock);
    model.position.set(0.26, -0.23, -0.55);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.14);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), accent);
    mag.position.set(0, -0.11, -0.05);
    model.add(receiver, barrel, stock, mag);
    model.position.set(0.26, -0.23, -0.55);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.21, -0.95);
  flash.visible = false;
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.19, -0.7);
  // Base position the step function returns to (kick and ADS offset from here).
  const base = new THREE.Vector3(model.position.x, model.position.y, model.position.z);
  return { model, flash, flashLight, base };
}

export function createWeaponSet(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    const built = buildViewModel(def);
    built.model.visible = false;
    camera.add(built.model, built.flash, built.flashLight);
    models[def.id] = built;
  }
  const state = {
    current: 'pistol',
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0, // accumulated spread from sustained fire, decays when not firing
    aimBlend: 0, // 0 hip, 1 aimed down sights
  };

  function equip(id) {
    if (!WEAPONS[id] || id === state.current) return false;
    models[state.current].model.visible = false;
    state.current = id;
    const def = WEAPONS[id];
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.bloom = 0;
    models[id].model.visible = true;
    return true;
  }

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt, aiming) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - dt * 0.05);
    const aimTarget = aiming ? 1 : 0;
    state.aimBlend += (aimTarget - state.aimBlend) * Math.min(1, dt * 10);
    const built = models[state.current];
    built.model.position.z = built.base.z + state.kick;
    built.model.position.x = built.base.x * (1 - state.aimBlend * 0.92);
    built.model.position.y = built.base.y + state.aimBlend * 0.055;
    built.model.rotation.x = state.kick * 2.2;
    built.flash.visible = state.flash > 0;
    built.flash.rotation.z = state.flash * 30;
    built.flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      built.model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        if (Number.isFinite(state.reserve)) state.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    equip,
    step,
    show() {
      models[state.current].model.visible = true;
    },
    hide() {
      models[state.current].model.visible = false;
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(0.03, state.bloom + (d.kind === 'dmr' ? 0.02 : 0.004));
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || state.mag === d.mag || state.reserve === 0) return false;
      state.reloadLeft = d.reloadTime;
      return true;
    },
    refill() {
      const d = def();
      state.mag = d.mag;
      state.reserve = d.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    // Current spread in radians: still + moving + bloom, tightened by aiming.
    spread(speed) {
      const d = def();
      const move = Math.min(1, speed / 5.2);
      const base = d.spreadStill + move * d.spreadMove + state.bloom;
      return base * (1 - state.aimBlend * 0.55);
    },
    recoil() {
      return def().recoil * (1 - state.aimBlend * 0.3);
    },
  };
}
