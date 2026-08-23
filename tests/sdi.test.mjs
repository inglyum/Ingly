// INGLY OS V2 — test Fattura Elettronica / SDI (FatturaPA 1.2): validazione,
// generazione XML deterministica, escaping, nome file.
import { describe, it, assert, assertEq } from './harness.mjs';
import * as SDI from '../app-v2/src/sdi.js';

const sellerFull = {
  vat_number: '01234567890', company_name: 'Ingly Design', tax_regime: 'RF19',
  address: 'Via Roma 1', sede_cap: '90040', sede_comune: 'San Cipirello', sede_provincia: 'PA', sede_nazione: 'IT',
  default_vat_rate: 22,
};
const buyerFull = {
  name: 'Maria Russo', vat: '09876543210', address: 'Via Etnea 10', cap: '95100', comune: 'Catania', provincia: 'CT', nazione: 'IT', sdi_code: 'ABCDEFG',
};
const invoiceFull = { number: 'FATT-2026-000001', issue_date: '2026-08-05', total: 122, customer_name: 'Maria Russo', customer_id: 'c1' };
const lines = [{ description: 'Targa A5 incisa', quantity: 2, unit_price: 50, discount: 0, tax: 22 }];

describe('SDI — validazione', (s) => {
  it(s, 'dati completi → ok, nessun campo mancante', async () => {
    const v = SDI.validateForSdi(sellerFull, buyerFull, invoiceFull);
    assert(v.ok, 'atteso ok: ' + JSON.stringify(v.missing));
    assertEq(v.missing.length, 0);
  });
  it(s, 'cedente senza regime fiscale → mancante segnalato', async () => {
    const v = SDI.validateForSdi({ ...sellerFull, tax_regime: '' }, buyerFull, invoiceFull);
    assert(!v.ok && v.missing.some((m) => m.field === 'seller.tax_regime'), 'regime mancante');
  });
  it(s, 'cliente senza P.IVA né CF → mancante', async () => {
    const v = SDI.validateForSdi(sellerFull, { ...buyerFull, vat: '', fiscal_code: '' }, invoiceFull);
    assert(!v.ok && v.missing.some((m) => m.field === 'buyer.fiscal'), 'fiscale cliente mancante');
  });
  it(s, 'cliente con solo CF (no P.IVA) → valido', async () => {
    const v = SDI.validateForSdi(sellerFull, { ...buyerFull, vat: '', fiscal_code: 'RSSMRA80A01F205X' }, invoiceFull);
    assert(v.ok, 'CF sufficiente');
  });
});

describe('SDI — generazione XML', (s) => {
  it(s, 'struttura FatturaPA 1.2 con header e body', async () => {
    const xml = SDI.buildFatturaXML({ seller: sellerFull, buyer: buyerFull, invoice: invoiceFull, lines });
    assert(/<p:FatturaElettronica versione="FPR12"/.test(xml), 'root FPR12');
    assert(/<FatturaElettronicaHeader>/.test(xml) && /<FatturaElettronicaBody>/.test(xml), 'header+body');
    assert(/<IdCodice>01234567890<\/IdCodice>/.test(xml), 'P.IVA cedente');
    assert(/<Denominazione>Ingly Design<\/Denominazione>/.test(xml), 'denominazione cedente');
    assert(/<RegimeFiscale>RF19<\/RegimeFiscale>/.test(xml), 'regime');
    assert(/<CodiceDestinatario>ABCDEFG<\/CodiceDestinatario>/.test(xml), 'codice destinatario cliente');
    assert(/<Numero>FATT-2026-000001<\/Numero>/.test(xml), 'numero fattura');
    assert(/<TipoDocumento>TD01<\/TipoDocumento>/.test(xml), 'tipo TD01');
  });
  it(s, 'CodiceDestinatario 0000000 di default se assente', async () => {
    const xml = SDI.buildFatturaXML({ seller: sellerFull, buyer: { ...buyerFull, sdi_code: '' }, invoice: invoiceFull, lines });
    assert(/<CodiceDestinatario>0000000<\/CodiceDestinatario>/.test(xml), 'default 0000000');
  });
  it(s, 'aliquota IVA derivata dalla riga (22 da 44 imponibile / 22 imposta)', async () => {
    // base = 2*50 - 0 = 100? no: qui unit 50 qty 2 = 100, tax 22 → rate 22%
    const xml = SDI.buildFatturaXML({ seller: sellerFull, buyer: buyerFull, invoice: invoiceFull, lines: [{ description: 'X', quantity: 2, unit_price: 50, discount: 0, tax: 22 }] });
    assert(/<AliquotaIVA>22.00<\/AliquotaIVA>/.test(xml), 'aliquota 22%');
    assert(/<ImponibileImporto>100.00<\/ImponibileImporto>/.test(xml), 'imponibile 100');
  });
  it(s, 'escaping XML dei caratteri speciali nella descrizione', async () => {
    const xml = SDI.buildFatturaXML({ seller: sellerFull, buyer: buyerFull, invoice: invoiceFull, lines: [{ description: 'Targa <A&B> "x"', quantity: 1, unit_price: 10, discount: 0, tax: 2.2 }] });
    assert(/Targa &lt;A&amp;B&gt; &quot;x&quot;/.test(xml), 'descrizione escapata');
    assert(!/<A&B>/.test(xml), 'nessun carattere non escapato');
  });
  it(s, 'nome file SDI conforme IT<PIVA>_<progressivo>.xml', async () => {
    const name = SDI.sdiFileName(sellerFull, invoiceFull);
    assert(/^IT01234567890_\w{1,5}\.xml$/.test(name), 'nome file: ' + name);
  });
});

describe('SDI — migration 0022 (validazione statica)', (s) => {
  it(s, 'colonne fiscali additive nullable su tenant_settings e crm_customer', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync(new URL('../supabase/migrations/20260101000022_fiscal_fields.sql', import.meta.url), 'utf8');
    assert(/alter table public\.tenant_settings add column if not exists tax_regime text/.test(sql), 'tax_regime cedente');
    assert(/alter table public\.crm_customer add column if not exists sdi_code text/.test(sql), 'sdi_code cliente');
    assert(/add column if not exists cap text/.test(sql), 'cap cliente');
    assert(!/not null/.test(sql.replace(/default 'IT'/g, '')), 'colonne nullable (additiva sicura)');
  });
});
