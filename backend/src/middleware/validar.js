// Validación central de datos de entrada (KAN-57, HT18).
//
// Un solo mecanismo para cuerpos, parámetros de ruta y query strings. Cada ruta declara un esquema:
//
//   router.post('/', validar({ body: { nombre: texto({ requerido: true, max: 255 }) } }), (req, res) => {
//     const { nombre } = req.datos.body;   // valores ya limpios y convertidos
//   });
//
// Si algún campo no cumple, responde 400 con el contrato de HT15 y la lista de campos inválidos:
//   { ..., "code": "DATOS_INVALIDOS", "errores": [{ "campo": "nombre", "motivo": "no puede estar vacío", "en": "body" }] }
//
// - Se revisan TODOS los campos y se devuelven todos los errores juntos, no solo el primero.
// - Los campos que no están en el esquema se ignoran.
// - `req.datos.{params,query,body}` solo trae los campos presentes, con su nombre canónico
//   (los alias, como peliculaId -> movieId, se resuelven aquí).
// - Las reglas entre varios campos (por ejemplo, "hasta" no puede ser anterior a "desde") van en `cruzada`.
import { ErrorValidacion } from './errors.js';
import { esEmail } from '../utils/validators.js';

// ───────────── lectura y reglas ─────────────

// Lee un campo por su nombre o alias; admite rutas con punto ("sucursal.branId")
function leer(fuente, nombres) {
  for (const nombre of nombres) {
    const v = nombre.includes('.')
      ? nombre.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), fuente)
      : fuente?.[nombre];
    if (v !== undefined) return v;
  }
  return undefined;
}

// Una regla es { requerido, alias, evaluar(valor, campo) }; evaluar devuelve
//   { valor }                    el valor limpio (puede ser null si venía vacío y es opcional)
//   { error: 'motivo' }          un error
//   { errores: [{ campo, motivo }] }   varios errores (por ejemplo, uno por elemento de una lista)
const regla = (opts, evaluar) => ({ requerido: false, alias: [], msgRequerido: 'es obligatorio', ...opts, evaluar });
const vacio = (v) => v === null || (typeof v === 'string' && v.trim() === '');

export const texto = (o = {}) => regla(o, (v) => {
  if (vacio(v)) return o.requerido ? { error: o.msgVacio ?? 'no puede estar vacío' } : { valor: null };
  if (typeof v !== 'string') return { error: 'debe ser texto' };
  const t = v.trim();
  if (o.min && t.length < o.min) return { error: `mínimo ${o.min} caracteres` };
  if (o.max && t.length > o.max) return { error: `máximo ${o.max} caracteres` };
  if (o.patron && !o.patron.test(t)) return { error: o.msgPatron ?? 'tiene un formato no válido' };
  return { valor: t };
});

// Contraseñas: no se recortan espacios
export const clave = (o = {}) => regla({ msgRequerido: 'es obligatoria', ...o }, (v) => {
  if (v === null || v === '') return { error: 'es obligatoria' };
  if (typeof v !== 'string') return { error: 'debe ser texto' };
  if (o.min && v.length < o.min) return { error: `debe tener mínimo ${o.min} caracteres` };
  if (o.maxBytes && Buffer.byteLength(v, 'utf8') > o.maxBytes) return { error: `máximo ${o.maxBytes} bytes (límite de bcrypt)` };
  return { valor: v };
});

const aNumeroEntero = (v) => {
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  if (typeof v === 'string' && /^-?\d{1,15}$/.test(v.trim())) return Number(v.trim());
  return NaN;
};

export const entero = (o = {}) => regla(o, (v) => {
  if (vacio(v)) return o.requerido ? { error: o.msgRequerido ?? 'es obligatorio' } : { valor: null };
  const n = aNumeroEntero(v);
  const min = o.min ?? -Infinity;
  const max = o.max ?? Infinity;
  if (Number.isNaN(n) || n < min || n > max) {
    return { error: o.motivo ?? (o.min !== undefined && o.max !== undefined ? `debe ser un entero entre ${o.min} y ${o.max}` : 'debe ser un número entero') };
  }
  return { valor: n };
});

// Id: entero positivo
export const idPositivo = (o = {}) => regla(o, (v) => {
  if (vacio(v)) return o.requerido ? { error: 'es obligatorio' } : { valor: null };
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,15}$/.test(v.trim()) ? Number(v.trim()) : NaN);
  return Number.isInteger(n) && n > 0 && n <= 999_999_999_999_999 ? { valor: n } : { error: 'debe ser un número positivo' };
});

export const numero = (o = {}) => regla(o, (v) => {
  if (vacio(v)) return o.requerido ? { error: 'es obligatorio' } : { valor: null };
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : NaN);
  const malo = !Number.isFinite(n) || (o.mayorQue !== undefined && n <= o.mayorQue) || (o.min !== undefined && n < o.min) || (o.max !== undefined && n > o.max);
  return malo ? { error: o.motivo ?? 'debe ser un número válido' } : { valor: n };
});

