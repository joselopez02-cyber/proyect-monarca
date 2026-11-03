-- KAN-40 (HU22): las transacciones ahora pueden ser un PAGO o un REEMBOLSO.
-- Un reembolso reutiliza la misma tabla (monto positivo, tipo REEMBOLSO) y solo puede haber uno por reserva.

-- up
ALTER TABLE transaccion ADD COLUMN IF NOT EXISTS tipo_trans VARCHAR(10) NOT NULL DEFAULT 'PAGO';
ALTER TABLE transaccion DROP CONSTRAINT IF EXISTS ck_transaccion_tipo_trans;
ALTER TABLE transaccion ADD CONSTRAINT ck_transaccion_tipo_trans CHECK (tipo_trans IN ('PAGO', 'REEMBOLSO'));
CREATE UNIQUE INDEX IF NOT EXISTS ux_reembolso_reserva ON transaccion(res_code) WHERE tipo_trans = 'REEMBOLSO';

-- down
DROP INDEX IF EXISTS ux_reembolso_reserva;
ALTER TABLE transaccion DROP CONSTRAINT IF EXISTS ck_transaccion_tipo_trans;
ALTER TABLE transaccion DROP COLUMN IF EXISTS tipo_trans;
