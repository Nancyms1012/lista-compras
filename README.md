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

### Pestaña 3 — Histórico
- Botón **📋 Guardar en histórico** en cada lista: guarda una copia con fecha y
  nombre. La lista activa **no se borra**.
- Cada entrada muestra nombre, tipo, cantidad de artículos, fecha y total.
- **Ver detalle** de los artículos, **↩ volver a cargar** una lista vieja
  (para reciclarla) y **🗑️ eliminar** entradas.
- El total de cada entrada usa el tipo de cambio guardado en ese momento.

### Común a ambas pestañas
- **Dos monedas:** cada artículo puede registrarse en **₡ colones** o **$ dólares**.
  Los precios en dólares se convierten a colones automáticamente.
- **Tipo de cambio automático:** al abrir la app se consulta el valor del día
  desde una API pública gratuita (`open.er-api.com`). Si no hay conexión, usa el
  último valor guardado y se puede ajustar a mano con el botón ↻.
- **Campo Pasillo** (opcional) para organizar el recorrido en el súper.
- **Ordenar por columna:** clic en el encabezado (asc/desc).
- **Seleccionar todo:** casilla en el encabezado de las columnas de check.
- Moneda base y todos los totales en **colones (₡)**, formato Costa Rica.
- **Edición en línea:** clic en ✏️ y editas la fila directo; ✅ guarda, ✖️ cancela.
- Eliminar (🗑️) artículos.
- **Guardado automático** + botón **Guardar**.
- **Respaldo Exportar/Importar (.json):** el botón **📤 Exportar respaldo**
  descarga un archivo con todos tus datos (listas, histórico, presupuesto, tipo
  de cambio). El botón **📥 Importar respaldo** carga ese archivo en otro
  dispositivo (o restaura uno viejo). Sirve para pasar tus listas de la compu al
  celular: exportas en uno, te pasas el archivo y lo importas en el otro.
  Al importar se **reemplazan** los datos del dispositivo (pide confirmación).

En la pestaña **Compra actual** cada artículo tiene dos checks: **Incluir**
(lo que sí vas a comprar este mes → total preliminar) y **Comprado** (lo que ya
está en el carrito → total real). Útil para reciclar la lista del mes anterior.

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
