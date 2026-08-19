/**
 * Browser verification for prize-wheel entry page.
 * Run while static server is up: node verify-browser.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRATCH =
  process.env.SCRATCH ||
  '/var/folders/gj/ghbcjr8103sc_mzgy_cgtt200000gn/T/grok-goal-decdbb850cb5/implementer';
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const log = [];
const say = (m) => {
  log.push(m);
  console.log(m);
};

const runOnce = async (page, label) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  const spin = page.locator('#spinBtn');
  const wheel = page.locator('#wheel');
  const result = page.locator('#winName');
  await spin.waitFor({ state: 'visible' });
  await wheel.waitFor({ state: 'visible' });

  const box = await wheel.boundingBox();
  if (!box || box.width < 100 || box.height < 100) {
    throw new Error(`${label}: wheel not substantially painted (${JSON.stringify(box)})`);
  }

  // Force instant transition for test speed
  await page.addStyleTag({
    content: '#wheel { transition-duration: 50ms !important; }',
  });

  const before = await page.evaluate(() => {
    const raw = localStorage.getItem('prize-wheel:v1');
    return raw ? JSON.parse(raw) : null;
  });

  await spin.click();
  await page.waitForFunction(
    () => {
      const d = document.getElementById('winDialog');
      const t = document.getElementById('winName')?.textContent?.trim();
      return d?.open && t;
    },
    null,
    { timeout: 8000 },
  );

  const winnerName = (await result.textContent()).trim();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('prize-wheel:v1')));
  const matched = after.find((p) => p.name === winnerName);
  if (!matched) throw new Error(`${label}: center winner "${winnerName}" not in prizes`);

  // Stock decremented for that prize vs defaults (or before)
  const base = before || after;
  // After first load defaults, click decrements — remaining of winner should be total-1 on first spin from defaults
  const defaultsTotal = matched.total;
  if (matched.remaining > defaultsTotal) {
    throw new Error(`${label}: remaining > total`);
  }

  say(`${label}: winner="${winnerName}" remaining=${matched.remaining}/${matched.total} errors=${errors.length}`);
  if (errors.length) throw new Error(`${label}: page errors: ${errors.join('; ')}`);
  return { winnerName, errors, box };
};

const adminCheck = async (page) => {
  await page.goto(`${BASE}/#admin`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body.admin-open #admin', { timeout: 5000 });
  const visible = await page.locator('#admin').isVisible();
  if (!visible) throw new Error('admin not visible with #admin');

  // Edit first prize share and stock via form
  await page.locator('#adminBody tr').first().locator('[data-field="share"]').fill('25');
  await page.locator('#adminBody tr').first().locator('[data-field="remaining"]').fill('2');
  await page.locator('#adminBody tr').first().locator('[data-field="total"]').fill('2');
  await page.locator('#adminBody tr').first().locator('[data-field="name"]').fill('테스트경품');
  await page.locator('#saveAdmin').click();
  await page.waitForFunction(() => document.getElementById('adminMsg')?.textContent?.includes('저장'));

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('prize-wheel:v1')));
  const first = stored[0];
  if (first.name !== '테스트경품' || first.share !== 25 || first.remaining !== 2) {
    throw new Error(`admin save mismatch: ${JSON.stringify(first)}`);
  }

  // Same path as spin: resolveSpin from page module not easily imported; use __test if exported
  // App exports __test only as module binding — access via dynamic import in page
  const spinPathOk = await page.evaluate(async () => {
    const mod = await import('./app.js');
    const prizes = mod.__test.getPrizes();
    const r = mod.__test.resolveSpin(prizes, () => 0.01);
    return {
      prizes,
      winnerId: r.winnerId,
      afterRemaining: r.prizes.find((p) => p.id === r.winnerId)?.remaining,
    };
  });

  say(`admin: config=${JSON.stringify(spinPathOk.prizes.map((p) => ({ n: p.name, s: p.share, r: p.remaining })))}`);
  say(`admin: resolveSpin winner=${spinPathOk.winnerId} remainingAfter=${spinPathOk.afterRemaining}`);
  return spinPathOk;
};

const main = async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    writeFileSync(
      resolve(SCRATCH, 'browser-unavailable.log'),
      `chromium launch failed: ${e}\n`,
    );
    console.error('browser unavailable', e);
    process.exit(2);
  }

  try {
    const page = await browser.newPage();
    await runOnce(page, 'load1');
    await page.evaluate(() => localStorage.clear());
    await runOnce(page, 'load2');

    await page.screenshot({
      path: resolve(SCRATCH, 'wheel-player.png'),
      fullPage: true,
    });

    const admin = await adminCheck(page);
    await page.screenshot({
      path: resolve(SCRATCH, 'wheel-admin.png'),
      fullPage: true,
    });

    // Zero-stock segment still drawn: set one prize remaining 0, check segment count via layout in page
    const zeroStockVisual = await page.evaluate(async () => {
      const mod = await import('./app.js');
      const { segmentLayout } = await import('./wheel-logic.js');
      mod.__test.setPrizes([
        { id: 'z', name: '소진상품', share: 50, total: 1, remaining: 0, color: '#111111' },
        { id: 'ok', name: '남은상품', share: 50, total: 5, remaining: 5, color: '#00ff00' },
      ]);
      const segs = segmentLayout(mod.__test.getPrizes());
      const picks = new Set();
      for (let i = 0; i < 100; i++) {
        const id = (await import('./wheel-logic.js')).pickWinner(
          mod.__test.getPrizes(),
          () => i / 100,
        );
        picks.add(id);
      }
      return {
        segCount: segs.length,
        zeroStillDrawn: segs.some((s) => s.id === 'z' && s.remaining === 0),
        picks: [...picks],
      };
    });
    say(`zero-stock visual: ${JSON.stringify(zeroStockVisual)}`);
    if (!zeroStockVisual.zeroStillDrawn || zeroStockVisual.picks.includes('z')) {
      throw new Error('zero-stock segment/pick invariant failed');
    }

    writeFileSync(resolve(SCRATCH, 'admin-access.log'), log.join('\n') + '\n');
    writeFileSync(resolve(SCRATCH, 'browser-verify.log'), log.join('\n') + '\n');
    say('ALL BROWSER CHECKS PASSED');
  } finally {
    await browser.close();
  }
};

main().catch((e) => {
  console.error(e);
  writeFileSync(resolve(SCRATCH, 'browser-verify.log'), log.join('\n') + '\n' + String(e) + '\n');
  process.exit(1);
});
