# DC Chess (Dash Chess)

A competitive online chess platform: 2D and 3D boards, 20 Stockfish-powered bots with distinct personalities, real-time online play (ranked, casual, private rooms, friends and parties), an engine-powered move-rating system, DC Rating divisions, XP/levels, DC Points, a cosmetic shop, achievements, challenges, puzzles, training, an opening explorer, replays and post-game analysis.

Everything is free and self-hostable. No paid services, APIs or real-money purchases.

---

## Quick start

Requirements: **Node.js 20+** (tested on 22). Nothing else: the database (SQLite) and the chess engine (Stockfish 18 WASM) are bundled npm packages.

```bash
npm install
```

```bash
npm run setup
```

`setup` copies the browser engine into the client and generates the puzzle set if missing (a puzzle set is already included in `data/puzzles.json`).

### Development

```bash
npm run dev
```

- Client (Vite, hot reload): http://localhost:5173
- API + realtime server: http://localhost:3001 (proxied by Vite)

### Production

```bash
npm run build
```

```bash
NODE_ENV=production npm start
```

The server serves the built client and the API on one port (default `3001`). Put it behind any reverse proxy (Caddy, nginx) for HTTPS, and set `COOKIE_SECURE=1` and `TRUST_PROXY=1` when you do.

### Tests

```bash
npm test
```

45 automated tests: rating maths, divisions, progression, the move-classification rules, every chess rule on the authoritative game room (castling, en passant, promotion, checkmate, stalemate, repetition, fifty-move, insufficient material, clocks, draws, takebacks, resign/abort), plus a full server integration test with real Socket.IO clients (matchmaking, ranked rating updates, cheating attempts, spectators, disconnect/reconnect/abandon, reward pipeline and anti-farming, shop and equip validation, friends, parties, private rooms, bot games).

Other tools:

```bash
npm run calibrate
```

Plays a bot-vs-bot tournament with the real bot move selector and prints scores and style metrics.

```bash
npm run puzzles
```

Regenerates `data/puzzles.json` from engine self-play (about 6 minutes).

---

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `3001` / `0.0.0.0` | Listen address |
| `DB_PATH` | `data/dc-chess.db` | SQLite database file |
| `STOCKFISH_PATH` | (bundled WASM) | Path to a native Stockfish binary. Roughly 5-10x faster; recommended for busy servers |
| `BOT_ENGINES` / `ANALYSIS_ENGINES` | `2` / `2` | Engine processes for bot moves and for move analysis |
| `ANALYSIS_DEPTH` | `12` | Fixed analysis depth (higher = slower, more precise ratings) |
| `NODE_ENV` | | `production` enables the same-network ranked restriction |
| `BLOCK_SAME_IP_RANKED` | on in production | Two accounts on one IP cannot play ranked against each other |
| `COOKIE_SECURE` | off | Set to `1` when served over HTTPS |
| `TRUST_PROXY` | off | Set to `1` behind a reverse proxy (uses `X-Forwarded-For`) |
| `DISCONNECT_FORFEIT_MS` | `60000` | How long a disconnected player has to return |
| `FIRST_MOVE_ABORT_MS` | `30000` | Games abort if a player never makes a first move |
| `CORS_ORIGIN` | | Only needed if the client is hosted on a different origin |

---

## Architecture

```
shared/   TypeScript used by both sides: rating, divisions, progression, rewards economy,
          move classification, bot roster, cosmetics catalogue, achievements, challenges, protocol types
server/   Fastify (REST) + Socket.IO (realtime) + better-sqlite3 + Stockfish process pool
client/   React + Vite. 2D SVG board (no WebGL), 3D three.js board (lazy-loaded chunk), Zustand stores
scripts/  dev runner, engine copy, puzzle generator, bot calibration
data/     SQLite DB, CC0 opening names (lichess-org/chess-openings), generated puzzles
tests/    Vitest unit + integration tests
```

**Why these choices.** SQLite needs no external service and handles a self-hosted community comfortably (WAL mode). Socket.IO gives reconnection and acknowledgements out of the box. chess.js is a proven rules library. Stockfish runs as UCI child processes: the bundled WASM build works everywhere, and a native binary can be configured for speed. The 2D board is plain SVG/CSS, so 2D mode never downloads three.js (the 3D renderer is a separate 514 KB chunk).

### Trust model (server-authoritative)

The browser is never trusted for anything competitive:

- **Moves**: validated by chess.js in the server `GameRoom`. Illegal, malformed, out-of-turn or opponent-piece moves are rejected.
- **Clocks**: kept on the server (start after both first moves, increments, flag timers, timeout vs insufficient material = draw).
- **Results**: checkmate, stalemate, threefold, fifty-move, insufficient material, resignation, agreement, timeout, abandonment and abort are all decided on the server.
- **Bot moves**: computed on the server, so a client cannot weaken a bot.
- **Ratings, XP, DC Points, achievements, challenges, purchases**: computed in server transactions. Move-quality points come from the server's own Stockfish analysis, never from client data.
- Sessions use random 256-bit tokens (stored hashed) in `HttpOnly; SameSite=Lax` cookies; passwords use scrypt. State-changing API calls require a custom header (CSRF defence in depth). Auth and purchase endpoints are rate-limited, and every socket has a token-bucket limiter.

### Move classification

`shared/src/classification.ts` + `server/src/engine/analyzer.ts`

For each move the server runs, at a **fixed depth with a cleared hash** (so results are deterministic):
1. a MultiPV-3 search of the position before the move;
2. a `searchmoves` search of the played move if it is not among the top lines (same depth, directly comparable);
3. a shallow depth-6 search (difficulty and engine-stability signal).

