import { HttpError } from '../middleware/errors.js';

// Descanso mínimo entre el final de una función y el inicio de la siguiente en la misma sala
// (limpieza). Cámbialo aquí si quieren otro margen. 0 = solo se prohíbe que se solapen.
export const MARGEN_MIN = 15;
export const MAX_DIAS = 31;      // máximo de días por rango
export const MAX_HORARIOS = 8;   // máximo de horarios por día

// Las funciones se guardan con fecha y hora de Colombia; el servidor puede estar en otra zona horaria
export const ZONA = process.env.ZONA_HORARIA || 'America/Bogota';

const UN_DIA_MS = 24 * 60 * 60 * 1000;

// Fecha en formato AAAA-MM-DD y que exista de verdad (rechaza 2026-02-31)
export function validarFecha(v, campo = 'fecha') {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new HttpError(400, `${campo}: usa el formato AAAA-MM-DD.`);
  }
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    throw new HttpError(400, `${campo}: no es una fecha válida.`);
  }
  return v;
}

// Hora en formato HH:mm (24 horas)
export function validarHora(v, campo = 'hora') {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
    throw new HttpError(400, `${campo}: usa el formato HH:mm (24 horas), por ejemplo 19:30.`);
  }
  return v;
}

// Suma n días a una fecha AAAA-MM-DD (n puede ser negativo)
export function moverDia(fecha, n) {
  return new Date(new Date(`${fecha}T00:00:00Z`).getTime() + n * UN_DIA_MS).toISOString().slice(0, 10);
}

// Número de días entre dos fechas, ambas incluidas
export function diasEnRango(inicio, fin) {
  return Math.round((new Date(`${fin}T00:00:00Z`) - new Date(`${inicio}T00:00:00Z`)) / UN_DIA_MS) + 1;
}

// Todas las fechas del rango, ambas incluidas
export function fechasEntre(inicio, fin) {
  const out = [];
  for (let f = inicio; f <= fin; f = moverDia(f, 1)) out.push(f);
  return out;
}

// "19:30" + 148 minutos = "21:58" (da la vuelta si pasa de medianoche)
export function sumarMinutos(hora, minutos) {
  const [h, m] = hora.split(':').map(Number);
  const total = (h * 60 + m + minutos) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
