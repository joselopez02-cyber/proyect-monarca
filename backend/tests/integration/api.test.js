import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, describe, it } from 'node:test';
import request from 'supertest';
import app from '../../src/app.js';
import pool from '../../src/db.js';

const password = 'Integration-123!';
const resources = {
  users: [],
  clients: [],
  functions: [],
  movies: [],
  rooms: [],
  branches: [],
  cinemas: [],
  reservations: [],
};

async function registerUser() {
  const username = `it_${randomUUID().replaceAll('-', '')}`;
  const email = `${username}@example.test`;
  const response = await request(app)
    .post('/api/auth/register')
    .send({ username, password, email, nombreCompleto: 'Usuario de Integración' })
    .expect(201);

  resources.users.push(response.body.usuarioId);
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username, password })
    .expect(200);

  return { ...login.body, username, email };
}

async function registerClient(token) {
  const response = await request(app)
    .post('/api/clientes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      nombreCliente: 'Cliente de Integración',
      custAge: 25,
      email: `cliente_${randomUUID().replaceAll('-', '')}@example.test`,
      telefono: '3001234567',
    })
    .expect(201);

  resources.clients.push(response.body.custId);
  return response.body;
}

async function createFunction({ fecha, hora = '23:50' } = {}) {
  const { rows: cinemaRows } = await pool.query(
    'INSERT INTO cine (nombre_del_cine, cine_cont) VALUES ($1, $2) RETURNING cine_id',
    [`Cine integración ${randomUUID()}`, 'Integración']);
  const cinemaId = Number(cinemaRows[0].cine_id);
  resources.cinemas.push(cinemaId);

  const { rows: branchRows } = await pool.query(
    'INSERT INTO sucursal (bran_location, cine_id) VALUES ($1, $2) RETURNING bran_id',
    [`Sucursal integración ${randomUUID()}`, cinemaId]);
  const branchId = Number(branchRows[0].bran_id);
  resources.branches.push(branchId);

  const { rows: roomRows } = await pool.query(
    `INSERT INTO sala (nombre, tipo, capacidad, filas, columnas, sucursal_id)
     VALUES ($1, 'DOS_D', 4, 2, 2, $2) RETURNING sala_id`,
    [`Sala integración ${randomUUID()}`, branchId]);
  const roomId = Number(roomRows[0].sala_id);
  resources.rooms.push(roomId);

  const { rows: movieRows } = await pool.query(
    `INSERT INTO pelicula (nombre, descripcion, duracion_min, genero, clasificacion)
     VALUES ($1, 'Película de fixture', 90, 'Drama', 'TE') RETURNING movie_id`,
    [`Película integración ${randomUUID()}`]);
  const movieId = Number(movieRows[0].movie_id);
  resources.movies.push(movieId);

  const futureDate = fecha ?? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { rows: functionRows } = await pool.query(
    `INSERT INTO funcion
       (movie_id, sala_id, fecha, hora_inicio, precio_boleto, capacidad_total, asientos_disponibles)
     VALUES ($1, $2, $3, $4, 12500, 4, 4) RETURNING funcion_id`,
    [movieId, roomId, futureDate, hora]);
  const functionId = Number(functionRows[0].funcion_id);
  resources.functions.push(functionId);
  return functionId;
}

async function createReservation(token, functionId, seat = 'A1') {
  await request(app)
    .post('/api/sillas/bloquear')
    .set('Authorization', `Bearer ${token}`)
    .send({ funcionId: functionId, codigos: [seat] })
    .expect(200);

  const response = await request(app)
    .post('/api/reservas')
    .set('Authorization', `Bearer ${token}`)
    .send({ funcionId: functionId, sillas: [seat] })
    .expect(201);

  resources.reservations.push(response.body.resCode);
  return response.body;
}

