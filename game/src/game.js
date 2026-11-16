// The match: rounds, money, the bomb and the win conditions. One state
// machine, one place where the score and the economy live. A match is first to
// 5 rounds, at most 9; a round is 100 seconds, a buy phase is 12, a planted
// bomb blows after 35. Attackers win a round by elimination or detonation;
// defenders win by elimination, defusal or running the clock out.
import * as THREE from 'three';
import { SITES, SPAWNS } from './world.js';
import { WEAPONS, GRENADE_PRICE } from './weapons.js';
import { pick, shuffle } from './rng.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 35;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;

export function createMatch(ctx) {
  const { player, allies, enemies, hud, audio, grenades, combat, random } = ctx;
  const fighters = [player.fighter, ...allies.map((a) => a.fighter), ...enemies.map((e) => e.fighter)];

  const match = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 0,
    score: { atk: 0, def: 0 },
    lossStreak: { atk: 0, def: 0 },
    buyLeft: 0,
    roundLeft: 0,
    roundEndLeft: 0,
    bomb: {
      state: 'carried', // carried | dropped | planted | detonated | defused
      site: null,
      position: new THREE.Vector3(),
      timer: 0,
      carrier: null, // fighter carrying it, or null
      beepAt: 0,
    },
    attackSite: 'A',
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    plantProgress: 0,
    kills: [],
  };

  let bombMesh = null;
  let bombLight = null;

  function allBots() {
    return [...allies, ...enemies];
  }

  function aliveCount(team) {
    return fighters.filter((f) => f.team === team && f.alive).length;
  }

  function award(team, amount) {
    // Money lives on the fighter object for players and bots alike.
    for (const fighter of fighters) {
      if (fighter.team === team) fighter.money = (fighter.money || 0) + amount;
    }
  }

  function autoBuy(bot) {
    const money = bot.fighter.money || 800;
    if (money >= WEAPONS.rifle.price) {
      bot.fighter.money = money - WEAPONS.rifle.price;
      bot.fighter.weaponId = 'rifle';
    } else if (money >= WEAPONS.smg.price) {
      bot.fighter.money = money - WEAPONS.smg.price;
      bot.fighter.weaponId = 'smg';
    }
  }

  function assignRound() {
    match.attackSite = random() < 0.5 ? 'A' : 'B';
    const sites = shuffle(random, ['A', 'A', 'B', 'B']);
    enemies.forEach((bot, i) => {
      bot.bot.site = sites[i];
      bot.bot.role = 'defend';
      // Defenders anchor on hold nodes near their site: west nodes for A,
      // east nodes for B, so the two sites are genuinely covered.
      bot.bot.holdNode = sites[i] === 'A' ? [16, 20, 11, 12][i] : [19, 21, 15, 13][i];
    });
    allies.forEach((bot) => {
      bot.bot.site = match.attackSite;
      bot.bot.role = 'attack';
    });
    match.bomb.site = match.attackSite;
    match.bomb.carrier = player.fighter;
    match.bomb.state = 'carried';
    match.bomb.timer = 0;
    match.bomb.position.set(0, -10, 0);
    if (bombMesh) bombMesh.visible = false;
  }

  function startMatch() {
    match.score.atk = 0;
    match.score.def = 0;
    match.lossStreak.atk = 0;
    match.lossStreak.def = 0;
    match.round = 0;
    match.matchWinner = null;
    for (const fighter of fighters) fighter.money = 800;
    startRound();
  }

  function startRound() {
    match.round += 1;
    match.phase = 'buy';
    match.buyLeft = BUY_SECONDS;
    match.roundLeft = ROUND_SECONDS;
    match.roundEndLeft = 0;
    match.roundWinner = null;
    match.roundReason = '';
    match.plantProgress = 0;
    player.respawn(SPAWNS.attack[0]);
    player.fighter.grenades = 0;
    allies.forEach((bot, i) => {
      autoBuy(bot);
      bot.respawn(SPAWNS.attack[i + 1], bot.fighter.weaponId || 'rifle', match.attackSite, 'attack');
    });
    enemies.forEach((bot, i) => {
      autoBuy(bot);
      bot.respawn(SPAWNS.defend[i], bot.fighter.weaponId || 'rifle', null, 'defend');
    });
    assignRound();
    hud.setScore(match.score.atk, match.score.def, match.round);
    hud.setMoney(player.fighter.money);
    hud.setAmmo(player.weapons.state.mag, player.weapons.state.reserve, player.weapons.def().name);
    hud.setHealth(player.fighter.health);
    hud.setGrenades(player.fighter.grenades);
    hud.setAlive(aliveCount('atk'), aliveCount('def'));
    hud.showBuy(player.fighter.money);
    hud.banner(`ROUND ${match.round}`, `Attackers push ${match.attackSite} — buy phase`);
    audio.buy();
  }

  function beginLive() {
    match.phase = 'live';
    hud.hideBuy();
    hud.banner('GO', 'Plant the spike at Site ' + match.attackSite);
  }

  function endRound(winner, reason) {
    if (match.phase !== 'live' && match.phase !== 'buy') return;
    match.phase = 'roundEnd';
    match.roundWinner = winner;
    match.roundReason = reason;
    match.roundEndLeft = 4.5;
    match.score[winner] += 1;
    const loser = winner === 'atk' ? 'def' : 'atk';
    match.lossStreak[winner] = 0;
    match.lossStreak[loser] += 1;
    const lossBonus = Math.min(3400, LOSS_REWARD + (match.lossStreak[loser] - 1) * 500);
    award(winner, WIN_REWARD);
    award(loser, lossBonus);
    hud.setScore(match.score.atk, match.score.def, match.round);
    hud.setMoney(player.fighter.money);
    if (winner === 'atk') {
      hud.banner('ROUND WON', reason);
      audio.roundWin();
    } else {
      hud.banner('ROUND LOST', reason);
      audio.roundLose();
    }
    hud.hideBuy();
  }

  function endMatch(winner) {
    match.phase = 'matchEnd';
    match.matchWinner = winner;
    hud.showOverlay('matchEnd', {
      winner,
      scoreAtk: match.score.atk,
      scoreDef: match.score.def,
      kills: player.fighter.kills,
    });
    if (winner === 'atk') audio.roundWin();
    else audio.roundLose();
  }

  function plantBomb(site, by) {
    match.bomb.state = 'planted';
    match.bomb.site = site;
    match.bomb.timer = BOMB_SECONDS;
    match.bomb.carrier = null;
    const s = SITES[site];
    match.bomb.position.set((s.minX + s.maxX) / 2, 0.1, (s.minZ + s.maxZ) / 2);
    if (!bombMesh) {
      bombMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.32, 0.36),
        new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.4, metalness: 0.5, emissive: 0x552200 }),
      );
      bombLight = new THREE.PointLight(0xe5484d, 8, 10, 1.8);
      ctx.scene.add(bombMesh, bombLight);
    }
    bombMesh.visible = true;
    bombMesh.position.copy(match.bomb.position);
    bombLight.position.set(match.bomb.position.x, match.bomb.position.y + 0.6, match.bomb.position.z);
    hud.setBomb('planted', match.bomb.timer, site);
    hud.banner('SPIKE PLANTED', `Site ${site} — ${BOMB_SECONDS}s to detonation`);
    audio.plantBeep();
  }

  function detonateBomb() {
    match.bomb.state = 'detonated';
    if (bombMesh) bombMesh.visible = false;
    audio.explosion();
    hud.shake(1);
    hud.setBomb('detonated', 0, match.bomb.site);
    endRound('atk', 'Spike detonated at Site ' + match.bomb.site);
  }

  function defuseBomb(by) {
    match.bomb.state = 'defused';
    if (bombMesh) bombMesh.visible = false;
    hud.setBomb('defused', 0, match.bomb.site);
    endRound('def', 'Spike defused by ' + by.name);
  }

  function dropBomb(position) {
    match.bomb.state = 'dropped';
    match.bomb.carrier = null;
    match.bomb.position.copy(position);
    match.bomb.position.y = 0.1;
    if (!bombMesh) {
      bombMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.32, 0.36),
        new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.4, metalness: 0.5, emissive: 0x552200 }),
      );
      ctx.scene.add(bombMesh);
    }
    bombMesh.visible = true;
    bombMesh.position.copy(match.bomb.position);
    hud.setBomb('dropped', 0, null);
  }

  function pickupBomb(fighter) {
    match.bomb.state = 'carried';
    match.bomb.carrier = fighter;
    if (bombMesh) bombMesh.visible = false;
    hud.setBomb('carried', 0, null);
  }

  function applyDamage(target, amount, part, attacker, weaponName) {
    if (!target.alive) return;
    const died = target.kind === 'player'
      ? ctx.playerDamage(amount)
      : ctx.botDamage(target, amount);
    if (died) {
      if (attacker) {
        attacker.money = (attacker.money || 0) + KILL_REWARD;
        if (attacker.kind === 'player') {
          attacker.kills += 1;
          hud.setMoney(attacker.money);
        }
      }
      hud.killfeed(attacker ? attacker.name : '—', target.name, weaponName, part === 'head');
      if (target === match.bomb.carrier) dropBomb(target.position);
      if (target.kind === 'player') {
        hud.showOverlay('dead', { scoreAtk: match.score.atk, scoreDef: match.score.def, round: match.round });
        if (document.pointerLockElement) document.exitPointerLock();
      }
    } else if (target.kind === 'player') {
      hud.damageFlash();
      audio.hurt();
    }
  }

  function handleEvents(events) {
    for (const event of events) {
      if (event.type === 'damage') {
        applyDamage(event.target, event.amount, event.part, event.attacker, event.weapon);
      } else if (event.type === 'planted') {
        if (match.phase === 'live' && match.bomb.state !== 'planted') plantBomb(event.site, event.by);
      } else if (event.type === 'defused') {
        if (match.phase === 'live' && match.bomb.state === 'planted') defuseBomb(event.by);
      }
    }
  }

  function playerPlant(dt, keys) {
    if (match.phase !== 'live' || match.bomb.state !== 'carried' || match.bomb.carrier !== player.fighter) {
      match.plantProgress = 0;
      return;
    }
    const site = SITES[match.attackSite];
    const pos = player.fighter.position;
    const inSite = pos.x >= site.minX && pos.x <= site.maxX && pos.z >= site.minZ && pos.z <= site.maxZ;
    if (inSite && keys.has('KeyE')) {
      match.plantProgress += dt;
      hud.setPlant(match.plantProgress / 3, 'PLANTING SPIKE');
      if (Math.floor(match.plantProgress * 2) !== Math.floor((match.plantProgress - dt) * 2)) audio.plantBeep();
      if (match.plantProgress >= 3) {
        match.plantProgress = 0;
        hud.setPlant(0, '');
        plantBomb(match.attackSite, player.fighter);
      }
    } else {
      match.plantProgress = 0;
      hud.setPlant(0, '');
    }
  }

  function step(dt, input, time) {
    if (match.phase === 'menu' || match.phase === 'matchEnd') return;
    if (match.phase === 'buy') {
      match.buyLeft -= dt;
      hud.setTimer(Math.ceil(match.buyLeft), true);
      if (match.buyLeft <= 0) beginLive();
      return;
    }
    if (match.phase === 'roundEnd') {
      match.roundEndLeft -= dt;
      if (match.roundEndLeft <= 0) {
        if (match.score.atk >= WIN_ROUNDS || match.score.def >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
          endMatch(match.score.atk > match.score.def ? 'atk' : 'def');
        } else {
          startRound();
        }
      }
      return;
    }
    // Live round.
    match.roundLeft -= dt;
    hud.setTimer(Math.max(0, Math.ceil(match.roundLeft)), false);
    if (match.bomb.state === 'planted') {
      match.bomb.timer -= dt;
      hud.setBomb('planted', Math.max(0, match.bomb.timer), match.bomb.site);
      if (match.bomb.timer <= 10 && match.bomb.timer > 0 && Math.floor(match.bomb.timer) !== Math.floor(match.bomb.timer + dt)) {
        audio.plantBeep();
      }
      if (match.bomb.timer <= 0) {
        detonateBomb();
        return;
      }
    }
    playerPlant(dt, input.state.keys);
    // Bomb pickup: any living attacker walking over a dropped spike takes it.
    if (match.bomb.state === 'dropped') {
      for (const fighter of fighters) {
        if (fighter.team === 'atk' && fighter.alive && fighter.position.distanceTo(match.bomb.position) < 1.2) {
          pickupBomb(fighter);
          const carrierBot = allies.find((b) => b.fighter === fighter);
          if (carrierBot) carrierBot.bot.carrier = true;
          hud.banner('SPIKE RECOVERED', fighter.name + ' carries the spike');
          break;
        }
      }
    }
    // Win checks.
    const atkAlive = aliveCount('atk');
    const defAlive = aliveCount('def');
    hud.setAlive(atkAlive, defAlive);
    if (match.bomb.state !== 'planted') {
      if (atkAlive === 0) {
        endRound('def', 'Attackers eliminated');
        return;
      }
      if (defAlive === 0) {
        endRound('atk', 'Defenders eliminated');
        return;
      }
    } else if (defAlive === 0) {
      endRound('atk', 'Defenders eliminated — spike stands');
      return;
    }
    if (match.roundLeft <= 0) {
      endRound('def', 'Time expired — spike never planted');
    }
  }

  function buyWeapon(id) {
    if (match.phase !== 'buy') return false;
    const def = WEAPONS[id];
    if (!def || def.price === 0) return false;
    if (player.fighter.money < def.price) {
      audio.denied();
      return false;
    }
    player.fighter.money -= def.price;
    player.weapons.equip(id);
    hud.setMoney(player.fighter.money);
    hud.setAmmo(player.weapons.state.mag, player.weapons.state.reserve, def.name);
    hud.showBuy(player.fighter.money);
    audio.buy();
    return true;
  }

  function buyGrenade() {
    if (match.phase !== 'buy') return false;
    if (player.fighter.money < GRENADE_PRICE || player.fighter.grenades >= 2) {
      audio.denied();
      return false;
    }
    player.fighter.money -= GRENADE_PRICE;
    player.fighter.grenades += 1;
    hud.setMoney(player.fighter.money);
    hud.setGrenades(player.fighter.grenades);
    hud.showBuy(player.fighter.money);
    audio.buy();
    return true;
  }

  return {
    match,
    fighters,
    startMatch,
    startRound,
    endRound,
    endMatch,
    step,
    handleEvents,
    buyWeapon,
    buyGrenade,
    applyDamage,
    aliveCount,
    plantBomb,
    dropBomb,
    pickupBomb,
  };
}
