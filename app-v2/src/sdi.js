// INGLY OS V2 — Fattura Elettronica / SDI (FatturaPA 1.2). Generatore
// DETERMINISTICO dell'XML a partire da una fattura reale + dati fiscali del
// cedente (Impostazioni) e del cessionario (cliente). NIENTE valori inventati:
// se mancano campi obbligatori il generatore RIFIUTA e ritorna un report di
// validazione (mai un file finto). Client-side, CSP-safe, nessuna dipendenza.
import { friendlyError } from './crm.js';
export { friendlyError };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const dec = (n) => (Number(n) || 0).toFixed(2);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (tag, val) => `<${tag}>${esc(val)}</${tag}>`;

// Campi obbligatori minimi per una FatturaPA valida (privati, TD01).
export function validateForSdi(seller, buyer, invoice) {
  const missing = [];
  const need = (cond, field, label) => { if (!cond) missing.push({ field, label }); };
  seller = seller || {}; buyer = buyer || {}; invoice = invoice || {};
  need(seller.vat_number, 'seller.vat_number', 'Cedente: Partita IVA');
  need(seller.company_name, 'seller.company_name', 'Cedente: Denominazione');
  need(seller.tax_regime, 'seller.tax_regime', 'Cedente: Regime fiscale (es. RF01/RF19)');
  need(seller.sede_cap, 'seller.sede_cap', 'Cedente: CAP sede');
  need(seller.sede_comune, 'seller.sede_comune', 'Cedente: Comune sede');
  need(seller.sede_provincia, 'seller.sede_provincia', 'Cedente: Provincia sede');
  need(seller.address, 'seller.address', 'Cedente: Indirizzo sede');
  need(buyer.name || invoice.customer_name, 'buyer.name', 'Cliente: Denominazione');
  need(buyer.vat || buyer.fiscal_code, 'buyer.fiscal', 'Cliente: Partita IVA o Codice Fiscale');
  need(buyer.cap, 'buyer.cap', 'Cliente: CAP');
  need(buyer.comune, 'buyer.comune', 'Cliente: Comune');
  need(buyer.provincia, 'buyer.provincia', 'Cliente: Provincia');
  need(buyer.address, 'buyer.address', 'Cliente: Indirizzo');
  need(invoice.number, 'invoice.number', 'Fattura: Numero');
  need(invoice.issue_date, 'invoice.issue_date', 'Fattura: Data');
  return { ok: missing.length === 0, missing };
}

// Progressivo invio deterministico dal numero fattura (solo alfanumerico, 1-5 char).
function progressivo(invoice) {
  const base = String(invoice.number || '00001').replace(/[^0-9A-Za-z]/g, '');
  return (base.slice(-5) || '00001');
}

// Raggruppa le righe per aliquota IVA (derivata dalla riga o, in mancanza, dal
// default del cedente). Ritorna righe dettaglio + riepiloghi per aliquota.
function computeLines(lines, defaultRate) {
  const detail = []; const byRate = {};
  (lines || []).forEach((l, i) => {
    const qty = Number(l.quantity) || 0; const price = Number(l.unit_price) || 0;
    const base = r2(qty * price - (Number(l.discount) || 0));
    const rate = base > 0 && Number(l.tax) ? Math.round((Number(l.tax) / base) * 100) : Number(defaultRate) || 0;
    detail.push({ n: i + 1, description: l.description, qty, price, total: base, rate });
    if (!byRate[rate]) byRate[rate] = { rate, imponibile: 0, imposta: 0 };
    byRate[rate].imponibile = r2(byRate[rate].imponibile + base);
    byRate[rate].imposta = r2(byRate[rate].imposta + base * rate / 100);
  });
  return { detail, riepiloghi: Object.values(byRate) };
}

