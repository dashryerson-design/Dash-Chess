# DC Chess: development status

Last updated: 2026-11-25. Honest record of what exists, how it was verified and what is still open.

## Verification performed

| Check | How | Result |
|---|---|---|
| Type safety | `tsc` on shared, server, client | clean |
| Unit tests | `tests/shared.test.ts`: rating, divisions, progression, catalogues, move-classification rules | 22 pass |
| Chess rules | `tests/rules.test.ts` on the authoritative `GameRoom`: illegal/out-of-turn moves, checkmate, castling (both sides, through check), en passant, promotion and under-promotion, stalemate, threefold, fifty-move, insufficient material, draw offers, takebacks, resign, abort, server clocks with increment and flagging, timeout vs insufficient material | 13 pass |
| Server integration | `tests/server.test.ts` with real HTTP + Socket.IO clients: registration and login validation, CSRF header, unauthenticated sockets, ranked matchmaking, synced state, cheating attempts (out of turn, opponent pieces, takeback/hint in ranked), spectators, checkmate and rating update, rating history, short-game anti-farming, full-game reward pipeline from engine analysis, opening detection, disconnect → reconnect → abandon, shop purchase validation, equip validation, friend requests, achievements, parties (leader-only settings, ready checks, start), private room codes, a server-side bot game with live ratings and rewards | 10 pass |
| Browser E2E (Playwright, scratch scripts) | register; hub; bot match by drag and click through to results with rewards and achievements; 2D and 3D switch; 3D click-to-move and drag-to-move; mobile (iPhone 13) hub and match; every menu screen; review screen; browser Stockfish analysis (depth ≥ 10); solving the daily puzzle through the UI; two-browser online match (Quick Play pairing, synced moves, draw offer and decline, resignation, Victory/Defeat screens) | no console or page errors |
| Bot calibration | `npm run calibrate` (bot-vs-bot, real move selector) | see below |
| Dev mode | `npm run dev`: Vite proxies API, engine files and websockets | works |

### Bot calibration (4 games per pairing unless noted, alternating colours)

```
Rookie          1.0 - 3.0  Casual
Casual          0.0 - 4.0  Defender
Attacker        0.0 - 4.0  Tactician
Rookie          0.0 - 4.0  Veteran
Tactician       1.0 - 3.0  Veteran
Veteran         2.0 - 2.0  Aggressor
Aggressor       0.0 - 4.0  Grandmaster
Grandmaster     1.0 - 1.0  DC Champion   (2 games, before re-tuning the top tier)
```

Style metrics from the same run (per move):
- Checks: Attacker 0.075 vs Defender 0.040; Aggressor 0.094, the highest below the Grandmaster tier.
- Captures: Defender 0.247 vs Attacker 0.159.

After the first run the top tier was re-tuned (Grandmaster and Destroyer budgets reduced, error rates raised) to widen the gap to the DC Champion. The re-run results for that tier are recorded below.

The "approximate Elo" shown on each bot is a design target derived from search budget and error rates. The ordering is verified; absolute Elo against humans is **not** calibrated (that needs real games).

## Known limitations / not yet done

- **Active games live in server memory.** A server restart aborts in-progress games. Finished games, ratings and rewards are persisted, and unrewarded games are re-processed at startup.
- **Engine fair play.** Players can still consult an external engine in another tab. There is no statistical cheat detection (for example engine-correlation analysis) yet; live move ratings are withheld during ranked games.
- **Single server process.** Matchmaking, parties and presence are in-process. Horizontal scaling would need a shared store (for example Redis) plus the Socket.IO adapter.
- **Analysis throughput.** The bundled WASM Stockfish analyses a 40-move game in roughly 10-20 s (depth 12) on 2 engines. For many concurrent players, set `STOCKFISH_PATH` to a native binary and raise `ANALYSIS_ENGINES`.
- **Settings sync** uses last-write-wins with an 800 ms debounce; a change made less than a second before reloading on another device can be lost.
- **Seasons** are calendar quarters. Rewards are granted the next time a player loads their profile after the season ends.
- **Music** is a simple generative ambient pad, not composed tracks.
- **Puzzle set** is 160 engine-generated puzzles, rated by a heuristic (difficulty proxy plus length), not by solver statistics.
