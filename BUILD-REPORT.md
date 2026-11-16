# BUILD REPORT — BREACHLINE (make.fun threejs-fps-02)

Entry: "Make the best three.js tactical FPS", $1,000, deadline 2026-11-16T21:30:00Z.
Account: @steady-koala-56, payout wallet `4o4WqB3G7im2t3Y1FFzaeeKFJ9zVtWQHNy3HY6gQArwo`.
GitHub owner for the entry repo: `ZulkifliMohamad`. Repo name intended: `breachline-fps`.
Local git HEAD at time of writing: `81dea911342be31ae0d870462c5c4914628a630e` (code commit;
this report is committed on top of it — see `git log` for the final SHA).

## What was built

BREACHLINE — a complete, original, round-based tactical FPS on three.js 0.187.0,
set on "Depot 9", a freight yard at dusk. No build step, no network requests,
all sounds synthesised in WebAudio.

- Rounds: first to 5 (max 9), 100 s round timer, 12 s buy phase. A round ends on
  elimination, spike detonation, defusal, or the clock.
- Objective: the attacking team (player + 2 AI teammates) carries a spike; hold E
  inside Site A or Site B to plant (3 s); it blows after 35 s unless a defender
  holds E beside it for 5 s to defuse. The spike drops when its carrier dies and
  can be picked up by any living attacker.
- Economy: $800 start, $300 per kill, $3,250 round win, $1,900 loss plus a streak
  bonus. Buy menu (B or keys 1–4) sells the VK-47 rifle ($2,700), KX-9 SMG
  ($1,500), RAIL-7 marksman rifle ($3,800) and FRAG-1 grenades ($300, max 2).
- Gunplay: hitscan with headshot multipliers, recoil and bloom that punish firing
  on the move, spread tightened by aiming down sights or crouching, AABB collision,
  sprint, crouch, jump, tracers, muzzle flash, hitmarkers.
- Bots: 6 AI fighters on a 26-node waypoint graph (BFS routing). Defenders hold
  sites, attackers push lanes, bots see with line of sight + reaction delay, hear
  nearby gunfire, strafe while firing, plant/defuse, and recover a dropped spike.
- HUD: health, ammo, money, round timer, score, alive counts, kill feed, live
  2D minimap (teammates, bomb, enemies seen/heard recently), bomb status, plant
  progress, buy menu, round/match banners and overlays.
- Fixed 60 Hz simulation decoupled from rendering; one module per job
  (`world`, `mover`, `player`, `weapons`, `bots`, `combat`, `game`, `hud`,
  `input`, `audio`, `palette`, `rng`); no per-frame allocation in the bot loop.

## Files

```
LICENSE                     MIT (SPDX-License-Identifier: MIT)
README.md                   entry README with make.fun badges (owner ZulkifliMohamad)
.makefun/owner.json         {"wallet": "4o4WqB3G7im2t3Y1FFzaeeKFJ9zVtWQHNy3HY6gQArwo"}
main.ts                     entrypoint: copies game/ + screenshots/ to /output, writes dossier.json
serve.ts                    local static server (node serve.ts, http://localhost:8080)
shots.json                  screenshot staging queries (?shot=start|play|end&seed=1)
vendor/makefun-threejs.ts   kit copy, unchanged (sha256 matches kit.json)
game/index.html             page, import map ("three" -> ./vendor/three/three.module.min.js), DOM HUD
game/src/*.js               13 modules, 107,054 bytes total (dossier text 108,646 bytes, cap 163,840)
game/vendor/three/          three.js 0.187.0, byte for byte (sha256 matches kit.json)
screenshots/1-start.jpg     1,280x720, 35,677 bytes — menu over the yard at dusk
screenshots/2-play.jpg     1,280x720, 31,315 bytes — mid-round, rifle, enemy in crosshair, hitmarker
screenshots/3-end.jpg      1,280x720, 30,007 bytes — MATCH WON overlay
BUILD-REPORT.md             this file
```

Screenshots are real renders of the game's own code, taken with headless
Chrome for Testing 157 via CDP, waiting for the game's `window.__shotReady`
staging flag; each was inspected visually. One bug was found and fixed during
capture (`createBot` did not expose `body`, which crashed the play staging);
the final captures are from the fixed code. Two visual fixes were also made
(brighter dusk lighting, smaller view model).

## Check results (honest)

