// INGLY OS V2 — Backup / Export UI. Backup JSON completo + CSV per entità.
// Riservato a OWNER/ADMIN (dump completo dei dati). Download best-effort.
import * as EXP from './exporter.js';
import { canEditSettings } from './settings.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;
const toast = (root, msg) => { const t = document.createElement('div'); t.className = 'v2-toast'; t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2600); };

function download(filename, content, mime) {
  try {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    return true;
  } catch (_) { return false; }
}

export function mount(container, { sb, ctx }) {
  if (!container) return;
  const role = roleForTenant(ctx || {}, (ctx || {}).activeTenant) || '—';
  const root = container.querySelector('[data-export-root]') || container;
  if (!canEditSettings(role)) { root.innerHTML = `<div class="v2-note">🔒 L'esportazione completa dei dati è riservata a OWNER/ADMIN.</div>`; return; }
  root.innerHTML = loading('Preparo l\'esportazione…');

  const stamp = () => new Date().toISOString().slice(0, 10);
  root.innerHTML = `
    <div class="v2-card">
      <h3>Backup completo</h3>
      <p class="v2-muted">Esporta tutti i dati del tuo spazio (clienti, catalogo, documenti, magazzino, finanza…) in un unico file JSON portabile.</p>
      <button class="v2-btn" data-backup>💾 Esporta backup (JSON)</button>
      <div class="v2-muted" data-backup-info style="margin-top:8px"></div>
    </div>
    <div class="v2-card">
      <h3>Esporta per entità (CSV)</h3>
      <div class="v2-grid" data-csv-grid>${EXP.TABLES.map((x) => `<button class="v2-btn v2-ghost v2-sm" data-csv="${esc(x.t)}">${esc(x.label)}</button>`).join('')}</div>
    </div>`;

  const backupBtn = root.querySelector('[data-backup]');
  backupBtn.addEventListener('click', async () => {
    backupBtn.disabled = true;
    try {
      const backup = await EXP.buildBackup(sb);
      const total = Object.values(backup.counts).reduce((s, n) => s + n, 0);
      const ok = download(`ingly-backup-${stamp()}.json`, JSON.stringify(backup, null, 2), 'application/json');
      root.querySelector('[data-backup-info]').textContent = `${total} record in ${Object.keys(backup.tables).length} entità` + (ok ? '' : ' · download non disponibile in questo ambiente');
      toast(root, ok ? 'Backup esportato' : 'Backup pronto (download non disponibile)');
    } catch (e) { toast(root, EXP.friendlyError(e)); }
    finally { backupBtn.disabled = false; }
  });

  root.querySelectorAll('[data-csv]').forEach((b) => b.addEventListener('click', async () => {
    const table = b.getAttribute('data-csv');
    b.disabled = true;
    try {
      const { csv, count } = await EXP.exportTableCSV(sb, table);
      if (!count) { toast(root, 'Nessun dato da esportare'); return; }
      const ok = download(`ingly-${table}-${stamp()}.csv`, csv, 'text/csv');
      toast(root, ok ? `${count} righe esportate` : `${count} righe pronte (download non disponibile)`);
    } catch (e) { toast(root, EXP.friendlyError(e)); }
    finally { b.disabled = false; }
  }));
}
