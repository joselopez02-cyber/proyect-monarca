-- KAN-60 (HT21): indexa el filtro y orden de la cartelera vigente.

-- up
CREATE INDEX IF NOT EXISTS idx_funcion_fecha_hora_id
  ON funcion (fecha, hora_inicio, funcion_id);

-- down
DROP INDEX IF EXISTS idx_funcion_fecha_hora_id;