- `node --check` on every `game/src/*.js`, `main.ts`, `serve.ts`: all parse.
- `MAKEFUN_OUTPUT_DIR=/tmp/out-test node main.ts`: exit 0. Dossier written,
  241,575 bytes; dossier text 108,646 bytes (under the 163,840 cap, nothing cut);
  3 images; game/ 16 files, 2,240,761 bytes (gate caps: 993 files, 48 MiB).
- Kit check (`node cli/makefun.mjs check --kit . --repo <dir> --worktree`,
  run 2026-11-16 ~08:35 UTC): **4 passed, 1 failed, 14 skipped, 5 checked at
  submission.** Passed: `competition_open`, `snapshot` (26 files, 2,402,803
  bytes), `license_osi` (MIT), `entrypoint` (main.ts, node22). Failed:
  `transcripts_present` — no transcript bundle was uploaded. The 5
  at-submission items (`repo_public`, `repo_owner`, `repo_created_after_open`,
  `commit_in_repo`, `duplicate_snapshot`) can only be checked once the GitHub
  repo exists and the entry is submitted. There is no local grade for this
  bounty; the server grades every entry.
- Transcript bundle: attempted twice (dry-run, then real run with
  `--no-family --muse-usage`). Both found the right sessions (mine
  `a6e21d8a…` + parent `62b8f4f1…`; `--no-family` correctly drops the two
  sibling sessions that built other entries, `best-game-01` and
  `ai-excited-01`). No bundle was written. See blockers below.

## What still blocks submission

1. **Transcript bundle (the only failing check).** It must be run from the
   top-level agent (agent `974a38f8…`), after all subagents finish, because:
   - The run record is missing the prompt: the earliest session opens with no
     message of the person's in words. The top-level agent must supply
     `--prompt-file` with Feb's exact opening words that started this build,
     plus `--prompt-origin handed-off` and `--prompt-via` naming what started it.
     (Never a summary or a hand-off brief.)
   - The run record is missing the harness version (`--harness-version`). No
     harness version for the Muse app is recorded in any session file or on
     this machine; the top-level agent must supply the real value.
   - `--muse-usage` must be re-queried after this subagent's run completes: a
     subagent's usage rows are written only once its run ends, so the prepared
     file `~/workspace/makefun/muse-usage.jsonl` (19 rows, verified unique)
     holds only the parent's and the top-level agent's rows, none of mine.
     Re-run the SELECT from `bundle --help` with all three agent ids
     (`a6e21d8a…`, `62b8f4f1…`, `974a38f8…`) and pass the refreshed file.
   - Suggested command (from inside the unpacked kit, after the repo is pushed):
     `node cli/makefun.mjs bundle --repo <repo> --out transcripts.tar.gz --system-prompt /tmp/system-prompt.txt --effort default --harness muse --harness-version <real version> --provider meta --model <model id> --mcp none --muse-usage <refreshed file> --no-family --prompt-file <file> --prompt-origin handed-off --prompt-via "<what started it>"`
     then `node cli/makefun.mjs check --kit . --repo <repo> --transcripts transcripts.tar.gz`.
   - Model discrepancy to resolve when declaring `--model`/`--provider`: the
     runtime presents the model as Muse Spark 1.3, but `muse.db`
     (`agent.agents` / `agent_message_token_usage`) records every agent's model
     as `ipnext/avocado-5.17-v4`. The usage rows carry that id; whether
     make.fun's pricer knows it is untested. Do not guess — declare the id the
     provider's response carries.
   - System prompt: `/tmp/system-prompt.txt` holds one line,
     `withheld: the provider does not share the system prompt text with the agent`.
     The dry-run also noted the system prompt is "in-session" (a session
     carries it), so the withheld file may not be needed.
2. **GitHub repo (not created — by design).** The parent creates
   `ZulkifliMohamad/breachline-fps` (public, created after 2026-11-14T21:30:00Z),
   pushes the local commits, and sets the repo About (website
   `https://make.fun/bounty/threejs-fps-02`, topics `makefun,ai-agents,bounties,games`).
   `.makefun/owner.json` is already committed, so the claim-file path is covered.
3. **Submit before 2026-11-16T21:30:00Z** with the entry signature:
   `node cli/makefun.mjs submit --competition threejs-fps-02 --repo-url https://github.com/ZulkifliMohamad/breachline-fps --commit <final sha> --title "BREACHLINE — tactical FPS" --bundle transcripts.tar.gz --keypair <wallet keypair file>`.
   The signing wallet must be on the @steady-koala-56 account (register already
   did this; the API key in `~/.makefun/credentials` is valid to 2026-12-16).
   Nothing has been submitted. No secrets were printed or stored in the repo.
