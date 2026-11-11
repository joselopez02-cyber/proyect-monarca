import assert from 'node:assert/strict';
import test from 'node:test';
import { clave, enumerado, idPositivo } from '../../src/middleware/validar.js';
import { esEmail } from '../../src/utils/validators.js';
import { TIPOS_PAGO, procesarPago } from '../../src/utils/pagoService.js';
import { calcularTotalReserva } from '../../src/utils/reservas.js';
import { reglaSillas, estadoVisible, MAX_SILLAS_POR_BLOQUEO } from '../../src/utils/sillas.js';

test('aprueba un pago con tarjeta válido', () => {
  const pago = procesarPago({ tipoPago: 'TARJETA_CREDITO', ultimos4: '1234', total: 25000 });
  assert.equal(pago.aprobado, true);
  assert.equal(pago.mensaje, 'Pago aprobado.');
  assert.match(pago.referencia, /^SIM-\d+-\d{3}$/);
});

test('rechaza una tarjeta terminada en 0000 por fondos insuficientes', () => {
  const pago = procesarPago({ tipoPago: 'TARJETA_DEBITO', ultimos4: '0000', total: 10000 });
  assert.equal(pago.aprobado, false);
  assert.match(pago.mensaje, /Fondos insuficientes/);
});

test('rechaza una tarjeta terminada en 1111 por bloqueo', () => {
  const pago = procesarPago({ tipoPago: 'TARJETA_CREDITO', ultimos4: '1111', total: 10000 });
  assert.equal(pago.aprobado, false);
  assert.match(pago.mensaje, /Tarjeta bloqueada/);
});

test('aprueba pagos con NEQUI y PSE', () => {
  for (const tipoPago of ['NEQUI', 'PSE']) {
    assert.equal(procesarPago({ tipoPago, total: 10000 }).aprobado, true);
  }
});

test('rechaza montos nulos, cero o negativos', () => {
  for (const total of [null, 0, -1]) {
    const pago = procesarPago({ tipoPago: 'PSE', total });
    assert.equal(pago.aprobado, false);
    assert.equal(pago.mensaje, 'Monto inválido.');
  }
});

test('acepta los tipos de pago admitidos y rechaza uno inválido', () => {
  const tipoPago = enumerado(TIPOS_PAGO, { requerido: true });
  assert.deepEqual(tipoPago.evaluar('nequi'), { valor: 'NEQUI' });
  assert.deepEqual(tipoPago.evaluar('EFECTIVO'), {
    error: `debe ser uno de ${TIPOS_PAGO.join(', ')}`,
  });
});

test('convierte identificadores numéricos positivos', () => {
  assert.deepEqual(idPositivo({ requerido: true }).evaluar('42'), { valor: 42 });
});

test('rechaza identificadores no numéricos y no positivos', () => {
  const id = idPositivo({ requerido: true });
  assert.deepEqual(id.evaluar('abc'), { error: 'debe ser un número positivo' });
  assert.deepEqual(id.evaluar('0'), { error: 'debe ser un número positivo' });
});

test('rechaza contraseñas menores al mínimo y conserva el valor válido', () => {
  const password = clave({ requerido: true, min: 6 });
  assert.deepEqual(password.evaluar('12345'), { error: 'debe tener mínimo 6 caracteres' });
  assert.deepEqual(password.evaluar('123456'), { valor: '123456' });
});

test('valida correos electrónicos y rechaza formatos inválidos', () => {
  assert.equal(esEmail('ana@example.com'), true);
  assert.equal(esEmail('ana@@example.com'), false);
});

test('calcula el total de una o varias sillas con redondeo a centavos', () => {
  assert.equal(calcularTotalReserva(12500, 1), 12500);
  assert.equal(calcularTotalReserva(12500.335, 2), 25000.67);
});

test('usa cero cuando el precio del boleto no es numérico', () => {
  assert.equal(calcularTotalReserva('no-numérico', 3), 0);
});

test('normaliza y elimina sillas repetidas sin distinguir mayúsculas', () => {
  assert.deepEqual(reglaSillas().evaluar(['a1', 'A01', 'b2']).valor, [
    { codigo: 'A1', fila: 'A', numero: 1 },
    { codigo: 'B2', fila: 'B', numero: 2 },
  ]);
});

test('rechaza listas de sillas vacías, códigos inválidos y más del máximo permitido', () => {
  const validarSillas = reglaSillas();
  assert.ok(validarSillas.evaluar([]).error);
  assert.ok(validarSillas.evaluar(['A0']).error);
  assert.ok(validarSillas.evaluar(Array(MAX_SILLAS_POR_BLOQUEO + 1).fill('A1')).error);
});

test('presenta sillas ocupadas, bloqueadas o disponibles según su estado', () => {
  assert.equal(estadoVisible({ estado: 'OCUPADA', reserva_id: null }), 'OCUPADA');
  assert.equal(estadoVisible({ estado: 'RESERVADA', reserva_id: null, bloqueo_activo: true }), 'BLOQUEADA');
  assert.equal(estadoVisible({ estado: 'RESERVADA', reserva_id: null, bloqueo_activo: false }), 'DISPONIBLE');
});
