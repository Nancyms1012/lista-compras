/* ================================================================
   Lista de Compras — app.js
   Sin backend. Persistencia en localStorage.
   Moneda base: colones (₡). Precios en $ se convierten con el
   tipo de cambio, que se busca automáticamente al abrir la app.
================================================================ */

const STORAGE_KEY = "listaCompras_v1";
const API_TC = "https://open.er-api.com/v6/latest/USD";
const TC_DEFAULT = 500; // respaldo si nunca se ha podido consultar

// ---------- Estado ----------
let estado = {
  tipoCambio: TC_DEFAULT,
  tcFecha: null,          // fecha del último tipo de cambio obtenido
  aplicarDescuento: true,
  actual: [],             // {id, desc, cant, precio, moneda}
  futuro: []              // {id, desc, lugar, cant, precio, moneda, comprado}
};

// ---------- Utilidades ----------
const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const fmtCRC = (n) =>
  "₡" + (Number(n) || 0).toLocaleString("es-CR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Convierte el precio de una línea a colones según su moneda
function aColones(precio, moneda) {
  const p = Number(precio) || 0;
  return moneda === "USD" ? p * (Number(estado.tipoCambio) || 0) : p;
}

// Total de una línea en colones
function totalLinea(item) {
  return aColones(item.precio, item.moneda) * (Number(item.cant) || 0);
}

// ---------- Persistencia ----------
function guardar(mostrarAviso = false) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
  if (mostrarAviso) {
    const el = $("estadoGuardado");
    el.textContent = "✓ Guardado";
    setTimeout(() => (el.textContent = ""), 2000);
  }
}

function cargar() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    estado = { ...estado, ...data };
    estado.actual = Array.isArray(data.actual) ? data.actual : [];
    estado.futuro = Array.isArray(data.futuro) ? data.futuro : [];
  } catch (e) {
    console.warn("No se pudo leer el estado guardado:", e);
  }
}

