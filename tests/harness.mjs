// Mini-harness di test per INGLY OS — zero dipendenze oltre a `playwright`.
// Gira sia in sandbox (playwright globale in /opt) sia in CI (playwright locale).
import { createRequire } from 'node:module';

// Carica `playwright` in modo robusto. Se in sandbox esiste il pacchetto globale
// (con browser preinstallato in PLAYWRIGHT_BROWSERS_PATH), usalo per primo;
// altrimenti il bare specifier del node_modules locale (CI, dopo `playwright install`).
async function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const sandboxHasBrowsers = !!process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (sandboxHasBrowsers) {
    for (const p of [
      '/opt/node22/lib/node_modules/playwright/index.js',
      '/usr/lib/node_modules/playwright/index.js',
    ]) {
      try { return req(p); } catch {}
    }
  }
  try { return (await import('playwright')); } catch {}
  for (const p of [
    '/opt/node22/lib/node_modules/playwright/index.js',
    '/usr/lib/node_modules/playwright/index.js',
  ]) {
    try { return req(p); } catch {}
  }
  throw new Error('Impossibile caricare playwright. In CI: `npm ci` + `npx playwright install chromium`.');
}

const suites = [];
export function describe(name, fn) { const s = { name, tests: [] }; suites.push(s); fn(s); }
export function it(s, name, fn) { s.tests.push({ name, fn }); }

export function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert fallito'); }
export function assertEq(a, b, msg) { if (a !== b) throw new Error((msg || 'assertEq') + ` — atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`); }

// Errori console noti e innocui da ignorare (lock read-only di App.navigate).
const IGNORED = [/read only property .?navigate/i];
export function isIgnorableError(msg) { return IGNORED.some((re) => re.test(msg)); }

export async function withPage(url, fn, { wait = 5000, viewport = { width: 1500, height: 900 }, auth = true, blockHosts = [] } = {}) {
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize(viewport);
  const errors = [];
  page.on('pageerror', (e) => { if (!isIgnorableError(e.message)) errors.push(e.message); });
  // Blocca host esterni (es. Supabase) per test offline deterministici: la
  // richiesta viene abortita subito e il gate cade sul fallback localStorage.
  if (blockHosts.length) {
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (blockHosts.some((h) => u.includes(h))) return route.abort();
      return route.continue();
    });
  }
  await page.addInitScript(() => { try { localStorage.setItem('_wizard_done_v37', '1'); } catch (e) {} });
  // Il SaaS Auth Gate (v92+) mette in pausa App.init finché non c'è una sessione:
  // di default iniettiamo una sessione owner Enterprise così i test girano
  // sull'app sbloccata. Con { auth:false } NON la iniettiamo, per poter testare
  // il gate stesso (login screen, credenziali, gating).
  if (auth) {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('ingly_saas_session', JSON.stringify({
          id: 'test-owner', userId: 'test-owner', username: 'owner', labName: 'INGLY OS',
          plan: 'enterprise', modules: ['*'], expiresAt: null, status: 'lifetime',
          loginAt: new Date().toISOString(),
        }));
      } catch (e) {}
    });
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(wait);
  try { return await fn(page, errors); }
  finally { await browser.close(); }
}

export async function run() {
  let pass = 0, fail = 0; const failures = [];
  for (const s of suites) {
    console.log(`\n▸ ${s.name}`);
    for (const t of s.tests) {
      try { await t.fn(); console.log(`  ✅ ${t.name}`); pass++; }
      catch (e) { console.log(`  ❌ ${t.name}\n     ${e.message}`); fail++; failures.push(`${s.name} › ${t.name}: ${e.message}`); }
    }
  }
  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passati, ${fail} falliti`);
  if (fail > 0) { console.log('\nFalliti:'); failures.forEach((f) => console.log(' - ' + f)); process.exit(1); }
}
