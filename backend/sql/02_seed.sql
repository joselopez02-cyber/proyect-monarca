-- =============================================
-- Cinema Monarca - Datos semilla (PostgreSQL)
-- Ticket Jira: KAN-13
-- Ejecutar despues de 01_schema.sql (lo hace npm run db:setup)
-- Contrasena de los usuarios demo: monarca123
-- =============================================

-- Usuarios
INSERT INTO usuario (username, email, password_hash, rol) VALUES
('admin',   'admin@monarca.co',   '$2a$12$XRAVvAi4ckSjhajv3QXgMeHiN5o0Z4/TK2h/3XDxD5MtWknl3VE/6', 'ADMIN'),
('usuario', 'usuario@monarca.co', '$2a$12$XRAVvAi4ckSjhajv3QXgMeHiN5o0Z4/TK2h/3XDxD5MtWknl3VE/6', 'USER')
ON CONFLICT DO NOTHING;

-- Cines y sucursales (Cali)
INSERT INTO cine (cine_id, nombre_del_cine, cine_cont) VALUES
(1, 'Cinema Monarca Centro', '+57 2 8901234'),
(2, 'Cinema Monarca Norte',  '+57 2 8905678')
ON CONFLICT DO NOTHING;

INSERT INTO sucursal (bran_id, bran_location, cine_id) VALUES
(1, 'Calle 10 # 5-20, Centro, Cali',          1),
(2, 'Av. Simon Bolivar # 45-12, Norte, Cali', 2)
ON CONFLICT DO NOTHING;

INSERT INTO gestor (manager_id, manager_details, sucursal_id) VALUES
(1, 'Carlos Ruiz - Gerente Senior', 1),
(2, 'Maria Lopez - Gerente Norte',  2)
ON CONFLICT DO NOTHING;

-- Clientes demo
INSERT INTO cliente (cust_id, nombre_cliente, cust_age, direccion_cliente, numero_cliente) VALUES
(1, 'Juan Perez', 30, 'Cra 5 # 10-20, Cali', '3001234567'),
(2, 'Ana Garcia', 25, 'Cll 15 # 8-40, Cali', '3109876543')
ON CONFLICT DO NOTHING;

-- Salas (filas x columnas = capacidad)
INSERT INTO sala (sala_id, nombre, tipo, capacidad, filas, columnas, sucursal_id) VALUES
-- Sucursal Centro (1)
( 1, 'Sala PRO 1', 'PRO',    20, 4,  5, 1), ( 2, 'Sala PRO 2', 'PRO',    20, 4,  5, 1),
( 3, 'Sala PRO 3', 'PRO',    20, 4,  5, 1), ( 4, 'Sala PRO 4', 'PRO',    20, 4,  5, 1),
( 5, 'Sala PRO 5', 'PRO',    20, 4,  5, 1), ( 6, 'Sala PRO 6', 'PRO',    20, 4,  5, 1),
( 7, 'Sala 3D 1',  'TRES_D', 30, 5,  6, 1), ( 8, 'Sala 3D 2',  'TRES_D', 30, 5,  6, 1),
( 9, 'Sala 2D 1',  'DOS_D',  50, 5, 10, 1), (10, 'Sala 2D 2',  'DOS_D',  50, 5, 10, 1),
-- Sucursal Norte (2)
(11, 'Sala PRO 1', 'PRO',    20, 4,  5, 2), (12, 'Sala PRO 2', 'PRO',    20, 4,  5, 2),
(13, 'Sala PRO 3', 'PRO',    20, 4,  5, 2), (14, 'Sala PRO 4', 'PRO',    20, 4,  5, 2),
(15, 'Sala PRO 5', 'PRO',    20, 4,  5, 2), (16, 'Sala PRO 6', 'PRO',    20, 4,  5, 2),
(17, 'Sala 3D 1',  'TRES_D', 30, 5,  6, 2), (18, 'Sala 3D 2',  'TRES_D', 30, 5,  6, 2),
(19, 'Sala 2D 1',  'DOS_D',  50, 5, 10, 2), (20, 'Sala 2D 2',  'DOS_D',  50, 5, 10, 2)
ON CONFLICT DO NOTHING;