async function cleanup() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM transaccion
        WHERE cust_id = ANY($1::bigint[]) OR res_code = ANY($2::bigint[])`,
      [resources.clients, resources.reservations]);
    await client.query(
      `DELETE FROM reserva
        WHERE cust_id = ANY($1::bigint[]) OR res_code = ANY($2::bigint[])`,
      [resources.clients, resources.reservations]);
    await client.query('DELETE FROM cliente WHERE cust_id = ANY($1::bigint[])', [resources.clients]);
    await client.query('DELETE FROM funcion WHERE funcion_id = ANY($1::bigint[])', [resources.functions]);
    await client.query('DELETE FROM pelicula WHERE movie_id = ANY($1::bigint[])', [resources.movies]);
    await client.query('DELETE FROM sala WHERE sala_id = ANY($1::bigint[])', [resources.rooms]);
    await client.query('DELETE FROM sucursal WHERE bran_id = ANY($1::bigint[])', [resources.branches]);
    await client.query('DELETE FROM cine WHERE cine_id = ANY($1::bigint[])', [resources.cinemas]);
    await client.query('DELETE FROM usuario WHERE usuario_id = ANY($1::bigint[])', [resources.users]);
    await client.query('COMMIT');
    for (const ids of Object.values(resources)) ids.length = 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

describe('Flujos de integración de la API con PostgreSQL', () => {
  before(async () => {
    const { rows } = await pool.query(
      `SELECT version FROM schema_migrations WHERE version IN (1, 2, 3, 4) ORDER BY version`);
    assert.deepEqual(rows.map((row) => Number(row.version)), [1, 2, 3, 4],
      'La base TEST_DATABASE_URL debe tener aplicadas las migraciones 001 a 004.');
    await pool.query('SELECT 1 FROM usuario, cliente, funcion, reserva, transaccion, silla LIMIT 0');
  });

  afterEach(cleanup);
  after(() => pool.end());

  it('registra una cuenta, inicia sesión y permite consultar/actualizar el perfil', async () => {
    const user = await registerUser();

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    assert.equal(me.body.usuarioId, user.usuarioId);
    assert.equal(me.body.email, user.email);

    await request(app)
      .patch(`/api/usuarios/${user.usuarioId}/perfil`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ telefono: '3009876543' })
      .expect(200);
    const { rows } = await pool.query(
      'SELECT telefono FROM usuario WHERE usuario_id = $1', [user.usuarioId]);
    assert.equal(rows[0].telefono, '3009876543');
  });

  it('lista funciones futuras de la cartelera y excluye las que ya iniciaron', async () => {
    const pastFunctionId = await createFunction({ fecha: '2000-01-01', hora: '23:50' });
    const futureFunctionId = await createFunction();

    const response = await request(app)
      .get('/api/funciones/vigentes?page=1&size=100')
      .expect(200);
    const listedIds = response.body.content.map((funcion) => funcion.funcionId);

    assert.ok(listedIds.includes(futureFunctionId));
    assert.ok(!listedIds.includes(pastFunctionId));
    assert.equal(response.body.totalElementos, 1);
  });

  it('crea y paga una reserva, que queda confirmada en la API y en PostgreSQL', async () => {
    const user = await registerUser();
    const customer = await registerClient(user.token);
    const functionId = await createFunction();
    const reservation = await createReservation(user.token, functionId);

    const payment = await request(app)
      .post('/api/pagos/procesar')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ resCode: reservation.resCode, tipoPago: 'PSE' })
      .expect(201);
    assert.equal(payment.body.estadoPago, 'APROBADO');
    assert.equal(payment.body.estadoReserva, 'CONFIRMADA');
    assert.equal(payment.body.pagoTotal, 12500);

    const { rows } = await pool.query(
      'SELECT estado, cust_id FROM reserva WHERE res_code = $1', [reservation.resCode]);
    assert.equal(rows[0].estado, 'CONFIRMADA');
    assert.equal(Number(rows[0].cust_id), customer.custId);
  });

  it('mantiene PENDIENTE la reserva cuando se rechaza el pago', async () => {
    const user = await registerUser();
    await registerClient(user.token);
    const reservation = await createReservation(user.token, await createFunction());

    const payment = await request(app)
      .post('/api/pagos/procesar')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        resCode: reservation.resCode,
        tipoPago: 'TARJETA_CREDITO',
        numeroTarjeta: '4111111111110000',
      })
      .expect(201);
    assert.equal(payment.body.estadoPago, 'RECHAZADO');
    assert.equal(payment.body.estadoReserva, 'PENDIENTE');

    const { rows } = await pool.query(
      'SELECT estado FROM reserva WHERE res_code = $1', [reservation.resCode]);
    assert.equal(rows[0].estado, 'PENDIENTE');
  });

  it('impide que un cliente consulte o pague la reserva de otro', async () => {
    const owner = await registerUser();
    await registerClient(owner.token);
    const reservation = await createReservation(owner.token, await createFunction());
    const stranger = await registerUser();

    const view = await request(app)
      .get(`/api/reservas/${reservation.resCode}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(403);
    assert.equal(view.body.code, 'RESERVA_AJENA');

    const payment = await request(app)
      .post('/api/pagos/procesar')
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ resCode: reservation.resCode, tipoPago: 'PSE' })
      .expect(403);
    assert.equal(payment.body.code, 'RESERVA_AJENA');

    const { rows } = await pool.query(
      'SELECT estado FROM reserva WHERE res_code = $1', [reservation.resCode]);
    assert.equal(rows[0].estado, 'PENDIENTE');
  });

  it('expone en el historial del cliente el pago aprobado y conserva su persistencia', async () => {
    const user = await registerUser();
    const customer = await registerClient(user.token);
    const reservation = await createReservation(user.token, await createFunction());
    await request(app)
      .post('/api/pagos/procesar')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ resCode: reservation.resCode, tipoPago: 'NEQUI' })
      .expect(201);

    const history = await request(app)
      .get(`/api/transacciones/cliente/${customer.custId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    assert.equal(history.body.content.length, 1);
    assert.equal(history.body.content[0].estadoPago, 'APROBADO');
    assert.equal(history.body.content[0].resCode, reservation.resCode);

    const { rows } = await pool.query(
      'SELECT estado_pago FROM transaccion WHERE res_code = $1', [reservation.resCode]);
    assert.equal(rows[0].estado_pago, 'APROBADO');
  });
});
