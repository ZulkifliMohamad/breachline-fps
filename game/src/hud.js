// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// kill feed, buy menu, banners, overlays and the 2D minimap. It never touches
// the simulation; the match pushes numbers in and reads callbacks out.
import { WEAPONS, GRENADE_PRICE } from './weapons.js';

const OVERLAY_COPY = {
  start: {
    title: 'BREACHLINE',
    copy: 'Depot 9, dusk. You attack with Rook and Vex against four defenders. Plant the spike at Site A or Site B — or eliminate the whole team. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'BREACHLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Your team fights on. Watch the round play out — or start the next match when it ends.',
    action: 'Spectate',
  },
  matchEnd: {
    title: '',
    copy: '',
    action: 'Play again',
  },
};

export function createHud(world) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const overlayExtra = $('overlay-extra');
  const playButton = $('play');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const grenadeCount = $('grenade-count');
  const timerValue = $('timer-value');
  const roundValue = $('round-value');
  const scoreAtk = $('score-atk');
  const scoreDef = $('score-def');
  const aliveAtk = $('alive-atk');
  const aliveDef = $('alive-def');
  const killfeed = $('killfeed');
  const buyMenu = $('buy-menu');
  const buyItems = $('buy-items');
  const buyMoney = $('buy-money');
  const bombStatus = $('bomb-status');
  const bombLabel = $('bomb-label');
  const bombTimer = $('bomb-timer');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const minimap = $('minimap');
  const vignette = $('damage-vignette');
  const hint = $('hint');
  const mapCtx = minimap ? minimap.getContext('2d') : null;

  let hitTimer = 0;
  let bannerTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastMoney = -1;
  let lastHealth = -1;
  let lastTimer = -1;
  let onBuyWeapon = null;
  let onBuyGrenade = null;
  let onPlay = null;

  function buildBuyMenu() {
    if (!buyItems) return;
    buyItems.innerHTML = '';
    const defs = [
      { key: '1', id: 'rifle' },
      { key: '2', id: 'smg' },
      { key: '3', id: 'dmr' },
    ];
    for (const { key, id } of defs) {
      const def = WEAPONS[id];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.dataset.weapon = id;
      button.innerHTML = `<b>[${key}] ${def.name}</b><span>$${def.price} · ${def.damage} dmg · ${def.mag} rounds</span>`;
      button.addEventListener('click', () => onBuyWeapon && onBuyWeapon(id));
      buyItems.appendChild(button);
    }
    const grenade = document.createElement('button');
    grenade.type = 'button';
    grenade.className = 'buy-item';
    grenade.innerHTML = `<b>[4] FRAG-1 grenade</b><span>$${GRENADE_PRICE} · throw with G · max 2</span>`;
    grenade.addEventListener('click', () => onBuyGrenade && onBuyGrenade());
    buyItems.appendChild(grenade);
  }
  buildBuyMenu();

  return {
    setHealth(value) {
      if (value === lastHealth) return;
      lastHealth = value;
      if (healthFill) healthFill.style.width = `${Math.max(0, value)}%`;
      if (healthValue) healthValue.textContent = String(Math.ceil(value));
      if (healthFill) healthFill.classList.toggle('low', value <= 30);
    },
    setAmmo(mag, reserve, name) {
      if (mag === lastMag && reserve === lastReserve && name === lastWeapon) return;
      lastMag = mag;
      lastReserve = reserve;
      lastWeapon = name || '';
      if (ammoMag) ammoMag.textContent = String(mag);
      if (ammoReserve) ammoReserve.textContent = Number.isFinite(reserve) ? `/ ${reserve}` : '/ ∞';
      if (weaponName) weaponName.textContent = name || '';
      const ammo = $('ammo');
      if (ammo) ammo.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      if (moneyValue) moneyValue.textContent = `$${value}`;
      if (buyMoney) buyMoney.textContent = `$${value}`;
      if (buyItems) {
        for (const button of buyItems.querySelectorAll('[data-weapon]')) {
          button.disabled = value < WEAPONS[button.dataset.weapon].price;
        }
      }
    },
    setGrenades(count) {
      if (grenadeCount) grenadeCount.textContent = `GRENADES ${count}`;
    },
    setTimer(seconds, isBuy) {
      const value = Math.max(0, seconds);
      if (value === lastTimer) return;
      lastTimer = value;
      if (timerValue) {
        const minutes = Math.floor(value / 60);
        const secs = value % 60;
        timerValue.textContent = `${minutes}:${String(secs).padStart(2, '0')}`;
        timerValue.classList.toggle('buy', !!isBuy);
      }
    },
    setScore(atk, def, round) {
      if (scoreAtk) scoreAtk.textContent = String(atk);
      if (scoreDef) scoreDef.textContent = String(def);
      if (roundValue) roundValue.textContent = `ROUND ${round}`;
    },
    setAlive(atk, def) {
      if (aliveAtk) aliveAtk.textContent = `${atk} alive`;
      if (aliveDef) aliveDef.textContent = `${def} alive`;
    },
    setCrosshairGap(pixels) {
      if (crosshair) crosshair.style.setProperty('--gap', `${pixels.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      if (!hitmarker) return;
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', !!killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      if (!vignette) return;
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    shake(strength) {
      document.body.classList.add('shake');
      setTimeout(() => document.body.classList.remove('shake'), 350);
      void strength;
    },
    killfeed(attacker, victim, weapon, headshot) {
      if (!killfeed) return;
      const entry = document.createElement('div');
      entry.className = 'feed-entry';
      entry.innerHTML = `<span class="feed-attacker">${attacker}</span> <span class="feed-weapon">[${weapon}${headshot ? ' · HEADSHOT' : ''}]</span> <span class="feed-victim">${victim}</span>`;
      killfeed.prepend(entry);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => entry.classList.add('fade'), 4200);
      setTimeout(() => entry.remove(), 5000);
    },
    banner(title, sub) {
      if (!banner) return;
      bannerTitle.textContent = title;
      bannerSub.textContent = sub || '';
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), 2600);
    },
    showBuy(money) {
      this.setMoney(money);
      if (buyMenu) buyMenu.hidden = false;
      if (hint) hint.textContent = 'B — close buy menu · 1/2/3 weapons · 4 grenade';
    },
    hideBuy() {
      if (buyMenu) buyMenu.hidden = true;
      if (hint) hint.textContent = 'E — plant / interact · G — grenade · B — buy · M — mute';
    },
    onBuy(weaponHandler, grenadeHandler) {
      onBuyWeapon = weaponHandler;
      onBuyGrenade = grenadeHandler;
    },
    setBomb(state, seconds, site) {
      if (!bombStatus) return;
      if (state === 'planted') {
        bombStatus.hidden = false;
        if (bombLabel) bombLabel.textContent = `SPIKE PLANTED — SITE ${site}`;
        if (bombTimer) bombTimer.textContent = `${Math.ceil(seconds)}s`;
        bombStatus.classList.add('live');
      } else if (state === 'dropped') {
        bombStatus.hidden = false;
        if (bombLabel) bombLabel.textContent = 'SPIKE DROPPED — pick it up';
        if (bombTimer) bombTimer.textContent = '';
        bombStatus.classList.remove('live');
      } else if (state === 'carried') {
        bombStatus.hidden = false;
        if (bombLabel) bombLabel.textContent = 'YOU CARRY THE SPIKE — plant at Site A or B (hold E)';
        if (bombTimer) bombTimer.textContent = '';
        bombStatus.classList.remove('live');
      } else {
        bombStatus.hidden = true;
        if (bombTimer) bombTimer.textContent = '';
      }
    },
    setPlant(progress, label) {
      if (!plantBar) return;
      if (progress > 0) {
        plantBar.hidden = false;
        plantFill.style.width = `${Math.min(100, progress * 100)}%`;
        plantLabel.textContent = label || '';
      } else {
        plantBar.hidden = true;
      }
    },
    showOverlay(mode, data = {}) {
      const text = OVERLAY_COPY[mode] || OVERLAY_COPY.start;
      if (mode === 'matchEnd') {
        const won = data.winner === 'atk';
        overlayTitle.textContent = won ? 'MATCH WON' : 'MATCH LOST';
        overlayCopy.textContent = won
          ? `Attackers take Depot 9, ${data.scoreAtk}–${data.scoreDef}. Your kills: ${data.kills}.`
          : `Defenders hold Depot 9, ${data.scoreDef}–${data.scoreAtk}. Your kills: ${data.kills}.`;
      } else if (mode === 'dead') {
        overlayTitle.textContent = text.title;
        overlayCopy.textContent = `${text.copy} Score ${data.scoreAtk}–${data.scoreDef}, round ${data.round}.`;
      } else {
        overlayTitle.textContent = text.title;
        overlayCopy.textContent = text.copy;
      }
      if (overlayExtra) overlayExtra.textContent = '';
      if (playButton) playButton.textContent = text.action;
      if (overlay) overlay.hidden = false;
      if (playButton) playButton.focus();
    },
    hideOverlay() {
      if (overlay) overlay.hidden = true;
    },
    onPlay(handler) {
      onPlay = handler;
      if (playButton) playButton.addEventListener('click', () => onPlay && onPlay());
    },
    // Top-down minimap: walls, sites, teammates, the bomb and enemies that
    // have been seen or heard recently. North is up.
    drawMinimap(state) {
      if (!mapCtx || !minimap) return;
      const width = minimap.width;
      const height = minimap.height;
      const scaleX = width / 54;
      const scaleY = height / 38;
      const toX = (x) => (x + 27) * scaleX;
      const toZ = (z) => (z + 19) * scaleY;
      mapCtx.clearRect(0, 0, width, height);
      mapCtx.fillStyle = 'rgba(14, 18, 24, 0.82)';
      mapCtx.fillRect(0, 0, width, height);
      for (const wall of world.minimapWalls) {
        mapCtx.fillStyle = '#3a424d';
        mapCtx.fillRect(toX(wall[0] - wall[2] / 2), toZ(wall[1] - wall[3] / 2), Math.max(1, wall[2] * scaleX), Math.max(1, wall[3] * scaleY));
      }
      for (const site of Object.values(state.sites)) {
        mapCtx.fillStyle = 'rgba(240, 168, 48, 0.25)';
        mapCtx.fillRect(toX(site.minX), toZ(site.minZ), (site.maxX - site.minX) * scaleX, (site.maxZ - site.minZ) * scaleY);
        mapCtx.fillStyle = '#f0a830';
        mapCtx.font = 'bold 10px sans-serif';
        mapCtx.fillText(site.name, toX(site.minX) + 2, toZ(site.minZ) + 11);
      }
      if (state.bomb && state.bomb.state === 'planted') {
        mapCtx.fillStyle = '#e5484d';
        mapCtx.beginPath();
        mapCtx.arc(toX(state.bomb.position.x), toZ(state.bomb.position.z), 4, 0, Math.PI * 2);
        mapCtx.fill();
      } else if (state.bomb && state.bomb.state === 'dropped') {
        mapCtx.fillStyle = '#f0a830';
        mapCtx.beginPath();
        mapCtx.arc(toX(state.bomb.position.x), toZ(state.bomb.position.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
      for (const fighter of state.fighters) {
        if (!fighter.alive) continue;
        const x = toX(fighter.position.x);
        const z = toZ(fighter.position.z);
        if (fighter.kind === 'player') {
          mapCtx.fillStyle = '#ffffff';
          mapCtx.save();
          mapCtx.translate(x, z);
          mapCtx.rotate(Math.PI - state.playerYaw);
          mapCtx.beginPath();
          mapCtx.moveTo(0, -5);
          mapCtx.lineTo(4, 4);
          mapCtx.lineTo(-4, 4);
          mapCtx.closePath();
          mapCtx.fill();
          mapCtx.restore();
        } else if (fighter.team === 'atk') {
          mapCtx.fillStyle = '#f0a830';
          mapCtx.beginPath();
          mapCtx.arc(x, z, 3, 0, Math.PI * 2);
          mapCtx.fill();
        } else if (state.time <= (fighter.spottedUntil || 0)) {
          mapCtx.fillStyle = '#e5484d';
          mapCtx.beginPath();
          mapCtx.arc(x, z, 3, 0, Math.PI * 2);
          mapCtx.fill();
        }
      }
    },
  };
}