-- Peliculas
INSERT INTO pelicula (movie_id, nombre, descripcion, duracion_min, genero) VALUES
(1, 'Oppenheimer',
    'La historia del padre de la bomba atomica contada por Christopher Nolan.', 180, 'DRAMA'),
(2, 'Dune: Parte Dos',
    'Paul Atreides se une a los Fremen para vengar a su familia.', 166, 'CIENCIA_FICCION'),
(3, 'Avatar: El Camino del Agua',
    'La epica continuacion de James Cameron regresa al mundo de Pandora.', 192, 'CIENCIA_FICCION'),
(4, 'Spider-Man: No Way Home',
    'El heroe aracnido enfrenta su mayor desafio entre multiversos.', 148, 'ACCION'),
(5, 'El Rey Leon (Clasico)',
    'La historia de Simba regresa a la gran pantalla en proyeccion 2D.', 88, 'ANIMACION'),
(6, 'Inception',
    'Un ladron especializado en el robo de secretos dentro del subconsciente.', 148, 'THRILLER')
ON CONFLICT DO NOTHING;

-- Funciones: las fechas son relativas a HOY para que siempre haya funciones vigentes
INSERT INTO funcion
  (funcion_id, movie_id, sala_id, fecha, hora_inicio, precio_boleto, capacidad_total, asientos_disponibles)
VALUES
(1, 1,  1, to_char(CURRENT_DATE + 1, 'YYYY-MM-DD'), '15:00', 28000, 20, 20),
(2, 1,  2, to_char(CURRENT_DATE + 1, 'YYYY-MM-DD'), '19:00', 28000, 20, 20),
(3, 2,  3, to_char(CURRENT_DATE + 2, 'YYYY-MM-DD'), '18:00', 28000, 20, 20),
(4, 2,  4, to_char(CURRENT_DATE + 2, 'YYYY-MM-DD'), '21:00', 28000, 20, 20),
(5, 3,  7, to_char(CURRENT_DATE + 3, 'YYYY-MM-DD'), '18:30', 22000, 30, 30),
(6, 3,  8, to_char(CURRENT_DATE + 3, 'YYYY-MM-DD'), '21:30', 22000, 30, 30),
(7, 4,  7, to_char(CURRENT_DATE + 4, 'YYYY-MM-DD'), '16:00', 22000, 30, 30),
(8, 5,  9, to_char(CURRENT_DATE + 5, 'YYYY-MM-DD'), '14:00', 16000, 50, 50),
(9, 6, 10, to_char(CURRENT_DATE + 6, 'YYYY-MM-DD'), '16:00', 16000, 50, 50),
(10, 6, 10, to_char(CURRENT_DATE + 6, 'YYYY-MM-DD'), '20:00', 16000, 50, 50)
ON CONFLICT DO NOTHING;

-- Como insertamos IDs a mano, ajustamos los contadores para que los
-- proximos registros (POST) no choquen con los datos semilla
SELECT setval(pg_get_serial_sequence('cine',     'cine_id'),     (SELECT MAX(cine_id)     FROM cine));
SELECT setval(pg_get_serial_sequence('sucursal', 'bran_id'),     (SELECT MAX(bran_id)     FROM sucursal));
SELECT setval(pg_get_serial_sequence('gestor',   'manager_id'),  (SELECT MAX(manager_id)  FROM gestor));
SELECT setval(pg_get_serial_sequence('cliente',  'cust_id'),     (SELECT MAX(cust_id)     FROM cliente));
SELECT setval(pg_get_serial_sequence('sala',     'sala_id'),     (SELECT MAX(sala_id)     FROM sala));
SELECT setval(pg_get_serial_sequence('pelicula', 'movie_id'),    (SELECT MAX(movie_id)    FROM pelicula));
SELECT setval(pg_get_serial_sequence('funcion',  'funcion_id'),  (SELECT MAX(funcion_id)  FROM funcion));
