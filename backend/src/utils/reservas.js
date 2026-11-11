export function calcularTotalReserva(precioBoleto, cantidadSillas) {
  return Math.round((Number(precioBoleto) || 0) * cantidadSillas * 100) / 100;
}
