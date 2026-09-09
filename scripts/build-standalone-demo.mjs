// INGLY OS V2 — build demo STANDALONE self-contained.
// Genera app-v2/ingly-smart-quoter-demo.html: un unico file HTML apribile col
// doppio click (file://), senza server. Inlinea tutti i moduli ES di app-v2/src
// (bundle esbuild) e styles.css nel test-demo.html. È un ARTEFATTO (gitignored):
// rigeneralo con `npm run demo:standalone`.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app-v2');
const OUT = join(APP, 'ingly-smart-quoter-demo.html');
const ESBUILD = join(ROOT, 'node_modules', '.bin', 'esbuild');

const html = readFileSync(join(APP, 'test-demo.html'), 'utf8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) throw new Error('Blocco <script type="module"> non trovato in test-demo.html');

// L'entry deve stare dentro app-v2 così gli import "./src/..." risolvono.
const entry = join(APP, '__standalone_entry.tmp.js');
writeFileSync(entry, m[1]);
try {
  execFileSync(ESBUILD, [entry, '--bundle', '--format=iife', '--platform=browser', '--outfile=' + entry + '.out.js'], { stdio: 'inherit' });
} finally {
  try { unlinkSync(entry); } catch (_) { /* noop */ }
}
const bundle = readFileSync(entry + '.out.js', 'utf8');
unlinkSync(entry + '.out.js');
const css = readFileSync(join(APP, 'src', 'styles.css'), 'utf8');

const out = html
  .replace(/<link rel="stylesheet" href="\.\/src\/styles\.css">/, `<style>\n${css}\n</style>`)
  .replace(/<script type="module">[\s\S]*?<\/script>/, `<script>\n${bundle}\n</script>`);
writeFileSync(OUT, out);
console.log(`✅ Demo standalone: ${OUT} (${(out.length / 1024).toFixed(0)} KB) — aprila col doppio click.`);
