// Contrato estándar de errores de la API (KAN-54, HT15).
// Toda respuesta de error, de cualquier endpoint, tiene este cuerpo:
//   { timestamp, status, error, code, path }
//   timestamp: momento del error (ISO 8601)        status: código HTTP
//   error:     mensaje legible para la persona      path:   ruta pedida (sin query string)
//   errores:   solo en errores de validación (KAN-57, HT18): [{ campo, motivo, en }] con cada campo inválido
//   code:      identificador estable (MAYUSCULAS_CON_GUION_BAJO). El frontend debe decidir con el
//              código, no con el texto del mensaje, que puede cambiar. Catálogo: backend/docs/codigos-de-error.md

// Código por defecto cuando un error no trae uno propio
const CODIGO_POR_ESTADO = {
  400: 'SOLICITUD_INVALIDA',
  401: 'NO_AUTENTICADO',
  403: 'ACCESO_DENEGADO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  413: 'CUERPO_DEMASIADO_GRANDE',
  415: 'TIPO_DE_CONTENIDO_NO_SOPORTADO',
  429: 'DEMASIADAS_PETICIONES',
  500: 'ERROR_INTERNO',
  503: 'SERVICIO_NO_DISPONIBLE',
};

// Error con código HTTP y código estable. Se lanza desde las rutas:
//   throw new HttpError(409, 'Esta reserva ya está pagada.', 'RESERVA_YA_PAGADA')
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || CODIGO_POR_ESTADO[status] || 'ERROR';
  }
}

// Datos de entrada inválidos (los lanza middleware/validar.js). Lleva la lista de campos con su motivo.
export class ErrorValidacion extends HttpError {
  constructor(errores) {
    super(400, errores.map((e) => `${e.campo}: ${e.motivo}`).join(', '), 'DATOS_INVALIDOS');
    this.errores = errores;
  }
}

export function cuerpoError(req, status, mensaje, codigo, extra = {}) {
  return {
    timestamp: new Date().toISOString(),
    status,
    error: mensaje,
    code: codigo || CODIGO_POR_ESTADO[status] || 'ERROR',
    path: (req.originalUrl || req.url || '').split('?')[0],
    ...extra,
  };
}

export function enviarError(req, res, status, mensaje, codigo, extra) {
  res.status(status).json(cuerpoError(req, status, mensaje, codigo, extra));
}

export function notFound(req, res) {
  enviarError(req, res, 404, 'Recurso no encontrado.', 'RUTA_NO_ENCONTRADA');
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') {
    return enviarError(req, res, 400, 'El cuerpo de la petición no es un JSON válido.', 'JSON_INVALIDO');
  }
  if (err.type === 'entity.too.large') {
    return enviarError(req, res, 413, 'El cuerpo de la petición es demasiado grande.', 'CUERPO_DEMASIADO_GRANDE');
  }
  if (err instanceof HttpError) {
    return enviarError(req, res, err.status, err.message, err.code, err.errores ? { errores: err.errores } : undefined);
  }
  // 23505 = violación de restricción UNIQUE en PostgreSQL (dos peticiones a la vez)
  if (err.code === '23505') {
    return enviarError(req, res, 400, 'Ya existe un registro con esos datos.', 'REGISTRO_DUPLICADO');
  }
  // Otros errores de cliente de los middlewares (por ejemplo, un charset no soportado): sin exponer el detalle interno
  const estado = Number(err.status ?? err.statusCode);
  if (estado >= 400 && estado < 500) {
    return enviarError(req, res, estado, 'Solicitud inválida.', CODIGO_POR_ESTADO[estado] || 'SOLICITUD_INVALIDA');
  }
  console.error(err);
  enviarError(req, res, 500, 'Error interno del servidor.', 'ERROR_INTERNO');
}
