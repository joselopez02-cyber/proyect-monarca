// KAN-51 (HU28): utilidades para armar un CSV que abra bien en Excel en español (Colombia):
// separador ";", decimales con coma, UTF-8 con BOM (tildes) y saltos de línea CRLF.

const SEPARADOR = ';';

// Texto: neutraliza fórmulas (=, +, -, @) y pone comillas si hace falta
export function texto(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[;"\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Número con dos decimales y coma decimal (los negativos son números, no se tocan)
export function numero(n) {
  return (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace('.', ',');
}

export function aCsv(filas) {
  return '\uFEFF' + filas.map((f) => f.join(SEPARADOR)).join('\r\n') + '\r\n';
}