Scores are converted to **expected score (win probability)**, so the same centipawn loss matters less in decided positions than in balanced ones. Classes come from expected-score loss (Good ≤ 2%, Decent ≤ 5%, Okay ≤ 10%, Bad ≤ 20%, otherwise Blunder; thresholds widen by 25% when shallow and deep evaluations disagree). On top of that:

- **Forced moves** are Good and earn no points.
- **Obvious recaptures**, trivial check evasions and mate-in-one cannot be Great or Incredible.
- **Great**: the best move, and the alternatives are at least 15% expected score worse (an "only move"), in a position that was not already comfortably won; or a defensive resource that saves a lost position.
- **Incredible** (rare): an engine-best **sacrifice** (material given up along the principal variation, or a piece deliberately left en prise) that keeps a good position; or a hard-to-find only move that a shallow search misses, with a large margin.
- **Missed short mates** downgrade a move to Okay.

Analysis results are cached in memory and in SQLite. Live ratings stream to the player during bot and casual games when move assistance is on. In ranked games they are shown only after the game (live engine feedback would leak information). The authoritative full-game analysis runs when the game ends, and rewards are computed from it.

### Bots

`shared/src/bots.ts` + `server/src/engine/botPlayer.ts`

Every bot uses Stockfish. Strength comes from the search budget, the candidate window (MultiPV + tolerance), the selection temperature and an explicit human-like error model (mistake rate/window, "plausible blunder" rate). Personality comes from style weights scored on real move features (pressure on the enemy king, king safety, trades, checks, offered material, pawn storms, centralisation, quiet moves) plus special behaviours:

- **Trapper** searches the opponent's replies for natural-looking captures and checks that lose.
- **Counterpuncher** switches to exact play once you slip.
- **Endgame Expert** searches about 12x deeper in endgames.
- **Calculator** searches about 4x deeper in tactical positions.
- **The Grinder** avoids repetitions and refuses draws.

Bots accept or decline draws from their own evaluation, and strong bots resign hopeless positions. The DC Champion plays at full strength with a 1.5M-node budget per move (capped by the clock). Calibration results are in `docs/STATUS.md`.

### Anti-farming economy

Bounded rewards:
- No XP, points or achievements for games where you made fewer than 8 moves.
- Move-quality points are capped per game, scaled by bot tier, and forfeited when you use hints or takebacks.
- Repeat wins against the same bot or opponent on the same day pay progressively less.
- Bots far below your rating pay little; shared-IP opponents pay half.
- There is a daily soft cap on gameplay points.
- Ranked rating only changes for the first 3 rated games per pair per day, and you cannot play yourself.
- Puzzle rewards count only on the first attempt.

All values live in `REWARDS` in `shared/src/progression.ts`.

### Cosmetics are personal

Each client renders the position with **its own** equipped piece set, board, environment, effects, sounds and UI theme. Only the position itself is shared.

---

## Feature map

| Area | Where |
|---|---|
| Hub, navigation, notifications, XP bar, rating, points | `client/src/screens/Hub.tsx`, `components/Shell.tsx` |
| Online play (Quick Play, Ranked, Casual, private rooms, friend challenges), local pass-and-play | `screens/Play.tsx`, `screens/LocalGame.tsx`, `server/src/matchmaking.ts`, `server/src/social.ts` |
| Match screen (clocks, captured pieces, premoves, draw/takeback/hint/resign/abort, live ratings, spectating, rematch) | `screens/Game.tsx`, `server/src/game/room.ts` |
| Results, review, replays, sharing, engine exploration, eval graph | `components/ResultsModal.tsx`, `screens/Analysis.tsx` |
| 2D board | `client/src/board/Board2D.tsx` |
| 3D board (lathe pieces, materials, environments, shadows, camera presets, effects) | `client/src/board/three/*` |
| 20 bots | `screens/Bots.tsx`, `server/src/engine/botPlayer.ts` |
| DC Rating, divisions, placement, seasons, rating history | `screens/Rankings.tsx`, `server/src/game/finish.ts` |
| Leaderboards (global, per category, level, season) | `screens/Leaderboards.tsx` |
| Profile and statistics, match history | `screens/Profile.tsx`, `screens/History.tsx` |
| Customisation and shop (10 categories, 5 rarities, previews in 2D and 3D) | `screens/Customise.tsx`, `screens/Shop.tsx`, `client/src/cosmetics/*` |
| Levels, achievements, daily and weekly challenges | `screens/Progression.tsx` |
| Friends and parties | `screens/Friends.tsx` |
| Puzzles (daily + rated), training drills, opening explorer, watch live | `screens/Puzzles.tsx`, `Training.tsx`, `Explorer.tsx`, `Watch.tsx` |
| Settings (graphics with device recommendation, gameplay, audio, interface, account) | `screens/Settings.tsx` |

## Licences and credits

- Stockfish 18 (stockfish.js by Nathan Rugg / Chess.com) is **GPLv3**. It runs as a separate process on the server and as a separate worker file in the browser. If you distribute DC Chess, comply with the GPL for the engine files.
- Opening names: lichess-org/chess-openings, **CC0**.
- chess.js (BSD-2), three.js (MIT), React (MIT), Socket.IO (MIT), Fastify (MIT), better-sqlite3 (MIT), lucide icons (ISC), Inter and Chakra Petch fonts (OFL).
- All piece sets, boards, icons, calling cards and sounds are original and generated in code.
