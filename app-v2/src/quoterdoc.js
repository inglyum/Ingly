// INGLY OS V2 — Smart Quoter: documenti (PDF cliente/interno), condivisione
// WhatsApp e template. Genera HTML stampabile self-contained (CSP-safe, nessuna
// dipendenza). Il PDF CLIENTE non contiene MAI i costi interni.
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€ ' + (Number(n || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => esc((s || '').slice(0, 10));

// Template documentali (preset modulari, non copie del vecchio TemplateManager).
export const TEMPLATES = {
  standard: { label: 'Preventivo standard', accent: '#111827', showSpec: false },
  premium: { label: 'Preventivo premium', accent: '#6d28d9', showSpec: true },
  b2b: { label: 'Preventivo B2B', accent: '#0f766e', showSpec: true },
  internal: { label: 'Documento interno', accent: '#b91c1c', showSpec: true },
};

const shell = (title, accent, body) => `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
  :root{ --accent:${accent} }
  *{ box-sizing:border-box } body{ font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif; color:#111; margin:0; padding:32px; background:#fff }
  .doc{ max-width:800px; margin:0 auto }
  .head{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid var(--accent); padding-bottom:14px; margin-bottom:20px }
  .brand{ font-size:22px; font-weight:800; color:var(--accent) } .brand small{ display:block; font-weight:400; color:#555; font-size:12px }
  h1{ font-size:18px; margin:0 0 4px } .muted{ color:#666; font-size:13px }
  table{ width:100%; border-collapse:collapse; margin:16px 0; font-size:13px }
  th,td{ text-align:left; padding:8px 10px; border-bottom:1px solid #e5e7eb } th{ background:#f9fafb }
  td.n,th.n{ text-align:right } .tot{ margin-top:12px; margin-left:auto; width:280px; font-size:14px }
  .tot div{ display:flex; justify-content:space-between; padding:4px 0 } .tot .g{ border-top:2px solid var(--accent); font-weight:800; font-size:16px; margin-top:6px; padding-top:8px }
  .notes{ margin-top:18px; font-size:12px; color:#444 } .badge{ display:inline-block; padding:2px 8px; border-radius:6px; background:var(--accent); color:#fff; font-size:11px }
  @media print{ body{ padding:0 } .noprint{ display:none } }
</style></head><body><div class="doc">${body}</div></body></html>`;

function headerBlock(doc, company, title) {
  return `<div class="head">
    <div class="brand">${esc(company.company_name || 'INGLY Design')}<small>${esc([company.vat_number && ('P.IVA ' + company.vat_number), company.city, company.email].filter(Boolean).join(' · '))}</small></div>
    <div style="text-align:right"><h1>${esc(title)}</h1>
      <div class="muted">${esc(doc.number || 'Bozza')} · ${day(doc.issue_date) || ''}</div>
      <div class="muted">Cliente: <b>${esc(doc.customer_name || '—')}</b></div>
      ${doc.valid_until ? `<div class="muted">Valido fino al ${day(doc.valid_until)}</div>` : ''}</div>
  </div>`;
}

// PDF CLIENTE — nessun costo interno, solo prezzi/righe/sconti/IVA/totale.
export function clientDocHTML(doc, computed, company = {}, templateKey = 'standard') {
  const tpl = TEMPLATES[templateKey] || TEMPLATES.standard;
  const rows = computed.rows.map((r) => `<tr>
    <td>${esc(r.description || '')}${tpl.showSpec && r.spec ? `<br><span class="muted">${esc(r.spec)}</span>` : ''}</td>
    <td class="n">${r.qty}</td><td class="n">${eur(r.unitPrice)}</td>
    <td class="n">${r.discountPct ? '-' + r.discountPct + '%' : '—'}</td>
    <td class="n">${eur(r.imponibile)}</td></tr>`).join('');
  const body = `${headerBlock(doc, company, doc.title || 'Preventivo')}
    ${doc.category ? `<span class="badge">${esc(doc.category)}</span>` : ''}
    <table><thead><tr><th>Descrizione</th><th class="n">Q.tà</th><th class="n">Prezzo</th><th class="n">Sconto</th><th class="n">Imponibile</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Nessuna riga</td></tr>'}</tbody></table>
    <div class="tot">
      <div><span>Imponibile</span><span>${eur(computed.imponibile)}</span></div>
      <div><span>IVA</span><span>${eur(computed.iva)}</span></div>
      <div class="g"><span>Totale</span><span>${eur(computed.total)}</span></div>
      ${computed.deposit ? `<div><span>Acconto ${computed.depositPct}%</span><span>${eur(computed.deposit)}</span></div>` : ''}
    </div>
    ${doc.notes ? `<div class="notes">${esc(doc.notes)}</div>` : ''}
    <div class="notes">Preventivo valido 7 giorni salvo diversa indicazione. Grazie per la fiducia.</div>`;
  return shell(doc.title || 'Preventivo', tpl.accent, body);
}

// PDF INTERNO — include breakdown costi, markup, margine (uso interno).
export function internalDocHTML(doc, computed, company = {}) {
  const tpl = TEMPLATES.internal;
  const rows = computed.rows.map((r) => `<tr>
    <td>${esc(r.description || '')}</td><td class="n">${r.qty}</td>
    <td class="n">${eur(r.unitCost)}</td><td class="n">${eur(r.unitPrice)}</td>
    <td class="n">${r.markupPct}%</td><td class="n">${eur(r.margin)}</td><td class="n">${r.marginPct}%</td></tr>`).join('');
  const body = `${headerBlock(doc, company, 'Documento interno — analisi costi')}
    <table><thead><tr><th>Riga</th><th class="n">Q.tà</th><th class="n">Costo unit.</th><th class="n">Prezzo</th><th class="n">Markup</th><th class="n">Margine</th><th class="n">Margine%</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="tot">
      <div><span>Costo totale</span><span>${eur(computed.cost)}</span></div>
      <div><span>Imponibile</span><span>${eur(computed.imponibile)}</span></div>
      <div><span>Margine</span><span>${eur(computed.margin)} (${computed.marginPct}%)</span></div>
      <div class="g"><span>Rischio margine</span><span>${esc((computed.risk || 'low').toUpperCase())}</span></div>
    </div>`;
  return shell('Documento interno', tpl.accent, body);
}

// Riepilogo testuale cliente (per WhatsApp/condivisione) — nessun dato interno.
export function shareText(doc, computed) {
  const lines = computed.rows.filter((r) => r.kind !== 'extra').map((r) => `• ${r.description} x${r.qty} — ${eur(r.imponibile)}`);
  return [
    `*Preventivo ${doc.title || doc.number || ''}*`,
    doc.customer_name ? `Cliente: ${doc.customer_name}` : '',
    ...lines,
    `Totale: ${eur(computed.total)} (IVA inclusa)`,
    doc.valid_until ? `Valido fino al ${day(doc.valid_until)}` : 'Valido 7 giorni',
    'INGLY Design',
  ].filter(Boolean).join('\n');
}

export function whatsappLink(doc, computed, phone) {
  const base = phone ? `https://wa.me/${String(phone).replace(/[^0-9]/g, '')}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(shareText(doc, computed))}`;
}

// Apre l'HTML in una nuova finestra e lancia la stampa (→ PDF via browser).
export function printDoc(html) {
  try {
    const w = window.open('', '_blank');
    if (!w) return false;
    w.document.open(); w.document.write(html); w.document.close();
    w.focus(); setTimeout(() => { try { w.print(); } catch (_) {} }, 250);
    return true;
  } catch (_) { return false; }
}
