import { Router } from 'express';
import pool from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { parseId, texto, esEmail } from '../utils/validators.js';

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

async function buscar(id) {
  const { rows } = await pool.query('SELECT * FROM cliente WHERE cust_id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, `Cliente no encontrado con id: ${id}`);
  return rows[0];
}

// Verifica que el cliente sea de quien llama (o que sea ADMIN)
function exigirDuenio(req, fila) {
  if (!esAdmin(req) && Number(fila.usuario_id) !== req.user.usuarioId) {
    throw new HttpError(403, 'No puedes ver ni modificar los datos de otro cliente.');
  }
}

// Acepta los nombres de la base (nombreCliente, direccionCliente, numeroCliente) y los cortos (email, telefono)
function validarCliente(b) {
  const nombre = texto(b.nombreCliente ?? b.nombre);
  const email = texto(b.email);
  const direccion = email ?? texto(b.direccionCliente);
  const numero = texto(b.telefono ?? b.numeroCliente);
  const edad = b.custAge === undefined || b.custAge === null || b.custAge === '' ? null : Number(b.custAge);

  const errores = [];
  if (!nombre) errores.push('nombreCliente: no puede estar vacío');
  else if (nombre.length > 255) errores.push('nombreCliente: máximo 255 caracteres');
  if (edad !== null && (!Number.isInteger(edad) || edad < 0 || edad > 120)) errores.push('custAge: debe ser un entero entre 0 y 120');
  if (email && !esEmail(email)) errores.push('email: debe ser un correo válido');
  if (direccion && direccion.length > 500) errores.push('direccionCliente: máximo 500 caracteres');
  if (numero && numero.length > 50) errores.push('telefono: máximo 50 caracteres');
  if (errores.length) throw new HttpError(400, errores.join(', '));

  return { nombre, edad, direccion, numero };
}

// Listado. Un ADMIN ve todos; los demás, solo el suyo. Filtros opcionales: ?nombre= &email=
router.get('/', requireAuth, async (req, res) => {
  const cond = [];
  const params = [];
  if (!esAdmin(req)) { params.push(req.user.usuarioId); cond.push(`usuario_id = $${params.length}`); }
  const email = typeof req.query.email === 'string' ? req.query.email.trim() : '';
  if (email) { params.push(email); cond.push(`LOWER(direccion_cliente) = LOWER($${params.length})`); }
  const nombre = typeof req.query.nombre === 'string' ? req.query.nombre.trim() : '';
  if (nombre) { params.push(nombre.replace(/[\\%_]/g, '\\$&')); cond.push(`nombre_cliente ILIKE '%' || $${params.length} || '%'`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM cliente ${where} ORDER BY cust_id`, params);
  res.json(rows.map(aCliente));
});

router.get('/:id', requireAuth, async (req, res) => {
  const fila = await buscar(parseId(req.params.id));
  exigirDuenio(req, fila);
  res.json(aCliente(fila));
});

// Registrar mis datos de cliente (uno por cuenta). Un ADMIN puede crear clientes sin cuenta (por ejemplo, de mostrador).
router.post('/', requireAuth, async (req, res) => {
  const v = validarCliente(req.body ?? {});
  const usuarioId = esAdmin(req) ? null : req.user.usuarioId;

  if (usuarioId !== null) {
    const { rows } = await pool.query('SELECT cust_id FROM cliente WHERE usuario_id = $1', [usuarioId]);
    if (rows[0]) {
      throw new HttpError(409, `Ya tienes tus datos de cliente registrados (custId ${rows[0].cust_id}). Actualízalos con PUT /api/clientes/${rows[0].cust_id}.`);
    }
  }
  const { rows } = await pool.query(
    `INSERT INTO cliente (nombre_cliente, cust_age, direccion_cliente, numero_cliente, usuario_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [v.nombre, v.edad, v.direccion, v.numero, usuarioId]);
  res.status(201).json(aCliente(rows[0]));
});

router.put('/:id', requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  exigirDuenio(req, await buscar(id));
  const v = validarCliente(req.body ?? {});
  const { rows } = await pool.query(
    `UPDATE cliente SET nombre_cliente = $1, cust_age = $2, direccion_cliente = $3, numero_cliente = $4
      WHERE cust_id = $5 RETURNING *`,
    [v.nombre, v.edad, v.direccion, v.numero, id]);
  res.json(aCliente(rows[0]));
});

// Solo ADMIN, y no si el cliente ya tiene reservas (se perdería su historial)
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const id = parseId(req.params.id);
  await buscar(id);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM reserva WHERE cust_id = $1', [id]);
  if (rows[0].n > 0) throw new HttpError(409, `No se puede eliminar: el cliente tiene ${rows[0].n} reserva(s).`);
  await pool.query('DELETE FROM cliente WHERE cust_id = $1', [id]);
  res.status(204).end();
});

export default router;
