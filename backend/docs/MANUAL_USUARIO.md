# Manual de usuario de Cinema Monarca

Este manual explica cómo ingresar a Cinema Monarca, comprar entradas y consultar el historial. La interfaz se adapta al rol de la cuenta (`USER`, `GESTOR` o `ADMIN`); cada cuenta solo puede consultar sus propios datos, excepto las operaciones administrativas autorizadas.

## Ingresar o crear una cuenta

1. Abre el dominio de Cinema Monarca o, en desarrollo, `http://localhost:5173`.
2. En **Iniciar Sesión**, escribe tu usuario y contraseña.
3. Si no tienes cuenta, selecciona **Registrarse**. Completa usuario, nombre, correo, cédula y contraseña (mínimo 6 caracteres); teléfono, dirección y fecha de nacimiento son opcionales. El registro crea una cuenta `USER`; no permite elegir un rol privilegiado.
4. Si el inicio de sesión falla, comprueba los datos. Tras varios intentos fallidos el acceso se bloquea temporalmente; espera el tiempo indicado antes de intentar de nuevo.
5. Si la sesión vence, inicia sesión otra vez. Usa **Cerrar Sesión** al terminar, sobre todo en un equipo compartido.

### Cuentas de demostración local

Tras `npm run db:setup` en una base local, puedes entrar como `admin` o `usuario` con la contraseña `monarca123`. Son cuentas con credenciales públicas de muestra: no uses datos reales y cambia la contraseña del administrador antes de exponer una instalación.

## Reservar, pagar y ver el historial

1. Inicia sesión como cliente (`USER`) y abre **Taquilla** desde el menú.
2. Explora la cartelera, elige una película y una función que todavía no haya comenzado.
3. Selecciona una o más sillas marcadas como disponibles y continúa para bloquearlas. El bloqueo es temporal; completa la reserva antes de que venza el contador mostrado.
4. Ingresa la cédula del cliente solicitada por la taquilla. La aplicación buscará o registrará la ficha asociada a tu cuenta; no uses la cédula de otra persona.
5. Confirma la función, las sillas y el total. La reserva se crea como **PENDIENTE** hasta que el pago se apruebe.
6. Selecciona el método de pago disponible en la pantalla y confirma. Los métodos soportados por el simulador son tarjeta de crédito, tarjeta débito, NEQUI y PSE. El número de tarjeta, cuando aplique, es ficticio para las pruebas; el sistema no envía pagos a una entidad financiera. Nunca ingreses una tarjeta real.
7. Cuando el pago se aprueba, la reserva queda **CONFIRMADA**. Si se rechaza, permanece **PENDIENTE** y puedes revisar el motivo o intentarlo nuevamente mientras la reserva no expire.
8. Abre **Mis pagos** para consultar los intentos de pago, el método, el estado y la reserva asociada. Abre **Historial** para consultar tus reservas.

El bloqueo de sillas dura 5 minutos por defecto; completa la compra antes de que venza. Las reservas pendientes se cancelan automáticamente después del tiempo configurado (15 minutos por defecto). Al cancelar una reserva, sus sillas se liberan. Si cancelas una reserva pagada antes de que comience la función, la API registra el reembolso; las políticas de reembolso reales dependen de la operación del negocio, pues el pago es simulado.

Para pruebas controladas, el simulador aprueba NEQUI y PSE. En el caso de tarjeta, el número terminado en `0000` se rechaza por fondos insuficientes y el terminado en `1111` se rechaza por bloqueo. Son reglas de prueba, no una autorización bancaria; no ingreses datos de tarjetas reales.

## Perfil y contraseña

- **Configuración** permite actualizar datos del perfil y cambiar la contraseña.
- Para cambiar la contraseña se solicita la actual y la nueva; debe tener al menos 6 caracteres y ser diferente de la actual.
- Un usuario solo puede consultar/editar su propio perfil y ficha de cliente. No compartas tu token de sesión.

## Funciones por rol

### Cliente (`USER`)

- **Taquilla**: explorar cartelera, ver funciones y asientos, reservar y pagar.
- **Historial**: consultar las propias reservas.
- **Mis pagos**: consultar las propias transacciones.
- **Configuración**: editar perfil y contraseña.

### Gestor (`GESTOR`)

- Además de las opciones de taquilla y consulta autorizadas, **Ocupación** muestra funciones, reservas y sillas vendidas únicamente para la sucursal asignada por un administrador.
- Si no aparece una sucursal, pide al administrador que asigne la cuenta a una. No se puede seleccionar otra sucursal en la consulta.
- La programación de funciones solo está autorizada para las salas de la sucursal asignada.

### Administrador (`ADMIN`)

- Administra películas, pósteres, cines, sucursales, salas, funciones, usuarios y asignaciones de gestores.
- Puede consultar reservas y transacciones de todos los clientes y descargar reportes de ventas.
- Otorga roles solo desde **Gestión de Usuarios**. Asigna un usuario con rol `GESTOR` a la sucursal correspondiente.
- Protege las credenciales de administrador; desactivar una cuenta no borra el historial asociado.

## Problemas frecuentes

| Mensaje o situación | Qué hacer |
|---|---|
| La sesión expiró o aparece 401 | Vuelve a iniciar sesión. No intentes reutilizar un token vencido. |
| No tienes permiso o aparece 403 | Verifica que ingresaste con la cuenta correcta. Los clientes no pueden acceder a datos de otros; los gestores solo ven su sucursal. |
| La silla ya no está disponible | Actualiza el mapa y elige una silla libre. El bloqueo de otro cliente o una reserva puede haber cambiado su estado. |
| El bloqueo venció al reservar | Vuelve a bloquear las sillas disponibles y completa el flujo antes del nuevo límite de tiempo. |
| La función ya comenzó | El sistema no permite crear la reserva; elige una función futura. |
| El pago quedó rechazado | La reserva sigue pendiente. Revisa el motivo devuelto y reintenta con un método permitido. No envíes datos reales de tarjeta. |
| Demasiados intentos | Espera el intervalo indicado antes de volver a iniciar sesión o cambiar la contraseña. |
| No conecta con el servicio | Comprueba tu conexión o contacta al equipo operador con la hora, ruta y código de error; nunca envíes contraseñas ni tokens. |

Para una integración directa con la API, incluidos ejemplos de reserva y pago, consulta la [referencia de API](./API.md). La forma estándar de respuesta, el código estable y la lista de campos inválidos se explican en su sección [Errores](./API.md#errores) y en el [catálogo de errores](./codigos-de-error.md).
