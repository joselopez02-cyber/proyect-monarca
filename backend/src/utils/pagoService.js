// KAN-12 (HT04): simulador de pasarela de pago (PagoService).
// No llama a ningún proveedor real: decide aprobado/rechazado con reglas fijas, para poder probar siempre igual.
//   - Tarjeta (crédito/débito): se RECHAZA si el número termina en 0000 (tarjeta sin fondos) o en 1111 (tarjeta bloqueada).
//   - Nequi / PSE: se aprueban (si mandas "telefono"/"banco" no se valida nada más).
export const TIPOS_PAGO = ['TARJETA_CREDITO', 'TARJETA_DEBITO', 'NEQUI', 'PSE'];
export const esTarjeta = (tipo) => tipo === 'TARJETA_CREDITO' || tipo === 'TARJETA_DEBITO';

const MOTIVOS_RECHAZO = {
  '0000': 'Fondos insuficientes.',
  '1111': 'Tarjeta bloqueada por el banco.',
};

// Devuelve { aprobado, mensaje, referencia }
export function procesarPago({ tipoPago, ultimos4, total }) {
  const referencia = 'SIM-' + Date.now() + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  if (!(total > 0)) return { aprobado: false, mensaje: 'Monto inválido.', referencia };
  if (esTarjeta(tipoPago) && MOTIVOS_RECHAZO[ultimos4]) {
    return { aprobado: false, mensaje: `Pago rechazado: ${MOTIVOS_RECHAZO[ultimos4]}`, referencia };
  }
  return { aprobado: true, mensaje: 'Pago aprobado.', referencia };
}