// ---------- Tipo de cambio automático ----------
async function buscarTipoCambio() {
  const info = $("tcInfo");
  info.textContent = "Buscando tipo de cambio…";
  try {
    const resp = await fetch(API_TC, { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    const crc = data && data.rates && data.rates.CRC;
    if (!crc) throw new Error("Sin dato de CRC");

    estado.tipoCambio = Math.round(crc * 100) / 100;
    estado.tcFecha = data.time_last_update_utc || new Date().toISOString();
    $("tipoCambio").value = estado.tipoCambio;
    const fecha = new Date(estado.tcFecha).toLocaleDateString("es-CR");
    info.textContent = `Actualizado automáticamente (${fecha})`;
    guardar();
    render();
  } catch (e) {
    console.warn("No se pudo obtener el tipo de cambio:", e);
    $("tipoCambio").value = estado.tipoCambio;
    const extra = estado.tcFecha
      ? `último guardado ${new Date(estado.tcFecha).toLocaleDateString("es-CR")}`
      : "valor por defecto";
    info.textContent = `Sin conexión — usando ${extra}. Puedes editarlo a mano.`;
    render();
  }
}

// ================================================================
//   TAB 1: COMPRA ACTUAL
// ================================================================
function agregarActual(e) {
  e.preventDefault();
  const desc = $("a-desc").value.trim();
  if (!desc) return;
  estado.actual.push({
    id: uid(),
    desc,
    cant: parseFloat($("a-cant").value) || 0,
    precio: parseFloat($("a-precio").value) || 0,
    moneda: $("a-moneda").value,
    comprado: false,
  });
  $("formActual").reset();
  $("a-cant").value = 1;
  $("a-desc").focus();
  guardar();
  render();
}

function renderActual() {
  const body = $("bodyActual");
  body.innerHTML = "";
  estado.actual.forEach((item) => {
    const tr = document.createElement("tr");
    if (item.comprado) tr.classList.add("comprado");
    const simb = item.moneda === "USD" ? "$" : "₡";
    tr.innerHTML = `
      <td class="check-cell">
        <input type="checkbox" class="chk-actual" data-id="${item.id}" ${item.comprado ? "checked" : ""} title="Marcar como comprado" />
      </td>
      <td>${escapeHtml(item.desc)}</td>
      <td class="num">${formatNum(item.cant)}</td>
      <td class="num">${simb}${formatNum(item.precio)}<span class="moneda-tag">${item.moneda}</span></td>
      <td class="num">${fmtCRC(totalLinea(item))}</td>
      <td class="acciones-col">
        <button class="btn-icon btn-edit" data-tab="actual" data-id="${item.id}" title="Editar">✏️</button>
        <button class="btn-icon btn-del" data-tab="actual" data-id="${item.id}" title="Eliminar">🗑️</button>
      </td>`;
    body.appendChild(tr);
  });
  $("vacioActual").style.display = estado.actual.length ? "none" : "block";

  // Totales de TODA la lista
  const subtotal = estado.actual.reduce((s, it) => s + totalLinea(it), 0);
  const descuento = estado.aplicarDescuento ? subtotal * 0.10 : 0;
  $("subtotalActual").textContent = fmtCRC(subtotal);
  $("descuentoActual").textContent = "-" + fmtCRC(descuento);
  $("totalActual").textContent = fmtCRC(subtotal - descuento);

  // Totales solo de lo MARCADO (ya comprado / en el carrito)
  const subComprado = estado.actual
    .filter((it) => it.comprado)
    .reduce((s, it) => s + totalLinea(it), 0);
  const descComprado = estado.aplicarDescuento ? subComprado * 0.10 : 0;
  $("subtotalComprado").textContent = fmtCRC(subComprado);
  $("descuentoComprado").textContent = "-" + fmtCRC(descComprado);
  $("totalComprado").textContent = fmtCRC(subComprado - descComprado);
}

// ================================================================
//   TAB 2: COMPRAS A FUTURO
// ================================================================
function agregarFuturo(e) {
  e.preventDefault();
  const desc = $("f-desc").value.trim();
  if (!desc) return;
  estado.futuro.push({
    id: uid(),
    desc,
    lugar: $("f-lugar").value.trim(),
    cant: parseFloat($("f-cant").value) || 0,
    precio: parseFloat($("f-precio").value) || 0,
    moneda: $("f-moneda").value,
    comprado: false,
  });
  $("formFuturo").reset();
  $("f-cant").value = 1;
  $("f-desc").focus();
  guardar();
  render();
}

function renderFuturo() {
  const body = $("bodyFuturo");
  body.innerHTML = "";
  estado.futuro.forEach((item) => {
    const tr = document.createElement("tr");
    if (item.comprado) tr.classList.add("comprado");
    const simb = item.moneda === "USD" ? "$" : "₡";
    tr.innerHTML = `
      <td class="check-cell">
        <input type="checkbox" class="chk-comprado" data-id="${item.id}" ${item.comprado ? "checked" : ""} title="Marcar como comprado" />
      </td>
      <td>${escapeHtml(item.desc)}</td>
      <td>${escapeHtml(item.lugar || "—")}</td>
      <td class="num">${formatNum(item.cant)}</td>
      <td class="num">${simb}${formatNum(item.precio)}<span class="moneda-tag">${item.moneda}</span></td>
      <td class="num">${fmtCRC(totalLinea(item))}</td>
      <td class="acciones-col">
        <button class="btn-icon btn-edit" data-tab="futuro" data-id="${item.id}" title="Editar">✏️</button>
        <button class="btn-icon btn-del" data-tab="futuro" data-id="${item.id}" title="Eliminar">🗑️</button>
      </td>`;
    body.appendChild(tr);
  });
  $("vacioFuturo").style.display = estado.futuro.length ? "none" : "block";

  const totalOrig = estado.futuro.reduce((s, it) => s + totalLinea(it), 0);
  const comprado = estado.futuro.filter((it) => it.comprado)
    .reduce((s, it) => s + totalLinea(it), 0);
  $("totalFuturo").textContent = fmtCRC(totalOrig);
  $("compradoFuturo").textContent = fmtCRC(comprado);
  $("faltaFuturo").textContent = fmtCRC(totalOrig - comprado);
}

// ================================================================
//   Editar / eliminar (compartido)
// ================================================================
function editarItem(tab, id) {
  const lista = estado[tab];
  const item = lista.find((it) => it.id === id);
  if (!item) return;

  const nuevaDesc = prompt("Descripción:", item.desc);
  if (nuevaDesc === null) return;
  item.desc = nuevaDesc.trim() || item.desc;

  if (tab === "futuro") {
    const nuevoLugar = prompt("Lugar (opcional):", item.lugar || "");
    if (nuevoLugar !== null) item.lugar = nuevoLugar.trim();
  }

  const nuevaCant = prompt("Cantidad:", item.cant);
  if (nuevaCant !== null && nuevaCant !== "") item.cant = parseFloat(nuevaCant) || 0;

  const nuevaMoneda = prompt('Moneda: escribe "CRC" para colones o "USD" para dólares:', item.moneda);
  if (nuevaMoneda !== null) {
    const m = nuevaMoneda.trim().toUpperCase();
    if (m === "USD" || m === "CRC") item.moneda = m;
  }

  const simb = item.moneda === "USD" ? "$" : "₡";
  const nuevoPrecio = prompt(`Precio unitario (en ${simb}):`, item.precio);
  if (nuevoPrecio !== null && nuevoPrecio !== "") item.precio = parseFloat(nuevoPrecio) || 0;

  guardar();
  render();
}

function eliminarItem(tab, id) {
  const item = estado[tab].find((it) => it.id === id);
  const nombre = item ? item.desc : "este artículo";
  if (!confirm(`¿Eliminar "${nombre}"?`)) return;
  estado[tab] = estado[tab].filter((it) => it.id !== id);
  guardar();
  render();
}

// ================================================================
//   Helpers de formato / seguridad
// ================================================================
function formatNum(n) {
  return (Number(n) || 0).toLocaleString("es-CR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ================================================================
//   Render global
// ================================================================
function render() {
  renderActual();
  renderFuturo();
}

// ================================================================
//   Eventos
// ================================================================
function initEventos() {
  // Tabs
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // Formularios
  $("formActual").addEventListener("submit", agregarActual);
  $("formFuturo").addEventListener("submit", agregarFuturo);

  // Descuento
  $("aplicarDescuento").addEventListener("change", (e) => {
    estado.aplicarDescuento = e.target.checked;
    guardar();
    renderActual();
  });

  // Tipo de cambio manual
  $("tipoCambio").addEventListener("input", (e) => {
    estado.tipoCambio = parseFloat(e.target.value) || 0;
    guardar();
    render();
  });
  $("btnRefrescarTC").addEventListener("click", buscarTipoCambio);

  // Guardar manual
  $("btnGuardar").addEventListener("click", () => guardar(true));

  // Delegación: editar / eliminar / check comprado
  document.body.addEventListener("click", (e) => {
    const edit = e.target.closest(".btn-edit");
    const del = e.target.closest(".btn-del");
    if (edit) editarItem(edit.dataset.tab, edit.dataset.id);
    if (del) eliminarItem(del.dataset.tab, del.dataset.id);
  });

  document.body.addEventListener("change", (e) => {
    if (e.target.classList.contains("chk-comprado")) {
      const item = estado.futuro.find((it) => it.id === e.target.dataset.id);
      if (item) {
        item.comprado = e.target.checked;
        guardar();
        renderFuturo();
      }
    }
    if (e.target.classList.contains("chk-actual")) {
      const item = estado.actual.find((it) => it.id === e.target.dataset.id);
      if (item) {
        item.comprado = e.target.checked;
        guardar();
        renderActual();
      }
    }
  });
}

// ================================================================
//   Arranque
// ================================================================
function init() {
  cargar();
  $("aplicarDescuento").checked = estado.aplicarDescuento;
  $("tipoCambio").value = estado.tipoCambio;
  initEventos();
  render();
  buscarTipoCambio(); // busca el tipo de cambio del día automáticamente
}

document.addEventListener("DOMContentLoaded", init);