export const correo = (o = {}) => regla(o, (v) => {
  if (vacio(v)) return o.requerido || o.permiteVacio === false ? { error: 'debe ser un correo válido' } : { valor: null };
  const t = typeof v === 'string' ? v.trim() : '';
  if (o.max && t.length > o.max) return { error: `máximo ${o.max} caracteres` };
  return esEmail(t) ? { valor: t } : { error: 'debe ser un correo válido' };
});

// Fecha AAAA-MM-DD que exista de verdad (rechaza 2026-02-31)
export const esFecha = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
export const fecha = (o = {}) => regla({ msgRequerido: 'es obligatoria', ...o }, (v) => {
  if (vacio(v)) return o.requerido ? { error: 'es obligatoria' } : { valor: null };
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return { error: 'usa el formato AAAA-MM-DD' };
  return esFecha(v.trim()) ? { valor: v.trim() } : { error: 'no es una fecha válida' };
});

// Hora HH:mm (24 horas)
export const hora = (o = {}) => regla({ msgRequerido: 'es obligatoria', ...o }, (v) => {
  if (vacio(v)) return o.requerido ? { error: 'es obligatoria' } : { valor: null };
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim())
    ? { valor: v.trim() }
    : { error: 'usa el formato HH:mm (24 horas), por ejemplo 19:30' };
});

// Uno de una lista de valores. `equivalencias` convierte sinónimos ({ '3D': 'TRES_D' }); compara sin mayúsculas.
export const enumerado = (valores, o = {}) => regla(o, (v) => {
  if (vacio(v)) return o.requerido ? { error: 'es obligatorio' } : { valor: null };
  const t = typeof v === 'string' ? v.trim().toUpperCase() : '';
  const canonico = o.equivalencias?.[t] ?? t;
  return valores.includes(canonico) ? { valor: canonico } : { error: o.motivo ?? `debe ser uno de ${valores.join(', ')}` };
});

// true / false escritos como texto (query strings) o como booleano
export const booleano = (o = {}) => regla(o, (v) => {
  if (vacio(v)) return { valor: null };
  if (v === true || v === 'true') return { valor: true };
  if (v === false || v === 'false') return { valor: false };
  return { error: 'debe ser true o false' };
});

// Lista de elementos; cada uno se valida con `item` y los errores salen como campo[0], campo[1]...
export const lista = (item, o = {}) => regla(o, (v, campo) => {
  if (v === null) return o.requerido ? { error: o.msgVacia ?? 'indica al menos un elemento' } : { valor: null };
  if (!Array.isArray(v)) return { error: 'debe ser una lista' };
  if (v.length === 0) return o.requerido ? { error: o.msgVacia ?? 'indica al menos un elemento' } : { valor: [] };
  if (o.max && v.length > o.max) return { error: `máximo ${o.max} elementos` };
  const valores = []; const errores = [];
  v.forEach((x, i) => {
    const r = item.evaluar(x, `${campo}[${i}]`);
    if (r.error) errores.push({ campo: `${campo}[${i}]`, motivo: r.error });
    else valores.push(r.valor);
  });
  return errores.length ? { errores } : { valor: valores };
});

// Para reglas propias: fn(valor, campo) => { valor } | { error }
export const personalizada = (fn, o = {}) => regla(o, (v, campo) => fn(v, campo));

// ───────────── el middleware ─────────────

function aplicar(esquema, fuente, en, salida, errores) {
  for (const [campo, r] of Object.entries(esquema ?? {})) {
    const crudo = leer(fuente, [campo, ...r.alias]);
    if (crudo === undefined) {
      if (r.requerido) errores.push({ campo, motivo: r.msgRequerido, en });
      continue;
    }
    const res = r.evaluar(crudo, campo);
    if (res.errores) errores.push(...res.errores.map((e) => ({ ...e, en })));
    else if (res.error) errores.push({ campo, motivo: res.error, en });
    else salida[campo] = res.valor;
  }
}

export function validar({ params, query, body, cruzada } = {}) {
  return (req, _res, next) => {
    const errores = [];
    const datos = { params: {}, query: {}, body: {} };
    aplicar(params, req.params, 'params', datos.params, errores);
    aplicar(query, req.query, 'query', datos.query, errores);
    if (body) {
      const crudo = req.body ?? {};
      if (typeof crudo !== 'object' || Array.isArray(crudo)) {
        errores.push({ campo: 'cuerpo', motivo: 'debe ser un objeto JSON', en: 'body' });
      } else {
        aplicar(body, crudo, 'body', datos.body, errores);
      }
    }
    // Reglas entre varios campos: solo si los campos sueltos ya son válidos
    if (cruzada && !errores.length) {
      cruzada(datos, (campo, motivo, en = 'body') => errores.push({ campo, motivo, en }));
    }
    if (errores.length) return next(new ErrorValidacion(errores));
    req.datos = datos;
    next();
  };
}

// Atajo para las rutas con :id
export const PARAM_ID = { params: { id: idPositivo({ requerido: true }) } };
