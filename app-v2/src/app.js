// INGLY OS V2 — application shell (framework-free, testabile).
// Rende: (1) stato "config richiesta", (2) auth entry, (3) shell tenant-aware
// con contesto ruolo + dashboard base. Funzioni di rendering pure (HTML string)
// per test offline; boot() collega Supabase runtime.
import { getConfig } from './config.js';
import { getSupabase } from './supabase.js';
import { loadContext, roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderConfigRequired(cfg) {
  return `<section class="v2-screen" data-screen="config-required">
    <h1 class="v2-brand">INGLY OS <span>V2</span></h1>
    <div class="v2-card">
      <h2>Configurazione staging richiesta</h2>
      <p>Nessuna configurazione trovata. Crea <code>app-v2/env.js</code> dalle
      variabili d'ambiente (vedi <code>env.example.js</code>). Solo chiave
      <b>publishable/anon</b> (browser-safe), mai la service-role.</p>
      <p class="v2-muted">Ambiente: ${esc(cfg.env)}</p>
    </div>
  </section>`;
}

export function renderAuthEntry(cfg) {
  return `<section class="v2-screen" data-screen="auth">
    <h1 class="v2-brand">INGLY OS <span>V2</span></h1>
    <div class="v2-card">
      <h2>Accedi</h2>
      <p class="v2-muted">Staging · ${esc(cfg.env)}</p>
      <label>Email<input id="v2-email" type="email" autocomplete="email" placeholder="tu@esempio.it"></label>
      <button id="v2-login" class="v2-btn">Invia magic link</button>
      <div id="v2-auth-msg" class="v2-muted"></div>
    </div>
  </section>`;
}

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '▦' },
  { key: 'crm', label: 'CRM', icon: '◔' },
  { key: 'catalog', label: 'Catalogo', icon: '▤' },
  { key: 'orders', label: 'Ordini', icon: '▣' },
  { key: 'settings', label: 'Impostazioni', icon: '⚙' },
];

export function renderShell(ctx, active = 'dashboard') {
  const tenant = ctx.activeTenant;
  const role = roleForTenant(ctx, tenant) || '—';
  const tenants = (ctx.tenantIds || []);
  const nav = NAV.map((n) => `<button class="v2-nav-item${n.key === active ? ' active' : ''}" data-nav="${n.key}">
    <span class="v2-nav-ico" aria-hidden="true">${n.icon}</span>${esc(n.label)}</button>`).join('');
  const tenantOpts = tenants.length
    ? tenants.map((t) => `<option value="${esc(t)}"${t === tenant ? ' selected' : ''}>${esc(t)}</option>`).join('')
    : '<option value="">(nessun tenant)</option>';
  return `<div class="v2-app" data-screen="shell">
    <aside class="v2-sidebar">
      <div class="v2-brand-sm">INGLY <b>V2</b></div>
      <select id="v2-tenant" class="v2-tenant" aria-label="Tenant attivo">${tenantOpts}</select>
      <nav class="v2-nav">${nav}</nav>
    </aside>
    <main class="v2-main">
      <header class="v2-topbar">
        <div class="v2-crumb" id="v2-crumb">${esc(NAV.find((n) => n.key === active)?.label || 'Dashboard')}</div>
        <div class="v2-user">
          <span class="v2-role" title="Ruolo sul tenant attivo">${esc(role)}</span>
          <span class="v2-email">${esc(ctx.email || '')}</span>
        </div>
      </header>
      <section id="v2-view" class="v2-view">${renderDashboard(ctx)}</section>
    </main>
  </div>`;
}

export function renderDashboard(ctx) {
  const role = roleForTenant(ctx, ctx.activeTenant) || '—';
  const cards = [
    ['Tenant attivo', esc(ctx.activeTenant || '—')],
    ['Ruolo', esc(role)],
    ['Tenant accessibili', String((ctx.tenantIds || []).length)],
    ['Utente', esc(ctx.email || ctx.userId || '—')],
  ];
  return `<div class="v2-dash">
    <h2>Dashboard</h2>
    <p class="v2-muted">Vertical slice V2 · contesto tenant/ruolo dalla sessione (claim JWT).</p>
    <div class="v2-grid">
      ${cards.map(([l, v]) => `<div class="v2-kpi"><div class="v2-kpi-l">${l}</div><div class="v2-kpi-v">${v}</div></div>`).join('')}
    </div>
    <div class="v2-note">Nessun dato di business reale: questa slice mostra solo
      autenticazione, shell, navigazione tenant-aware e contesto ruolo.</div>
  </div>`;
}

// Sceglie lo schermo in base allo stato.
export function pickScreen({ config, session, ctx }) {
  if (!config || !config.configured) return 'config-required';
  if (!session) return 'auth';
  return 'shell';
}

export function renderApp(state) {
  const s = pickScreen(state);
  if (s === 'config-required') return renderConfigRequired(state.config || getConfig());
  if (s === 'auth') return renderAuthEntry(state.config);
  return renderShell(state.ctx, state.active || 'dashboard');
}

// ── Boot runtime (browser) ─────────────────────────────────────────────
export async function boot(root) {
  const config = getConfig();
  let session = null, ctx = null;
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      session = data && data.session;
      if (session) ctx = await loadContext(supabase, session);
    } catch (_) { /* stato non autenticato */ }
  }
  root.innerHTML = renderApp({ config, session, ctx });
  wire(root, { supabase });
}

function wire(root, { supabase }) {
  const login = root.querySelector('#v2-login');
  if (login && supabase) {
    login.addEventListener('click', async () => {
      const email = (root.querySelector('#v2-email') || {}).value;
      const msg = root.querySelector('#v2-auth-msg');
      if (!email) { if (msg) msg.textContent = 'Inserisci una email.'; return; }
      try {
        await supabase.auth.signInWithOtp({ email });
        if (msg) msg.textContent = 'Controlla la tua email per il magic link.';
      } catch (e) { if (msg) msg.textContent = 'Errore: ' + (e && e.message || e); }
    });
  }
  root.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('[data-nav]').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    const crumb = root.querySelector('#v2-crumb');
    if (crumb) crumb.textContent = b.textContent.trim();
  }));
}
