import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validar, texto, entero, correo, PARAM_ID } from '../middleware/validar.js';

const router = Router();

// Un cliente son los datos de quien compra (nombre, edad, correo, teléfono).
// Cada cuenta tiene el suyo y solo ella (o un ADMIN) puede verlo o cambiarlo.
// En la base, el correo está en direccion_cliente y el teléfono en numero_cliente.
const aCliente = (r) => ({
  custId: Number(r.cust_id),
  nombreCliente: r.nombre_cliente,
  custAge: r.cust_age,
  direccionCliente: r.direccion_cliente,
  numeroCliente: r.numero_cliente,
  email: r.direccion_cliente,
  telefono: r.numero_cliente,
});

const esAdmin = (req) => req.user.rol === 'ADMIN';

// Esquemas de entrada (KAN-57). nombre y numeroCliente son alias del backend anterior.
const CLIENTE = {
  nombreCliente: texto({ requerido: true, max: 255, alias: ['nombre'] }),
  custAge: entero({ min: 0, max: 120, motivo: 'debe ser un entero entre 0 y 120' }),
  email: correo({ max: 254 }),
  direccionCliente: texto({ max: 500 }),
  telefono: texto({ max: 50, alias: ['numeroCliente'] }),
};
// El email, si viene, se guarda como dirección del cliente
const datosCliente = (b) => ({
  nombre: b.nombreCliente,
  edad: b.custAge ?? null,
  direccion: b.email ?? b.direccionCliente ?? null,
  numero: b.telefono ?? null,
});

async function buscar(id) {
  const { rows } = await pool.query('SELECT * FROM cliente WHERE cust_id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, `Cliente no encontrado con id: ${id}`, 'CLIENTE_NO_ENCONTRADO');
  return rows[0];
}

// Verifica que el cliente sea de quien llama (o que sea ADMIN)
function exigirDuenio(req, fila) {
  if (!esAdmin(req) && Number(fila.usuario_id) !== req.user.usuarioId) {
    throw new HttpError(403, 'No puedes ver ni modificar los datos de otro cliente.', 'CLIENTE_AJENO');
  }
}

// Listado. Un ADMIN ve todos; los demás, solo el suyo. Filtros opcionales: ?nombre= &email=
router.get('/', requireAuth, validar({ query: { email: texto({ max: 254 }), nombre: texto({ max: 255 }) } }), async (req, res) => {
  const cond = [];
  const params = [];
  if (!esAdmin(req)) { params.push(req.user.usuarioId); cond.push(`usuario_id = $${params.length}`); }
  const email = req.datos.query.email ?? '';
  if (email) { params.push(email); cond.push(`LOWER(direccion_cliente) = LOWER($${params.length})`); }
  const nombre = req.datos.query.nombre ?? '';
  if (nombre) { params.push(nombre.replace(/[\\%_]/g, '\\$&')); cond.push(`nombre_cliente ILIKE '%' || $${params.length} || '%'`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM cliente ${where} ORDER BY cust_id`, params);
  res.json(rows.map(aCliente));
});

router.get('/:id', requireAuth, validar(PARAM_ID), async (req, res) => {
  const fila = await buscar(req.datos.params.id);
  exigirDuenio(req, fila);
  res.json(aCliente(fila));
});

// Registrar mis datos de cliente (uno por cuenta). Un ADMIN puede crear clientes sin cuenta (por ejemplo, de mostrador).
router.post('/', requireAuth, validar({ body: CLIENTE }), async (req, res) => {
  const v = datosCliente(req.datos.body);
  const usuarioId = esAdmin(req) ? null : req.user.usuarioId;

  if (usuarioId !== null) {
    const { rows } = await pool.query('SELECT cust_id FROM cliente WHERE usuario_id = $1', [usuarioId]);
    if (rows[0]) {
      throw new HttpError(409, `Ya tienes tus datos de cliente registrados (custId ${rows[0].cust_id}). Actualízalos con PUT /api/clientes/${rows[0].cust_id}.`, 'CLIENTE_YA_REGISTRADO');
    }
  }
  const { rows } = await pool.query(
    `INSERT INTO cliente (nombre_cliente, cust_age, direccion_cliente, numero_cliente, usuario_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [v.nombre, v.edad, v.direccion, v.numero, usuarioId]);
  res.status(201).json(aCliente(rows[0]));
});

router.put('/:id', requireAuth, validar({ ...PARAM_ID, body: CLIENTE }), async (req, res) => {
  const { id } = req.datos.params;
  exigirDuenio(req, await buscar(id));
  const v = datosCliente(req.datos.body);
  const { rows } = await pool.query(
    `UPDATE cliente SET nombre_cliente = $1, cust_age = $2, direccion_cliente = $3, numero_cliente = $4
      WHERE cust_id = $5 RETURNING *`,
    [v.nombre, v.edad, v.direccion, v.numero, id]);
  res.json(aCliente(rows[0]));
});

// Solo ADMIN, y no si el cliente ya tiene reservas (se perdería su historial)
router.delete('/:id', requireAuth, requireRole('ADMIN'), validar(PARAM_ID), async (req, res) => {
  const { id } = req.datos.params;
  await buscar(id);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM reserva WHERE cust_id = $1', [id]);
  if (rows[0].n > 0) throw new HttpError(409, `No se puede eliminar: el cliente tiene ${rows[0].n} reserva(s).`, 'CLIENTE_CON_RESERVAS');
  await pool.query('DELETE FROM cliente WHERE cust_id = $1', [id]);
  res.status(204).end();
});

export default router;
