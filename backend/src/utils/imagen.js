import { HttpError } from '../middleware/errors.js';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB de imagen

// Primeros bytes reales de cada formato: así no basta con escribir "data:image/png" para colar otra cosa
const FIRMAS = {
  'image/png': (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
};

// Acepta una imagen en Base64 ("data:image/png;base64,....") o un enlace https.
// Devuelve el texto listo para guardar en pelicula.poster_url.
export function validarPoster(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new HttpError(400, 'posterUrl: es obligatorio.');
  }
  const v = valor.trim();

  if (/^https:\/\//i.test(v)) {
    if (v.length > 500 || /\s/.test(v)) throw new HttpError(400, 'posterUrl: el enlace no es válido.');
    try { new URL(v); } catch { throw new HttpError(400, 'posterUrl: el enlace no es válido.'); }
    return v;
  }

  if (v.length > Math.ceil((MAX_BYTES * 4) / 3) + 100) {
    throw new HttpError(400, 'El póster supera el máximo de 2 MB.');
  }
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);
  if (!m) {
    throw new HttpError(400, 'posterUrl: debe ser una imagen PNG, JPEG o WEBP en Base64 (data:image/...;base64,...) o un enlace https.');
  }
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_BYTES) throw new HttpError(400, 'El póster supera el máximo de 2 MB.');
  if (!FIRMAS[m[1]](bytes)) {
    throw new HttpError(400, `posterUrl: el contenido no es una imagen ${m[1].slice(6).toUpperCase()} válida.`);
  }
  return v;
}
