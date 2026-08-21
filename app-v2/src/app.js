// INGLY OS V2 — application shell (framework-free, data-driven, tenant-aware).
// Nav costruita dal registro reale (modules.js estratto da v96); routing hash;
// contesto tenant/ruolo dai claim. Screen: config-required / auth / shell.
import { getConfig } from './config.js';
import { getSupabase } from './supabase.js';
import { loadContext, roleForTenant } from './context.js';
import { modulesByGroup, GROUP_ORDER, MODULES } from './modules.js';
import { mountRouter, currentRoute } from './router.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderConfigRequired(cfg) {
  return `<section class="v2-screen" data-screen="config-required">
    <h1 class="v2-brand">INGLY OS <span>V2</span></h1>
    <div class="v2-card"><h2>Configurazione staging richiesta</h2>
      <p>Nessuna configurazione trovata. Crea <code>app-v2/env.js</code> dalle
      variabili d'ambiente (vedi <code>env.example.js</code>). Solo chiave
      <b>publishable/anon</b> (browser-safe), mai la service-role.</p>
      <p class="v2-muted">Ambiente: ${esc(cfg.env)}</p></div>
  </section>`;
}

export function renderAuthEntry(cfg) {
  return `<section class="v2-screen" data-screen="auth">
    <h1 class="v2-brand">INGLY OS <span>V2</span></h1>
    <div class="v2-card"><h2>Accedi</h2>
      <p class="v2-muted">Staging · ${esc(cfg.env)}</p>
      <label>Email<input id="v2-email" type="email" autocomplete="email" placeholder="tu@esempio.it"></label>
      <button id="v2-login" class="v2-btn">Invia magic link</button>
      <div id="v2-auth-msg" class="v2-muted"></div></div>
  </section>`;
}

// Sidebar raggruppata dal registro reale (95 moduli / 12 categorie).
function renderNav(activeRoute) {
  const byGroup = modulesByGroup();
  return GROUP_ORDER.map((g) => {
    const items = (byGroup[g] || []).map((m) =>
      `<a class="v2-nav-item${m.s === activeRoute ? ' active' : ''}" href="#/${esc(m.s)}" data-route="${esc(m.s)}" title="${esc(m.n)}">
        <span class="v2-nav-ico" aria-hidden="true">${m.icon}</span><span class="v2-nav-lbl">${esc(m.n)}</span></a>`).join('');
    return `<div class="v2-nav-group"><div class="v2-nav-gtitle">${esc(g)}</div>${items}</div>`;
  }).join('');
}

export function renderShell(ctx, active) {
  const activeRoute = active || 'dashboard';
  const tenant = ctx.activeTenant;
  const role = roleForTenant(ctx, tenant) || '—';
  const tenants = ctx.tenantIds || [];
  const tenantOpts = tenants.length
    ? tenants.map((t) => `<option value="${esc(t)}"${t === tenant ? ' selected' : ''}>${esc(t)}</option>`).join('')
    : '<option value="">(nessun tenant)</option>';
  return `<div class="v2-app" data-screen="shell">
    <aside class="v2-sidebar">
      <div class="v2-brand-sm">INGLY <b>V2</b></div>
      <select id="v2-tenant" class="v2-tenant" aria-label="Tenant attivo">${tenantOpts}</select>
      <input id="v2-nav-search" class="v2-nav-search" placeholder="🔍 Cerca modulo…">
      <nav class="v2-nav" id="v2-nav">${renderNav(activeRoute)}</nav>
    </aside>
    <main class="v2-main">
      <header class="v2-topbar">
        <div class="v2-crumb" id="v2-crumb">Dashboard</div>
        <div class="v2-user">
          <span class="v2-role" title="Ruolo sul tenant attivo">${esc(role)}</span>
          <span class="v2-email">${esc(ctx.email || '')}</span></div>
      </header>
      <section id="v2-view" class="v2-view"></section>
    </main>
  </div>`;
}

// KPI di contesto (usata anche nei test come vista sintetica).
export function renderDashboard(ctx) {
  const role = roleForTenant(ctx, ctx.activeTenant) || '—';
  const cards = [
    ['Tenant attivo', esc(ctx.activeTenant || '—')],
    ['Ruolo', esc(role)],
    ['Tenant accessibili', String((ctx.tenantIds || []).length)],
    ['Utente', esc(ctx.email || ctx.userId || '—')],
  ];
  return `<div class="v2-dash"><h2>Dashboard</h2>
    <div class="v2-grid">${cards.map(([l, v]) =>
      `<div class="v2-kpi"><div class="v2-kpi-l">${l}</div><div class="v2-kpi-v">${v}</div></div>`).join('')}</div></div>`;
}

export function pickScreen({ config, session }) {
  if (!config || !config.configured) return 'config-required';
  if (!session) return 'auth';
  return 'shell';
}

export function renderApp(state) {
  const s = pickScreen(state);
  if (s === 'config-required') return renderConfigRequired(state.config || getConfig());
  if (s === 'auth') return renderAuthEntry(state.config);
  return renderShell(state.ctx, state.active || currentRoute());
}

export async function boot(root) {
  const config = getConfig();
  let session = null, ctx = null;
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      session = data && data.session;
      if (session) ctx = await loadContext(supabase, session);
    } catch (_) { /* non autenticato */ }
  }
  root.innerHTML = renderApp({ config, session, ctx });
  if (pickScreen({ config, session }) === 'shell') { mountRouter(root, ctx || {}); }
  wire(root, { supabase });
}

function wire(root, { supabase }) {
  const login = root.querySelector('#v2-login');
  if (login && supabase) {
    login.addEventListener('click', async () => {
      const email = (root.querySelector('#v2-email') || {}).value;
      const msg = root.querySelector('#v2-auth-msg');
      if (!email) { if (msg) msg.textContent = 'Inserisci una email.'; return; }
      try { await supabase.auth.signInWithOtp({ email });
        if (msg) msg.textContent = 'Controlla la tua email per il magic link.';
      } catch (e) { if (msg) msg.textContent = 'Errore: ' + (e && e.message || e); }
    });
  }
  const ns = root.querySelector('#v2-nav-search');
  if (ns) ns.addEventListener('input', () => {
    const q = ns.value.toLowerCase().trim();
    root.querySelectorAll('#v2-nav .v2-nav-item').forEach((a) => {
      const show = !q || a.textContent.toLowerCase().includes(q);
      a.style.display = show ? '' : 'none';
    });
    root.querySelectorAll('#v2-nav .v2-nav-group').forEach((g) => {
      const any = [...g.querySelectorAll('.v2-nav-item')].some((a) => a.style.display !== 'none');
      g.style.display = any ? '' : 'none';
    });
  });
}

export { MODULES };
