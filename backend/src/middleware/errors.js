// Error con código HTTP. Se lanza desde las rutas: throw new HttpError(400, '...')
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Mismo formato de error que el backend original: { timestamp, error }
const cuerpo = (mensaje) => ({ timestamp: new Date().toISOString(), error: mensaje });

export function notFound(_req, res) {
  res.status(404).json(cuerpo('Recurso no encontrado.'));
}

// Express exige 4 parámetros para reconocer un manejador de errores
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(cuerpo('El cuerpo de la petición no es un JSON válido.'));
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json(cuerpo('El cuerpo de la petición es demasiado grande.'));
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json(cuerpo(err.message));
  }
  // 23505 = violación de restricción UNIQUE en PostgreSQL (dos peticiones a la vez)
  if (err.code === '23505') {
    return res.status(400).json(cuerpo('Ya existe un registro con esos datos.'));
  }
  console.error(err);
  res.status(500).json(cuerpo('Error interno del servidor.'));
}
