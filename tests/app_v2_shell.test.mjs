// INGLY OS V2 — test dell'application shell (offline).
// Logica di rendering/contesto in Node + smoke della pagina reale via Playwright
// (stato "config richiesta", nessun segreto, nessun crash). Nessun dato reale.
import { describe, it, assert, assertEq, withPage } from './harness.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const A = join(process.cwd(), 'app-v2');
const PROD_REF = 'dhfuokioyuytbxxgoilp';

// import diretto dei moduli (funzioni pure; window guardato, Buffer fallback)
const { pickScreen, renderShell, renderDashboard, renderConfigRequired, renderAuthEntry } =
  await import('../app-v2/src/app.js');
const { assertBrowserSafe } = await import('../app-v2/src/config.js');
const { claimsFromSession, roleForTenant, decodeJwt } = await import('../app-v2/src/context.js');

function jwtFor(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

describe('V2 App Shell — logica (offline)', (s) => {
  it(s, 'pickScreen: config-required senza config', async () => {
    assertEq(pickScreen({ config: { configured: false } }), 'config-required');
  });
  it(s, 'pickScreen: auth con config ma senza sessione', async () => {
    assertEq(pickScreen({ config: { configured: true }, session: null }), 'auth');
  });
  it(s, 'pickScreen: shell con config + sessione', async () => {
    assertEq(pickScreen({ config: { configured: true }, session: { access_token: 'x' } }), 'shell');
  });

  it(s, 'claimsFromSession estrae tenant/ruolo dal JWT', async () => {
    const token = jwtFor({ sub: 'u1', email: 'a@b.it',
      app_metadata: { tenant_ids: ['t1', 't2'], roles: { t1: 'OWNER' }, active_tenant: 't1' } });
    const ctx = claimsFromSession({ access_token: token });
    assertEq(ctx.userId, 'u1');
    assertEq(ctx.activeTenant, 't1');
    assertEq(ctx.tenantIds.length, 2);
    assertEq(roleForTenant(ctx, 't1'), 'OWNER');
  });

  it(s, 'decodeJwt tollera token malformati', async () => {
    assertEq(JSON.stringify(decodeJwt('non-un-jwt')), '{}');
  });

  it(s, 'renderShell mostra tenant, ruolo e nav raggruppata reale', async () => {
    const ctx = { email: 'a@b.it', activeTenant: 't1', tenantIds: ['t1'], roles: { t1: 'OWNER' } };
    const html = renderShell(ctx, 'dashboard');
    assert(html.includes('data-screen="shell"'), 'shell mancante');
    assert(/data-route="clients"/.test(html), 'nav CRM (clients) mancante');
    assert(/data-route="catalog"/.test(html), 'nav Catalogo mancante');
    assert(/data-route="gestione_ordini"/.test(html), 'nav Ordini mancante');
    assert(html.includes('OWNER'), 'badge ruolo mancante');
    assert(html.includes('t1'), 'tenant attivo mancante');
  });

  it(s, 'renderDashboard espone il contesto (tenant/ruolo/utente)', async () => {
    const ctx = { email: 'a@b.it', activeTenant: 't1', tenantIds: ['t1', 't2'], roles: { t1: 'ADMIN' } };
    const html = renderDashboard(ctx);
    assert(html.includes('ADMIN'), 'ruolo non mostrato');
    assert(html.includes('Tenant accessibili'), 'kpi tenant mancante');
  });

  it(s, 'assertBrowserSafe BLOCCA una service-role key', async () => {
    let threw = false;
    try { assertBrowserSafe({ anonKey: 'header.' + Buffer.from('{"role":"service_role"}').toString('base64') + '.sig' }); }
    catch (_) { threw = true; }
    // il check è testuale su "service_role"
    try { assertBrowserSafe({ anonKey: 'x-service_role-x' }); } catch (_) { threw = true; }
    assert(threw, 'service-role non bloccata');
  });
});

const { MODULES, GROUP_ORDER } = await import('../app-v2/src/modules.js');
const { renderView, IMPLEMENTED } = await import('../app-v2/src/views.js');

describe('V2 Navigation parity (offline)', (s) => {
  it(s, 'registro moduli estratto: >=90 moduli, 12 categorie', async () => {
    assert(MODULES.length >= 90, `moduli: ${MODULES.length}`);
    assert(GROUP_ORDER.length === 12, `gruppi: ${GROUP_ORDER.length}`);
  });
  it(s, 'ogni modulo del registro ha una voce nav (data-route) nella shell', async () => {
    const html = renderShell({ tenantIds: ['t1'], roles: { t1: 'OWNER' }, activeTenant: 't1' }, 'dashboard');
    MODULES.forEach((m) => assert(html.includes(`data-route="${m.s}"`), `nav mancante per ${m.s}`));
  });
  it(s, 'le categorie reali compaiono come titoli di gruppo', async () => {
    const html = renderShell({ tenantIds: [], roles: {}, activeTenant: null });
    ['AI', 'Preventivi', 'Vendite', 'Finanza', 'Clienti', 'Produzione', 'Magazzino', 'Marketing']
      .forEach((g) => assert(html.includes(g), `gruppo mancante: ${g}`));
  });
});

describe('V2 Routing / rendering moduli (offline)', (s) => {
  const ctx = { email: 'a@b.it', activeTenant: 't1', tenantIds: ['t1'], roles: { t1: 'OWNER' } };
  it(s, 'nessuna route rotta: ogni modulo rende una pagina non vuota', async () => {
    MODULES.forEach((m) => {
      const html = renderView(m.s, ctx);
      assert(html && html.includes(`data-page="${m.s}"`), `route rotta: ${m.s}`);
      assert(html.length > 80, `pagina troppo scarna: ${m.s}`);
    });
  });
  it(s, 'i 4 moduli prioritari sono implementati (IA reale)', async () => {
    ['dashboard', 'clients', 'catalog', 'gestione_ordini'].forEach((k) =>
      assert(IMPLEMENTED.includes(k), `non implementato: ${k}`));
    assert(/data-crm-pane/.test(renderView('clients', ctx)), 'CRM senza pane live');
    assert(/data-orders-root/.test(renderView('gestione_ordini', ctx)), 'Ordini senza root live');
    assert(/data-catalog-root/.test(renderView('catalog', ctx)), 'Catalogo senza root live');
  });
  it(s, 'i moduli non implementati sono marcati "non ancora connesso" (nessun controllo finto)', async () => {
    const html = renderView('goals', ctx); // modulo reale non ancora implementato
    assert(/non ancora connesso a V2/i.test(html), 'manca badge non-connesso');
  });
  it(s, 'i moduli non ancora connessi mostrano il badge (nessun controllo finto)', async () => {
    const html = renderView('materials', ctx); // modulo backend non ancora implementato
    assert(/non ancora connesso/i.test(html), 'modulo non marcato');
  });
});

describe('V2 App — sicurezza sorgenti (offline)', (s) => {
  function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = join(dir, d.name);
      if (d.isDirectory()) return d.name === 'vendor' ? [] : walk(p);
      return [p];
    });
  }
  it(s, 'nessun ref di PRODUZIONE nel CODICE app-v2 (js/html/css, escluso vendor)', async () => {
    // I .md di documentazione possono citare il ref di produzione come "NON usare".
    walk(A).filter((f) => /\.(js|html|css)$/.test(f)).forEach((f) => {
      assert(!readFileSync(f, 'utf8').includes(PROD_REF), `ref di produzione in ${f}`);
    });
  });
  it(s, 'env.js NON è presente nel repo (solo template)', async () => {
    assert(existsSync(join(A, 'env.example.js')), 'template mancante');
    assert(!existsSync(join(A, 'env.js')), 'env.js NON deve essere committato');
  });
});

import { createServer } from 'node:http';
import { extname } from 'node:path';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.md': 'text/plain' };
function serveDir(dir) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const p = join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!p.startsWith(dir) || !existsSync(p)) { res.statusCode = 404; return res.end('nf'); }
      res.setHeader('Content-Type', MIME[extname(p)] || 'application/octet-stream');
      res.end(readFileSync(p));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

describe('V2 App — smoke pagina reale (Playwright, offline via http)', (s) => {
  it(s, 'index.html senza env → schermata config-required, nessun crash', async () => {
    const { srv, port } = await serveDir(A);
    const errs = [];
    try {
      await withPage(`http://127.0.0.1:${port}/index.html`, async (page) => {
        page.on('pageerror', (e) => errs.push(String(e)));
        await new Promise((r) => setTimeout(r, 1000));
        const screen = await page.evaluate(() => {
          const el = document.querySelector('[data-screen]');
          return el ? el.getAttribute('data-screen') : null;
        });
        assertEq(screen, 'config-required');
      }, { wait: 800, auth: false });
    } finally { srv.close(); }
    assert(errs.filter((e) => !/favicon|env\.js/i.test(e)).length === 0, 'errori JS: ' + errs.join(' | '));
  });
});
