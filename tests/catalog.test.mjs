// Test dei flussi catalogo & backup INGLY OS — protegge le regressioni Fase 0:
// import del seed Ingly (128 prodotti), payload scheda "Ingly", download Backup ZIP.
import { describe, it, assert, withPage } from './harness.mjs';
import { findLatestMonolith } from '../scripts/find-latest.mjs';

const { url, version } = findLatestMonolith();
console.log(`Test catalogo su INGLY-OS v${version}`);

describe('Catalogo Ingly (seed)', (s) => {
  it(s, 'importSeedIngly carica ≥128 prodotti nello store catalog', async () => {
    await withPage(url, async (page) => {
      const n = await page.evaluate(async () => {
        await window.Catalog.importSeedIngly();
        return (await window.IDB.getAll('catalog')).length;
      });
      assert(n >= 128, `attesi ≥128 prodotti, trovati ${n}`);
    });
  });

  it(s, 'i prodotti importati portano il payload "ingly" (tab scheda Ingly)', async () => {
    await withPage(url, async (page) => {
      const ok = await page.evaluate(async () => {
        await window.Catalog.importSeedIngly();
        const rows = await window.IDB.getAll('catalog');
        return rows.some((p) => p.ingly && (p.ingly.promptProduzione || p.ingly.seo || p.ingly.tecnologia));
      });
      assert(ok, 'nessun prodotto con payload .ingly — la scheda/tab Ingly resterebbe vuota');
    });
  });
});

describe('Backup ZIP', (s) => {
  it(s, 'BackupZIP.export() avvia il download Ingly_Backup_*.zip', async () => {
    await withPage(url, async (page) => {
      const dl = page.waitForEvent('download', { timeout: 20000 });
      await page.evaluate(() => window.BackupZIP.export());
      const download = await dl;
      const name = download.suggestedFilename();
      assert(/^Ingly_Backup_.*\.zip$/.test(name), `nome file inatteso: ${name}`);
    });
  });
});
