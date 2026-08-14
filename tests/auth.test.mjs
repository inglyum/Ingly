// Test del SaaS Auth Gate + pacchetti (riattivato in v92): protegge la
// regressione "manca login e pacchetti" (era disattivato da uno standalone bypass).
// NB: qui NON iniettiamo la sessione, così verifichiamo che il gate blocchi davvero.
import { describe, it, assert, withPage } from './harness.mjs';
import { findLatestMonolith } from '../scripts/find-latest.mjs';

const { url, version } = findLatestMonolith();
console.log(`Test auth gate su INGLY-OS v${version}`);

// Carica il monolite SENZA sessione saas iniettata ({ auth:false }), così il
// gate di login deve comparire e possiamo testarlo.
async function withGate(fn, opts = {}) {
  return withPage(url, fn, { auth: false, wait: 2500, ...opts });
}

describe('SaaS Auth Gate', (s) => {
  it(s, 'senza sessione mostra la schermata di login e semina owner', async () => {
    await withGate(async (page) => {
      const r = await page.evaluate(() => {
        const g = document.getElementById('saas-gate');
        const db = JSON.parse(localStorage.getItem('ingly_saas_db') || '{"users":[]}');
        return {
          gateVisible: g ? getComputedStyle(g).display !== 'none' : false,
          hasUserInput: !!document.getElementById('gate-user'),
          hasPassInput: !!document.getElementById('gate-pass'),
          ownerSeeded: (db.users || []).some((u) => u.username === 'owner'),
        };
      });
      assert(r.gateVisible, 'il gate di login non è visibile senza sessione');
      assert(r.hasUserInput && r.hasPassInput, 'mancano i campi username/password');
      assert(r.ownerSeeded, 'utente owner non seminato in ingly_saas_db');
    });
  });

  it(s, 'login owner/standalone sblocca l\'app (piano enterprise)', async () => {
    await withGate(async (page) => {
      const r = await page.evaluate(async () => {
        document.getElementById('gate-user').value = 'owner';
        document.getElementById('gate-pass').value = 'standalone';
        window.SaaSGate.login();
        await new Promise((res) => setTimeout(res, 1500));
        const g = document.getElementById('saas-gate');
        return {
          loggedIn: !!(window.SaaSGate._session && window.SaaSGate._session.plan === 'enterprise'),
          gateHidden: g ? getComputedStyle(g).display === 'none' : true,
          appReady: typeof window.App !== 'undefined' && typeof window.IDB !== 'undefined',
        };
      });
      assert(r.loggedIn, 'login owner/standalone non riuscito');
      assert(r.gateHidden, 'il gate non si è nascosto dopo il login');
      assert(r.appReady, 'App/IDB non pronti dopo il login');
    });
  });

  it(s, 'password errata viene rifiutata', async () => {
    await withGate(async (page) => {
      const r = await page.evaluate(async () => {
        document.getElementById('gate-user').value = 'owner';
        document.getElementById('gate-pass').value = 'sbagliata';
        window.SaaSGate.login();
        await new Promise((res) => setTimeout(res, 300));
        const err = document.getElementById('gate-err');
        return { blocked: !window.SaaSGate._session, errShown: err && getComputedStyle(err).display !== 'none' };
      });
      assert(r.blocked, 'login accettato con password errata');
      assert(r.errShown, 'nessun messaggio di errore mostrato');
    });
  });
});

describe('Gating pacchetti (piani)', (s) => {
  it(s, 'un piano starter blocca le sezioni fuori pacchetto', async () => {
    await withGate(async (page) => {
      const r = await page.evaluate(async () => {
        document.getElementById('gate-user').value = 'owner';
        document.getElementById('gate-pass').value = 'standalone';
        window.SaaSGate.login();
        await new Promise((res) => setTimeout(res, 800));
        // simula un piano starter e verifica canAccess
        window.SaaSGate._session = { plan: 'starter', username: 'x', labName: 'x',
          modules: ['dashboard', 'settings', 'backup', 'quoter', 'clienti'] };
        return {
          allowsQuoter: window.SaaSGate.canAccess('quoter'),
          blocksBizai: !window.SaaSGate.canAccess('bizai'),
          blocksEtsy: !window.SaaSGate.canAccess('etsyai'),
        };
      });
      assert(r.allowsQuoter, 'starter dovrebbe includere quoter');
      assert(r.blocksBizai, 'starter NON dovrebbe includere bizai');
      assert(r.blocksEtsy, 'starter NON dovrebbe includere etsyai');
    });
  });
});
