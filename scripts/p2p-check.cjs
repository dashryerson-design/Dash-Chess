// Real-network P2P check: two independent browsers discover each other through the public Nostr
// relays, exchange a friend request, then play an online game. Run in CI (open internet).
// Usage: node scripts/p2p-check.cjs http://localhost:4173/Dash-Chess
const { chromium } = require('playwright');
const B = process.argv[2] || 'http://localhost:4173/Dash-Chess';
const out = process.env.OUT_DIR || '.';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function reg(p, name) {
  await p.goto(B + '/');
  await p.waitForSelector('#u', { timeout: 30000 });
  await p.fill('#u', name);
  await p.click('button:has-text("Play now")');
  await p.waitForSelector('text=Ready for your', { timeout: 30000 });
}
async function status(p) {
  return p.evaluate(async () => {
    const t = document.querySelector('[aria-label="Online lobby status"]');
    return t ? t.textContent : 'no chip';
  });
}
(async () => {
  const browser = await chromium.launch();
  const a = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const b = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  for (const [n, p] of [['A', a], ['B', b]]) {
    p.on('pageerror', (e) => log(n, 'pageerror', e.message));
    p.on('console', (m) => /p2p|trystero|error/i.test(m.text()) && !/WebSocket connection/.test(m.text()) && log(n, 'console', m.text().slice(0, 200)));
  }
  const sfx = String(Date.now()).slice(-5);
  const nameA = 'ciA' + sfx, nameB = 'ciB' + sfx;
  await reg(a, nameA);
  await reg(b, nameB);
  let ok = false;
  for (let i = 0; i < 60; i++) {
    const [sa, sb] = [await status(a), await status(b)];
    if (i % 5 === 0) log('lobby', sa, '|', sb);
    if (/[2-9] online|\d\d online/.test(sa) && /[2-9] online|\d\d online/.test(sb)) {
      ok = true;
      break;
    }
    await a.waitForTimeout(2000);
  }
  await a.screenshot({ path: `${out}/a-lobby.png` });
  if (!ok) {
    log('FAIL: players never saw each other');
    process.exit(1);
  }
  log('PASS discovery');

  // friend request A -> B via search
  await a.goto(B + '/friends');
  await a.fill('input[placeholder="Search players by username"]', nameB.slice(0, 5));
  await a.waitForTimeout(2500);
  log('search results:', JSON.stringify(await a.$$eval('.list.inset .list-item', (els) => els.map((e) => e.textContent))));
  await a.screenshot({ path: `${out}/a-search.png` });
  await a.click('.list-item:has-text("' + nameB + '") button:has-text("Add")');
  await b.goto(B + '/friends');
  await b.waitForSelector('text=Requests', { timeout: 30000 });
  await b.click('button:has-text("Accept")');
  await a.waitForTimeout(3000);
  log('PASS friend request');

  // online game via Quick Play
  for (const p of [a, b]) {
    await p.goto(B + '/play?mode=quick');
    await p.click('button:has-text("Find a game")');
  }
  await Promise.all([a.waitForURL(/\/game\//, { timeout: 60000 }), b.waitForURL(/\/game\//, { timeout: 60000 })]);
  log('PASS matched', a.url() === b.url());
  await a.waitForSelector('.board2d-squares');
  await b.waitForSelector('.board2d-squares');
  await a.waitForTimeout(2000);
  const aWhite = await a.evaluate(() => document.querySelectorAll('.player-bar')[1].innerHTML.includes('rgb(238, 238, 238)'));
  const W = aWhite ? a : b, K = aWhite ? b : a;
  const move = async (p, from, to, orient) => {
    const box = await (await p.$('.board2d-squares')).boundingBox();
    const s = box.width / 8;
    const c = (sq) => {
      const f = sq.charCodeAt(0) - 97, r = Number(sq[1]) - 1;
      const x = orient === 'w' ? f : 7 - f, y = orient === 'w' ? 7 - r : r;
      return { x: box.x + (x + 0.5) * s, y: box.y + (y + 0.5) * s };
    };
    await p.mouse.click(c(from).x, c(from).y);
    await p.mouse.click(c(to).x, c(to).y);
  };
  const line = [['e2', 'e4', W, 'w'], ['e7', 'e5', K, 'b'], ['g1', 'f3', W, 'w'], ['b8', 'c6', K, 'b']];
  for (let i = 0; i < line.length; i++) {
    const [f, t, p, o] = line[i];
    await move(p, f, t, o);
    const other = p === W ? K : W;
    await other.waitForFunction((n) => document.querySelectorAll('.move-cell').length >= n, i + 1, { timeout: 30000 });
  }
  log('PASS moves synced');
  await W.screenshot({ path: `${out}/white.png` });
  await K.screenshot({ path: `${out}/black.png` });
  await K.click('button:has-text("Abort"), button:has-text("Resign")');
  await K.click('.modal button:has-text("Resign")').catch(() => {});
  await W.waitForSelector('.modal', { timeout: 30000 });
  log('PASS game ended');
  await browser.close();
})().catch(async (e) => {
  log('FAIL', e.message);
  process.exit(1);
});
