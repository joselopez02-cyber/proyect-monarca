-- KAN-61: primera migración "real" sobre el esquema base.
-- Indices para las consultas de ocupación, comprobantes e historial de pagos.

-- up
CREATE INDEX IF NOT EXISTS idx_reserva_funcion ON reserva(funcion_id);
CREATE INDEX IF NOT EXISTS idx_trans_reserva   ON transaccion(res_code);

-- down
DROP INDEX IF EXISTS idx_trans_reserva;
DROP INDEX IF EXISTS idx_reserva_funcion;
