# BREACHLINE

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/ZulkifliMohamad/breachline-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/ZulkifliMohamad/breachline-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS in the browser, built on three.js 0.187.0. Two teams fight over Depot 9, a freight yard at dusk: attackers plant the spike at Site A or Site B, defenders hold the sites or defuse it. Short rounds, money between rounds, a buy menu, and gunfire where stopping to aim pays.

## The game

- **Rounds that matter.** First to 5 rounds takes the match (max 9). A round ends on elimination, detonation, defusal, or the clock.
- **The spike.** The attacking team carries a spike. Hold E inside a site to plant it; it blows 35 seconds later unless a defender holds E beside it for 5 seconds to defuse.
- **Money and buying.** Kills pay $300, round wins $3,250, losses $1,900 plus a streak bonus. Spend it in the buy phase (B): VK-47 rifle, KX-9 SMG, RAIL-7 marksman rifle, FRAG-1 grenades.
- **Gunplay.** Hitscan fire with headshot multipliers, recoil and bloom that punish firing on the move, spread that tightens when you aim down sights or crouch, and AABB collision with the map.
- **Bots that play.** Six AI fighters navigate a waypoint graph, hold sites, push lanes, react to what they see and hear, strafe while firing, and plant or defuse the spike.
- **The map.** Depot 9: three lanes, a mid warehouse with two doors, container stacks at both sites, and a dusk palette with warm hazard light.
- **HUD.** Health, ammo, money, round timer, score, alive counts, kill feed, a live minimap, and a bomb status line. Sounds are synthesised in WebAudio — no audio files, no network requests.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no dependencies. Any static file server works; `game/index.html` is the entry point. Requires a desktop browser with WebGL 2.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click the game to capture the pointer) |
| Left click | Fire |
| Right click | Aim down sights |
| R | Reload |
| G | Throw grenade |
| E (hold) | Plant the spike inside a site |
| B | Buy menu (buy phase) |
| 1 / 2 / 3 / 4 | Buy rifle / SMG / marksman / grenade |
| Shift | Sprint |
| Ctrl / C | Crouch |
| M | Mute |
| Esc | Pause |

## Layout

```
game/            the playable game, static ES modules
  index.html     page, import map, DOM HUD
  src/           one module per job (world, bots, combat, match, HUD, …)
  vendor/three/  three.js 0.187.0, vendored byte for byte
screenshots/     3 captures of the game running in a browser
main.ts          entrypoint: copies game/ + screenshots/ to /output, writes dossier.json
serve.ts         local static server for play-testing
vendor/          the kit's makefun-threejs.ts, unchanged
```

## Screenshot staging

The game honours `?shot=start|play|end&seed=N`: it stages a deterministic frame (menu, mid-round, match end), renders it twice, and sets `window.__shotReady`. That is how `screenshots/` was captured, with headless Chrome.

---

<sub>Entered on [make.fun](https://make.fun/?ref=6ksyay6h&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
