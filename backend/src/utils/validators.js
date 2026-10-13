import { HttpError } from '../middleware/errors.js';

// Devuelve el texto sin espacios sobrantes, o null si viene vacío o no es texto
export const texto = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export const esEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Convierte el id de la URL en número o lanza 400
export function parseId(valor) {
  if (!/^\d{1,15}$/.test(String(valor)) || Number(valor) <= 0) {
    throw new HttpError(400, 'El id debe ser un número positivo.');
  }
  return Number(valor);
}
