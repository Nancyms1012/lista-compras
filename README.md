# 🛒 Lista de Compras

App web sencilla (sin backend) para organizar las compras del supermercado.
HTML + CSS + JavaScript puro. Todo se guarda en el navegador (`localStorage`).

## Funciones

### Pestaña 1 — Compra actual
- Agregar artículos con **descripción**, **cantidad** y **precio unitario**.
- Total por artículo calculado automáticamente (cantidad × precio).
- **Subtotal** de toda la lista.
- **Descuento del 10 %** activable con una casilla.
- **Total a pagar** = subtotal − descuento.

### Pestaña 2 — Compras a futuro
- Agregar artículos con **descripción**, **lugar** donde se compraría, **cantidad** y **precio**.
- Casilla **✓** para marcar cada artículo cuando ya se compró.
- Resumen: **Total original**, **Ya comprado** y **Falta por comprar** (se va restando).

### Común a ambas pestañas
- **Dos monedas:** cada artículo puede registrarse en **₡ colones** o **$ dólares**.
  Los precios en dólares se convierten a colones automáticamente.
- **Tipo de cambio automático:** al abrir la app se consulta el valor del día
  desde una API pública gratuita (`open.er-api.com`). Si no hay conexión, usa el
  último valor guardado y se puede ajustar a mano con el botón ↻.
- Moneda base y todos los totales en **colones (₡)**, formato Costa Rica.
- Editar (✏️) y eliminar (🗑️) artículos.
- **Guardado automático** + botón **Guardar**.

## Uso

Abre `index.html` en el navegador. No necesita instalación ni servidor.

## Despliegue (Cloudflare Pages)

- **Preset:** None
- **Build command:** *(vacío)*
- **Output directory:** `/`

Es un sitio 100 % estático, así que Cloudflare Pages solo publica los archivos.

## Archivos

| Archivo       | Descripción                                  |
|---------------|----------------------------------------------|
| `index.html`  | Estructura y las dos pestañas                |
| `styles.css`  | Estilos                                      |
| `app.js`      | Lógica, monedas, tipo de cambio, guardado    |

## Almacenamiento

Los datos se guardan en `localStorage` bajo la clave `listaCompras_v1`.
Son locales al navegador y dispositivo donde se usa la app.