// Genera la stringa XML FatturaPA. Non valida i campi (usa validateForSdi prima);
// resta difensivo su valori mancanti.
export function buildFatturaXML({ seller, buyer, invoice, lines } = {}) {
  seller = seller || {}; buyer = buyer || {}; invoice = invoice || {};
  const buyerName = buyer.name || invoice.customer_name || '';
  const sdiCode = (buyer.sdi_code && String(buyer.sdi_code).trim()) || '0000000';
  const { detail, riepiloghi } = computeLines(lines, seller.default_vat_rate);

  const buyerFiscalId = buyer.vat
    ? `<IdFiscaleIVA><IdPaese>${esc(buyer.nazione || 'IT')}</IdPaese><IdCodice>${esc(buyer.vat)}</IdCodice></IdFiscaleIVA>`
    : '';
  const buyerCF = buyer.fiscal_code ? el('CodiceFiscale', buyer.fiscal_code) : '';

  const header = `<FatturaElettronicaHeader>
  <DatiTrasmissione>
    <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${esc(seller.vat_number || '')}</IdCodice></IdTrasmittente>
    <ProgressivoInvio>${esc(progressivo(invoice))}</ProgressivoInvio>
    <FormatoTrasmissione>FPR12</FormatoTrasmissione>
    <CodiceDestinatario>${esc(sdiCode)}</CodiceDestinatario>
    ${sdiCode === '0000000' && buyer.pec ? el('PECDestinatario', buyer.pec) : ''}
  </DatiTrasmissione>
  <CedentePrestatore>
    <DatiAnagrafici>
      <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${esc(seller.vat_number || '')}</IdCodice></IdFiscaleIVA>
      ${seller.fiscal_code ? el('CodiceFiscale', seller.fiscal_code) : ''}
      <Anagrafica><Denominazione>${esc(seller.company_name || '')}</Denominazione></Anagrafica>
      <RegimeFiscale>${esc(seller.tax_regime || '')}</RegimeFiscale>
    </DatiAnagrafici>
    <Sede>
      <Indirizzo>${esc(seller.address || '')}</Indirizzo>
      <CAP>${esc(seller.sede_cap || '')}</CAP>
      <Comune>${esc(seller.sede_comune || '')}</Comune>
      <Provincia>${esc(seller.sede_provincia || '')}</Provincia>
      <Nazione>${esc(seller.sede_nazione || 'IT')}</Nazione>
    </Sede>
  </CedentePrestatore>
  <CessionarioCommittente>
    <DatiAnagrafici>
      ${buyerFiscalId}${buyerCF}
      <Anagrafica><Denominazione>${esc(buyerName)}</Denominazione></Anagrafica>
    </DatiAnagrafici>
    <Sede>
      <Indirizzo>${esc(buyer.address || '')}</Indirizzo>
      <CAP>${esc(buyer.cap || '')}</CAP>
      <Comune>${esc(buyer.comune || '')}</Comune>
      <Provincia>${esc(buyer.provincia || '')}</Provincia>
      <Nazione>${esc(buyer.nazione || 'IT')}</Nazione>
    </Sede>
  </CessionarioCommittente>
</FatturaElettronicaHeader>`;

  const linee = detail.map((d) => `<DettaglioLinee>
      <NumeroLinea>${d.n}</NumeroLinea>
      <Descrizione>${esc(d.description || '')}</Descrizione>
      <Quantita>${dec(d.qty)}</Quantita>
      <PrezzoUnitario>${dec(d.price)}</PrezzoUnitario>
      <PrezzoTotale>${dec(d.total)}</PrezzoTotale>
      <AliquotaIVA>${dec(d.rate)}</AliquotaIVA>
    </DettaglioLinee>`).join('\n    ');

  const riepilogo = riepiloghi.map((r) => `<DatiRiepilogo>
      <AliquotaIVA>${dec(r.rate)}</AliquotaIVA>
      <ImponibileImporto>${dec(r.imponibile)}</ImponibileImporto>
      <Imposta>${dec(r.imposta)}</Imposta>
    </DatiRiepilogo>`).join('\n    ');

  const body = `<FatturaElettronicaBody>
  <DatiGenerali>
    <DatiGeneraliDocumento>
      <TipoDocumento>TD01</TipoDocumento>
      <Divisa>EUR</Divisa>
      <Data>${esc(String(invoice.issue_date || '').slice(0, 10))}</Data>
      <Numero>${esc(invoice.number || '')}</Numero>
      <ImportoTotaleDocumento>${dec(invoice.total)}</ImportoTotaleDocumento>
    </DatiGeneraliDocumento>
  </DatiGenerali>
  <DatiBeniServizi>
    ${linee}
    ${riepilogo}
  </DatiBeniServizi>
</FatturaElettronicaBody>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
${header}
${body}
</p:FatturaElettronica>`;
}

// Nome file SDI conforme: IT<PIVA>_<progressivo>.xml
export function sdiFileName(seller, invoice) {
  const piva = String((seller && seller.vat_number) || 'XXXXXXXXXXX').replace(/[^0-9A-Za-z]/g, '');
  return `IT${piva}_${progressivo(invoice || {})}.xml`;
}
