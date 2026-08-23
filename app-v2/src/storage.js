// INGLY OS V2 — Storage immagini prodotto. Upload su Supabase Storage bucket
// 'catalog' (path per-tenant), URL pubblico salvato in catalog_product.image_url.
// Nessun binario in PostgreSQL. In demo (client senza .storage) NON finge la
// persistenza: ritorna un object URL locale marcato { local:true }.

export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'];
export const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// Valida tipo MIME e dimensione. Ritorna {ok} o {ok:false, error}.
export function validateImage(file) {
  if (!file) return { ok: false, error: 'Nessun file selezionato.' };
  if (!IMAGE_MIME.includes(file.type)) return { ok: false, error: 'Formato non valido. Usa PNG, JPG o WEBP.' };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: `File troppo grande (max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB).` };
  return { ok: true };
}

// Nome file sicuro: minuscole, solo [a-z0-9-_.], niente path traversal.
export function sanitizeFilename(name, mime) {
  const ext = IMAGE_EXT[mime] || 'bin';
  const base = String(name || 'img').toLowerCase().replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'img';
  const rand = (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())).slice(0, 8);
  return `${base}-${rand}.${ext}`;
}

export function hasStorage(sb) { return !!(sb && sb.storage && typeof sb.storage.from === 'function'); }

// Carica l'immagine. onProgress(0..1) opzionale (best-effort). Ritorna
// { url, path, local }. Lancia Error su validazione/upload falliti.
export async function uploadProductImage(sb, tenantId, file, onProgress) {
  const v = validateImage(file); if (!v.ok) throw new Error(v.error);
  const path = `${tenantId || 'demo'}/${sanitizeFilename(file.name, file.type)}`;
  if (onProgress) onProgress(0.1);

  if (!hasStorage(sb)) {
    // DEMO: nessuna persistenza reale — preview locale (object URL), marcata.
    let url = null;
    try {
      if (globalThis.URL && typeof URL.createObjectURL === 'function') url = URL.createObjectURL(file);
      else if (typeof FileReader !== 'undefined') url = await fileToDataUrl(file);
    } catch (_) { url = null; }
    if (!url) url = 'local:' + path; // ambiente senza API browser (test): marker, nessuna persistenza
    if (onProgress) onProgress(1);
    return { url, path, local: true };
  }
  const { error } = await sb.storage.from('catalog').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw new Error(error.message || 'Upload non riuscito.');
  if (onProgress) onProgress(0.9);
  const { data } = sb.storage.from('catalog').getPublicUrl(path);
  if (onProgress) onProgress(1);
  return { url: (data && data.publicUrl) || null, path, local: false };
}

// Rimuove un'immagine dallo Storage (best-effort; ignora in demo/local).
export async function removeProductImage(sb, path) {
  if (!path || !hasStorage(sb)) return true;
  try { await sb.storage.from('catalog').remove([path]); } catch (_) { /* best effort */ }
  return true;
}

function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = () => rej(new Error('lettura file fallita'));
    r.readAsDataURL(file);
  });
}
