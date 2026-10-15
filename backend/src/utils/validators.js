import { HttpError } from '../middleware/errors.js';

// Devuelve el texto sin espacios sobrantes, o null si viene vacío o no es texto
export const texto = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export const esEmail = (v) => {
  if (typeof v !== 'string' || v.length > 254) return false;
  const at = v.indexOf('@');
  if (at <= 0 || at !== v.lastIndexOf('@')) return false;

  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.length > 64 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) {
    return false;
  }

  const labels = domain.split('.');
  return labels.length >= 2
    && labels.every((label) => label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))
    && /^[A-Za-z]{2,63}$/.test(labels.at(-1));
};

// Convierte el id de la URL en número o lanza 400
export function parseId(valor) {
  if (!/^\d{1,15}$/.test(String(valor)) || Number(valor) <= 0) {
    throw new HttpError(400, 'El id debe ser un número positivo.');
  }
  return Number(valor);
}
