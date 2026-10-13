// Protección anti fuerza bruta para el login (en memoria).
// Reglas del original: 5 fallos en 60 s bloquean la IP durante 300 s.
const MAX_INTENTOS = 5;
const VENTANA_MS = 60_000;
const BLOQUEO_MS = 300_000;

const cubos = new Map(); // ip -> { intentos, inicio, bloqueadoHasta }

export function segundosBloqueado(ip) {
  const c = cubos.get(ip);
  if (!c?.bloqueadoHasta || Date.now() >= c.bloqueadoHasta) return 0;
  return Math.ceil((c.bloqueadoHasta - Date.now()) / 1000);
}

export function registrarFallo(ip) {
  const ahora = Date.now();
  let c = cubos.get(ip);
  if (!c || ahora - c.inicio > VENTANA_MS) {
    c = { intentos: 0, inicio: ahora, bloqueadoHasta: null };
  }
  c.intentos += 1;
  if (c.intentos >= MAX_INTENTOS) c.bloqueadoHasta = ahora + BLOQUEO_MS;
  cubos.set(ip, c);
}

export function registrarExito(ip) {
  cubos.delete(ip);
}

// Limpia entradas vencidas para que el mapa no crezca sin límite
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, c] of cubos) {
    const ventanaVencida = ahora - c.inicio > VENTANA_MS;
    const bloqueoVencido = !c.bloqueadoHasta || ahora >= c.bloqueadoHasta;
    if (ventanaVencida && bloqueoVencido) cubos.delete(ip);
  }
}, 60_000).unref();
