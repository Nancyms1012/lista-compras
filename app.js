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
  presupuestoActual: 0,   // ₡ disponibles para la compra actual
  presupuestoFuturo: 0,   // ₡ disponibles para compras a futuro
  presupuestoCompras: 0,  // ₡ disponibles para compras (gastos reales)
  // actual: {id, desc, pasillo, cant, precio, moneda, incluir, comprado}
  actual: [],
  // futuro: {id, desc, lugar, url, cant, precio, moneda, comprado}
  futuro: [],
  // compras: {id, fecha, desc, lugar, cant, precio, moneda}  (gastos reales)
  compras: [],
  // ordenes: {id, orden, tienda, item, url, tracking, costo, moneda, pagado, enviado, casillero, enCr}
  ordenes: [],
  // historico: {id, fecha, nombre, tipo:"actual"|"futuro"|"compras"|"ordenes", items:[...], total, tipoCambio}
  historico: [],
};

// Estado de ordenamiento por pestaña (solo visual)
const orden = {
  actual: { key: null, dir: 1 },
  futuro: { key: null, dir: 1 },
  compras: { key: null, dir: 1 },
  ordenes: { key: null, dir: 1 },
};

// Fila en edición inline (una a la vez, por pestaña)
let editando = { tab: null, id: null };

// ---------- Utilidades ----------
const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const fmtCRC = (n) =>
  "₡" + (Number(n) || 0).toLocaleString("es-CR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtUSD = (n) =>
  "$" + (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Convierte un monto en colones a dólares usando el tipo de cambio actual
function aDolares(colones) {
  const tc = Number(estado.tipoCambio) || 0;
  return tc > 0 ? (Number(colones) || 0) / tc : 0;
}

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
    estado.compras = Array.isArray(data.compras) ? data.compras : [];
    estado.ordenes = Array.isArray(data.ordenes) ? data.ordenes : [];
    estado.historico = Array.isArray(data.historico) ? data.historico : [];
    // Migración: artículos viejos de "actual" sin campo "incluir" se asumen incluidos
    estado.actual.forEach((it) => {
      if (typeof it.incluir === "undefined") it.incluir = true;
      if (typeof it.comprado === "undefined") it.comprado = false;
      if (typeof it.pasillo === "undefined") it.pasillo = "";
    });
    estado.futuro.forEach((it) => {
      if (typeof it.url === "undefined") it.url = "";
    });
    estado.ordenes.forEach((it) => {
      if (typeof it.descuento === "undefined") it.descuento = 0;
      if (typeof it.taxes === "undefined") it.taxes = 0;
    });
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

// ---------- Ordenamiento (solo visual) ----------
function ordenarLista(tab) {
  const { key, dir } = orden[tab];
  const lista = estado[tab].slice(); // copia para no alterar el orden guardado
  if (!key) return lista;

  return lista.sort((a, b) => {
    if (key === "total") {
      const ta = tab === "ordenes" ? totalOrdenCRC(a) : totalLinea(a);
      const tb = tab === "ordenes" ? totalOrdenCRC(b) : totalLinea(b);
      return (ta - tb) * dir;
    }
    if (key === "cant" || key === "precio" || key === "costo") {
      return ((Number(a[key]) || 0) - (Number(b[key]) || 0)) * dir;
    }
    if (key === "pasillo") {
      // El pasillo se ordena numéricamente (1, 2, 3… 10, 11).
      // Los vacíos van siempre al final; el texto (ej. "Panadería") va después de los números.
      return compararPasillo(a.pasillo, b.pasillo) * dir;
    }
    if (key === "fecha") {
      // Fecha en formato AAAA-MM-DD: comparación de texto equivale a cronológica
      const fa = a.fecha || "";
      const fb = b.fecha || "";
      if (fa < fb) return -1 * dir;
      if (fa > fb) return 1 * dir;
      return 0;
    }
    // texto: desc, lugar
    const va = (a[key] || "").toString().toLowerCase();
    const vb = (b[key] || "").toString().toLowerCase();
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

// Compara pasillos: número < número por valor; vacíos al final;
// si no es número (texto), se ordena alfabético después de los números.
function compararPasillo(a, b) {
  const sa = (a || "").toString().trim();
  const sb = (b || "").toString().trim();
  const emptyA = sa === "";
  const emptyB = sb === "";
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;   // vacío siempre al final (sin importar dir, ver nota)
  if (emptyB) return -1;

  const na = parseFloat(sa.replace(",", "."));
  const nb = parseFloat(sb.replace(",", "."));
  const isNumA = !isNaN(na) && /^[\d.,]+$/.test(sa);
  const isNumB = !isNaN(nb) && /^[\d.,]+$/.test(sb);

  if (isNumA && isNumB) return na - nb;      // ambos números → por valor
  if (isNumA) return -1;                     // números antes que texto
  if (isNumB) return 1;
  return sa.toLowerCase() < sb.toLowerCase() ? -1 : sa.toLowerCase() > sb.toLowerCase() ? 1 : 0;
}

function actualizarFlechasOrden(tab) {
  document.querySelectorAll(`th.sortable[data-tab="${tab}"]`).forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.key === orden[tab].key) {
      th.classList.add(orden[tab].dir === 1 ? "sort-asc" : "sort-desc");
    }
  });
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
    pasillo: $("a-pasillo").value.trim(),
    cant: parseFloat($("a-cant").value) || 0,
    precio: parseFloat($("a-precio").value) || 0,
    moneda: $("a-moneda").value,
    incluir: true,
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
  const lista = ordenarLista("actual");

  lista.forEach((item) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;

    if (editando.tab === "actual" && editando.id === item.id) {
      tr.classList.add("editando");
      tr.innerHTML = filaEdicionActual(item);
    } else {
      if (!item.incluir) tr.classList.add("excluido");
      else if (item.comprado) tr.classList.add("comprado");
      const simb = item.moneda === "USD" ? "$" : "₡";
      tr.innerHTML = `
        <td class="check-cell">
          <input type="checkbox" class="chk-incluir" data-id="${item.id}" ${item.incluir ? "checked" : ""} title="Incluir en la compra" />
        </td>
        <td class="check-cell">
          <input type="checkbox" class="chk-actual" data-id="${item.id}" ${item.comprado ? "checked" : ""} ${item.incluir ? "" : "disabled"} title="Marcar como comprado" />
        </td>
        <td>${escapeHtml(item.desc)}</td>
        <td>${escapeHtml(item.pasillo || "—")}</td>
        <td class="num">${formatNum(item.cant)}</td>
        <td class="num">${simb}${formatNum(item.precio)}<span class="moneda-tag">${item.moneda}</span></td>
        <td class="num">${fmtCRC(totalLinea(item))}</td>
        <td class="acciones-col">
          <button class="btn-icon btn-edit" data-tab="actual" data-id="${item.id}" title="Editar">✏️</button>
          <button class="btn-icon btn-del" data-tab="actual" data-id="${item.id}" title="Eliminar">🗑️</button>
        </td>`;
    }
    body.appendChild(tr);
  });

  $("vacioActual").style.display = estado.actual.length ? "none" : "block";
  actualizarFlechasOrden("actual");
  sincronizarCabecerasActual();

  // Contador de artículos
  const nTotal = estado.actual.length;
  const nIncl = estado.actual.filter((it) => it.incluir).length;
  const nComp = estado.actual.filter((it) => it.incluir && it.comprado).length;
  $("contadorActual").innerHTML = nTotal
    ? `<strong>${nTotal}</strong> artículo${nTotal === 1 ? "" : "s"} · ` +
      `<strong>${nIncl}</strong> incluido${nIncl === 1 ? "" : "s"} · ` +
      `<strong>${nComp}</strong> comprado${nComp === 1 ? "" : "s"}`
    : "";

  // Totales de TODA la lista
  const subtotal = estado.actual.reduce((s, it) => s + totalLinea(it), 0);
  const descuento = estado.aplicarDescuento ? subtotal * 0.10 : 0;
  $("subtotalActual").textContent = fmtCRC(subtotal);
  $("descuentoActual").textContent = "-" + fmtCRC(descuento);
  $("totalActual").textContent = fmtCRC(subtotal - descuento);

  // Preliminar: solo lo marcado en "Incluir"
  const subPrelim = estado.actual
    .filter((it) => it.incluir)
    .reduce((s, it) => s + totalLinea(it), 0);
  const descPrelim = estado.aplicarDescuento ? subPrelim * 0.10 : 0;
  $("subtotalPreliminar").textContent = fmtCRC(subPrelim);
  $("descuentoPreliminar").textContent = "-" + fmtCRC(descPrelim);
  $("totalPreliminar").textContent = fmtCRC(subPrelim - descPrelim);

  // Comprado: Incluir Y Comprado
  const subComprado = estado.actual
    .filter((it) => it.incluir && it.comprado)
    .reduce((s, it) => s + totalLinea(it), 0);
  const descComprado = estado.aplicarDescuento ? subComprado * 0.10 : 0;
  const totalCompradoVal = subComprado - descComprado;
  $("subtotalComprado").textContent = fmtCRC(subComprado);
  $("descuentoComprado").textContent = "-" + fmtCRC(descComprado);
  $("totalComprado").textContent = fmtCRC(totalCompradoVal);

  // Presupuesto vs Total preliminar y vs Total comprado
  const totalPrelimVal = subPrelim - descPrelim;
  mostrarDiferencia("difPreliminar", estado.presupuestoActual, totalPrelimVal);
  mostrarDiferencia("difComprado", estado.presupuestoActual, totalCompradoVal);
}

function filaEdicionActual(item) {
  return `
    <td class="check-cell">
      <input type="checkbox" class="chk-incluir" data-id="${item.id}" ${item.incluir ? "checked" : ""} disabled />
    </td>
    <td class="check-cell">
      <input type="checkbox" class="chk-actual" data-id="${item.id}" ${item.comprado ? "checked" : ""} disabled />
    </td>
    <td><input type="text" class="ed ed-desc" value="${escapeAttr(item.desc)}" /></td>
    <td><input type="text" class="ed ed-pasillo" value="${escapeAttr(item.pasillo || "")}" placeholder="Pasillo" /></td>
    <td class="num"><input type="number" class="ed ed-cant" value="${item.cant}" min="0" step="any" /></td>
    <td class="num"><input type="number" class="ed ed-precio" value="${item.precio}" min="0" step="any" /></td>
    <td class="num">
      <select class="ed ed-moneda">
        <option value="CRC" ${item.moneda === "CRC" ? "selected" : ""}>₡</option>
        <option value="USD" ${item.moneda === "USD" ? "selected" : ""}>$</option>
      </select>
    </td>
    <td class="acciones-col">
      <button class="btn-icon btn-save" data-tab="actual" data-id="${item.id}" title="Guardar">✅</button>
      <button class="btn-icon btn-cancel" title="Cancelar">✖️</button>
    </td>`;
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
    url: $("f-url").value.trim(),
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
  const lista = ordenarLista("futuro");

  lista.forEach((item) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;

    if (editando.tab === "futuro" && editando.id === item.id) {
      tr.classList.add("editando");
      tr.innerHTML = filaEdicionFuturo(item);
    } else {
      if (item.comprado) tr.classList.add("comprado");
      const simb = item.moneda === "USD" ? "$" : "₡";
      tr.innerHTML = `
        <td class="check-cell">
          <input type="checkbox" class="chk-comprado" data-id="${item.id}" ${item.comprado ? "checked" : ""} title="Marcar como comprado" />
        </td>
        <td>${escapeHtml(item.desc)}</td>
        <td>${escapeHtml(item.lugar || "—")}</td>
        <td>${item.url ? `<a href="${escapeAttr(item.url)}" target="_blank" rel="noopener" class="link-url">🔗 Ver</a>` : "—"}</td>
        <td class="num">${formatNum(item.cant)}</td>
        <td class="num">${simb}${formatNum(item.precio)}<span class="moneda-tag">${item.moneda}</span></td>
        <td class="num">${fmtCRC(totalLinea(item))}</td>
        <td class="acciones-col">
          <button class="btn-icon btn-edit" data-tab="futuro" data-id="${item.id}" title="Editar">✏️</button>
          <button class="btn-icon btn-del" data-tab="futuro" data-id="${item.id}" title="Eliminar">🗑️</button>
        </td>`;
    }
    body.appendChild(tr);
  });

  $("vacioFuturo").style.display = estado.futuro.length ? "none" : "block";
  actualizarFlechasOrden("futuro");
  sincronizarCabecerasFuturo();

  // Contador de artículos
  const nTotalF = estado.futuro.length;
  const nCompF = estado.futuro.filter((it) => it.comprado).length;
  $("contadorFuturo").innerHTML = nTotalF
    ? `<strong>${nTotalF}</strong> artículo${nTotalF === 1 ? "" : "s"} · ` +
      `<strong>${nCompF}</strong> comprado${nCompF === 1 ? "" : "s"}`
    : "";

  const totalOrig = estado.futuro.reduce((s, it) => s + totalLinea(it), 0);
  const comprado = estado.futuro.filter((it) => it.comprado)
    .reduce((s, it) => s + totalLinea(it), 0);
  const falta = totalOrig - comprado;
  $("totalFuturo").textContent = fmtCRC(totalOrig);
  $("compradoFuturo").textContent = fmtCRC(comprado);
  $("faltaFuturo").textContent = fmtCRC(falta);

  // Presupuesto vs Falta por comprar
  mostrarDiferencia("difFuturo", estado.presupuestoFuturo, falta);
}

function filaEdicionFuturo(item) {
  return `
    <td class="check-cell">
      <input type="checkbox" class="chk-comprado" data-id="${item.id}" ${item.comprado ? "checked" : ""} disabled />
    </td>
    <td><input type="text" class="ed ed-desc" value="${escapeAttr(item.desc)}" /></td>
    <td><input type="text" class="ed ed-lugar" value="${escapeAttr(item.lugar || "")}" placeholder="Lugar" /></td>
    <td><input type="url" class="ed ed-url" value="${escapeAttr(item.url || "")}" placeholder="https://…" /></td>
    <td class="num"><input type="number" class="ed ed-cant" value="${item.cant}" min="0" step="any" /></td>
    <td class="num"><input type="number" class="ed ed-precio" value="${item.precio}" min="0" step="any" /></td>
    <td class="num">
      <select class="ed ed-moneda">
        <option value="CRC" ${item.moneda === "CRC" ? "selected" : ""}>₡</option>
        <option value="USD" ${item.moneda === "USD" ? "selected" : ""}>$</option>
      </select>
    </td>
    <td class="acciones-col">
      <button class="btn-icon btn-save" data-tab="futuro" data-id="${item.id}" title="Guardar">✅</button>
      <button class="btn-icon btn-cancel" title="Cancelar">✖️</button>
    </td>`;
}

// ================================================================
//   TAB 3: COMPRAS (gastos reales)
// ================================================================
function agregarCompras(e) {
  e.preventDefault();
  const desc = $("c-desc").value.trim();
  if (!desc) return;
  estado.compras.push({
    id: uid(),
    fecha: $("c-fecha").value || hoyISO(),
    desc,
    lugar: $("c-lugar").value.trim(),
    cant: parseFloat($("c-cant").value) || 0,
    precio: parseFloat($("c-precio").value) || 0,
    moneda: $("c-moneda").value,
  });
  $("formCompras").reset();
  $("c-cant").value = 1;
  $("c-fecha").value = hoyISO();
  $("c-desc").focus();
  guardar();
  render();
}

function renderCompras() {
  const body = $("bodyCompras");
  body.innerHTML = "";
  const lista = ordenarLista("compras");

  lista.forEach((item) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;

    if (editando.tab === "compras" && editando.id === item.id) {
      tr.classList.add("editando");
      tr.innerHTML = filaEdicionCompras(item);
    } else {
      const simb = item.moneda === "USD" ? "$" : "₡";
      tr.innerHTML = `
        <td>${escapeHtml(fmtFecha(item.fecha))}</td>
        <td>${escapeHtml(item.desc)}</td>
        <td>${escapeHtml(item.lugar || "—")}</td>
        <td class="num">${formatNum(item.cant)}</td>
        <td class="num">${simb}${formatNum(item.precio)}<span class="moneda-tag">${item.moneda}</span></td>
        <td class="num">${fmtCRC(totalLinea(item))}</td>
        <td class="acciones-col">
          <button class="btn-icon btn-edit" data-tab="compras" data-id="${item.id}" title="Editar">✏️</button>
          <button class="btn-icon btn-del" data-tab="compras" data-id="${item.id}" title="Eliminar">🗑️</button>
        </td>`;
    }
    body.appendChild(tr);
  });

  $("vacioCompras").style.display = estado.compras.length ? "none" : "block";
  actualizarFlechasOrden("compras");

  // Contador
  const nTotal = estado.compras.length;
  $("contadorCompras").innerHTML = nTotal
    ? `<strong>${nTotal}</strong> compra${nTotal === 1 ? "" : "s"} registrada${nTotal === 1 ? "" : "s"}`
    : "";

  // Total gastado acumulado
  const totalGastado = estado.compras.reduce((s, it) => s + totalLinea(it), 0);
  $("totalCompras").textContent = fmtCRC(totalGastado);

  // Presupuesto vs Total gastado
  mostrarDiferencia("difCompras", estado.presupuestoCompras, totalGastado);
}

function filaEdicionCompras(item) {
  return `
    <td><input type="date" class="ed ed-fecha" value="${escapeAttr(item.fecha || "")}" /></td>
    <td><input type="text" class="ed ed-desc" value="${escapeAttr(item.desc)}" /></td>
    <td><input type="text" class="ed ed-lugar" value="${escapeAttr(item.lugar || "")}" placeholder="Lugar" /></td>
    <td class="num"><input type="number" class="ed ed-cant" value="${item.cant}" min="0" step="any" /></td>
    <td class="num"><input type="number" class="ed ed-precio" value="${item.precio}" min="0" step="any" /></td>
    <td class="num">
      <select class="ed ed-moneda">
        <option value="CRC" ${item.moneda === "CRC" ? "selected" : ""}>₡</option>
        <option value="USD" ${item.moneda === "USD" ? "selected" : ""}>$</option>
      </select>
    </td>
    <td class="acciones-col">
      <button class="btn-icon btn-save" data-tab="compras" data-id="${item.id}" title="Guardar">✅</button>
      <button class="btn-icon btn-cancel" title="Cancelar">✖️</button>
    </td>`;
}

// ================================================================
//   TAB 4: ÓRDENES (compras por internet)
// ================================================================
// Total de una orden (costo - descuento + taxes) convertido a colones
function totalOrdenCRC(item) {
  const neto = (Number(item.costo) || 0) - (Number(item.descuento) || 0) + (Number(item.taxes) || 0);
  return aColones(neto, item.moneda);
}
// Solo el costo (sin desc/taxes) en colones — se mantiene por compatibilidad
function costoOrdenCRC(item) {
  return aColones(item.costo, item.moneda);
}

function agregarOrdenes(e) {
  e.preventDefault();
  const itemTxt = $("o-item").value.trim();
  if (!itemTxt) return;
  estado.ordenes.push({
    id: uid(),
    orden: $("o-orden").value.trim(),
    tienda: $("o-tienda").value.trim(),
    item: itemTxt,
    url: $("o-url").value.trim(),
    tracking: $("o-tracking").value.trim(),
    costo: parseFloat($("o-costo").value) || 0,
    descuento: parseFloat($("o-descuento").value) || 0,
    taxes: parseFloat($("o-taxes").value) || 0,
    moneda: $("o-moneda").value,
    pagado: false,
    enviado: false,
    casillero: false,
    enCr: false,
  });
  $("formOrdenes").reset();
  $("o-item").focus();
  guardar();
  render();
}

function renderOrdenes() {
  const body = $("bodyOrdenes");
  body.innerHTML = "";
  const lista = ordenarLista("ordenes");

  lista.forEach((item) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;

    if (editando.tab === "ordenes" && editando.id === item.id) {
      tr.classList.add("editando");
      tr.innerHTML = filaEdicionOrdenes(item);
    } else {
      if (item.enCr) tr.classList.add("comprado");
      const simb = item.moneda === "USD" ? "$" : "₡";
      // Las casillas secuenciales: cada una se habilita solo si la anterior está marcada
      tr.innerHTML = `
        <td>${escapeHtml(item.orden || "—")}</td>
        <td>${escapeHtml(item.tienda || "—")}</td>
        <td>${escapeHtml(item.item)}</td>
        <td>${item.url ? `<a href="${escapeAttr(item.url)}" target="_blank" rel="noopener" class="link-url">🔗 Ver</a>` : "—"}</td>
        <td>${escapeHtml(item.tracking || "—")}</td>
        <td class="num">${simb}${formatNum(item.costo)}<span class="moneda-tag">${item.moneda}</span></td>
        <td class="num">${item.descuento ? "-" + simb + formatNum(item.descuento) : "—"}</td>
        <td class="num">${item.taxes ? simb + formatNum(item.taxes) : "—"}</td>
        <td class="num">${fmtCRC(totalOrdenCRC(item))}</td>
        <td class="check-cell">
          <input type="checkbox" class="chk-estatus" data-campo="pagado" data-id="${item.id}" ${item.pagado ? "checked" : ""} title="Pagado" />
        </td>
        <td class="check-cell">
          <input type="checkbox" class="chk-estatus" data-campo="enviado" data-id="${item.id}" ${item.enviado ? "checked" : ""} ${item.pagado ? "" : "disabled"} title="Enviado" />
        </td>
        <td class="check-cell">
          <input type="checkbox" class="chk-estatus" data-campo="casillero" data-id="${item.id}" ${item.casillero ? "checked" : ""} ${item.enviado ? "" : "disabled"} title="En Casillero" />
        </td>
        <td class="check-cell">
          <input type="checkbox" class="chk-estatus" data-campo="enCr" data-id="${item.id}" ${item.enCr ? "checked" : ""} ${item.casillero ? "" : "disabled"} title="En CR" />
        </td>
        <td class="acciones-col">
          <button class="btn-icon btn-edit" data-tab="ordenes" data-id="${item.id}" title="Editar">✏️</button>
          <button class="btn-icon btn-del" data-tab="ordenes" data-id="${item.id}" title="Eliminar">🗑️</button>
        </td>`;
    }
    body.appendChild(tr);
  });

  $("vacioOrdenes").style.display = estado.ordenes.length ? "none" : "block";
  actualizarFlechasOrden("ordenes");

  // Contador
  const nTotal = estado.ordenes.length;
  const nEnCr = estado.ordenes.filter((it) => it.enCr).length;
  $("contadorOrdenes").innerHTML = nTotal
    ? `<strong>${nTotal}</strong> orden${nTotal === 1 ? "" : "es"} · ` +
      `<strong>${nEnCr}</strong> en CR · ` +
      `<strong>${nTotal - nEnCr}</strong> en tránsito`
    : "";

  // Totales (todo convertido a colones; descuentos y taxes incluidos)
  const costoTotal = estado.ordenes.reduce((s, it) => s + aColones(it.costo, it.moneda), 0);
  const descTotal = estado.ordenes.reduce((s, it) => s + aColones(it.descuento || 0, it.moneda), 0);
  const taxesTotal = estado.ordenes.reduce((s, it) => s + aColones(it.taxes || 0, it.moneda), 0);
  const granTotal = estado.ordenes.reduce((s, it) => s + totalOrdenCRC(it), 0);
  const enCr = estado.ordenes.filter((it) => it.enCr).reduce((s, it) => s + totalOrdenCRC(it), 0);

  $("costoOrdenes").textContent = fmtCRC(costoTotal);
  $("descOrdenes").textContent = "-" + fmtCRC(descTotal);
  $("taxesOrdenes").textContent = fmtCRC(taxesTotal);
  $("totalOrdenes").textContent = fmtCRC(granTotal);
  $("totalOrdenesUSD").textContent = fmtUSD(aDolares(granTotal));
  $("enCrOrdenes").textContent = fmtCRC(enCr);
  $("transitoOrdenes").textContent = fmtCRC(granTotal - enCr);
}

function filaEdicionOrdenes(item) {
  return `
    <td><input type="text" class="ed ed-orden" value="${escapeAttr(item.orden || "")}" placeholder="# Orden" /></td>
    <td><input type="text" class="ed ed-tienda" value="${escapeAttr(item.tienda || "")}" placeholder="Tienda" /></td>
    <td><input type="text" class="ed ed-item" value="${escapeAttr(item.item)}" /></td>
    <td><input type="url" class="ed ed-url" value="${escapeAttr(item.url || "")}" placeholder="https://…" /></td>
    <td><input type="text" class="ed ed-tracking" value="${escapeAttr(item.tracking || "")}" placeholder="Tracking" /></td>
    <td class="num"><input type="number" class="ed ed-costo" value="${item.costo}" min="0" step="any" /></td>
    <td class="num"><input type="number" class="ed ed-descuento" value="${item.descuento || 0}" min="0" step="any" /></td>
    <td class="num"><input type="number" class="ed ed-taxes" value="${item.taxes || 0}" min="0" step="any" /></td>
    <td class="num" colspan="5">
      <select class="ed ed-moneda">
        <option value="USD" ${item.moneda === "USD" ? "selected" : ""}>$ Dólares</option>
        <option value="CRC" ${item.moneda === "CRC" ? "selected" : ""}>₡ Colones</option>
      </select>
    </td>
    <td class="acciones-col">
      <button class="btn-icon btn-save" data-tab="ordenes" data-id="${item.id}" title="Guardar">✅</button>
      <button class="btn-icon btn-cancel" title="Cancelar">✖️</button>
    </td>`;
}

// Aplica la regla secuencial de estatus: marcar una exige las anteriores;
// desmarcar una quita las siguientes.
function cambiarEstatusOrden(id, campo, valor) {
  const item = estado.ordenes.find((it) => it.id === id);
  if (!item) return;
  const etapas = ["pagado", "enviado", "casillero", "enCr"];
  const idx = etapas.indexOf(campo);
  if (valor) {
    // Marcar esta y todas las anteriores
    for (let i = 0; i <= idx; i++) item[etapas[i]] = true;
  } else {
    // Desmarcar esta y todas las siguientes
    for (let i = idx; i < etapas.length; i++) item[etapas[i]] = false;
  }
  guardar();
  renderOrdenes();
}

// ================================================================
//   Edición en línea
// ================================================================
function iniciarEdicion(tab, id) {
  editando = { tab, id };
  render();
}

function cancelarEdicion() {
  editando = { tab: null, id: null };
  render();
}

function guardarEdicion(tab, id) {
  const item = estado[tab].find((it) => it.id === id);
  if (!item) return;
  const tr = document.querySelector(`#body${cap(tab)} tr[data-id="${id}"]`);
  if (!tr) return;

  // Órdenes tiene campos distintos (item/costo/orden/tienda/tracking)
  if (tab === "ordenes") {
    item.item = tr.querySelector(".ed-item").value.trim() || item.item;
    item.orden = tr.querySelector(".ed-orden").value.trim();
    item.tienda = tr.querySelector(".ed-tienda").value.trim();
    item.tracking = tr.querySelector(".ed-tracking").value.trim();
    const urlOrdEl = tr.querySelector(".ed-url");
    if (urlOrdEl) item.url = urlOrdEl.value.trim();
    item.costo = parseFloat(tr.querySelector(".ed-costo").value) || 0;
    item.descuento = parseFloat(tr.querySelector(".ed-descuento").value) || 0;
    item.taxes = parseFloat(tr.querySelector(".ed-taxes").value) || 0;
    item.moneda = tr.querySelector(".ed-moneda").value;
    editando = { tab: null, id: null };
    guardar();
    render();
    return;
  }

  item.desc = tr.querySelector(".ed-desc").value.trim() || item.desc;
  const pasilloEl = tr.querySelector(".ed-pasillo");
  if (pasilloEl) item.pasillo = pasilloEl.value.trim();
  const lugarEl = tr.querySelector(".ed-lugar");
  if (lugarEl) item.lugar = lugarEl.value.trim();
  const urlEl = tr.querySelector(".ed-url");
  if (urlEl) item.url = urlEl.value.trim();
  const fechaEl = tr.querySelector(".ed-fecha");
  if (fechaEl) item.fecha = fechaEl.value;
  item.cant = parseFloat(tr.querySelector(".ed-cant").value) || 0;
  item.precio = parseFloat(tr.querySelector(".ed-precio").value) || 0;
  item.moneda = tr.querySelector(".ed-moneda").value;

  editando = { tab: null, id: null };
  guardar();
  render();
}

function eliminarItem(tab, id) {
  const item = estado[tab].find((it) => it.id === id);
  const nombre = item ? item.desc : "este artículo";
  if (!confirm(`¿Eliminar "${nombre}"?`)) return;
  estado[tab] = estado[tab].filter((it) => it.id !== id);
  if (editando.tab === tab && editando.id === id) editando = { tab: null, id: null };
  guardar();
  render();
}

// ================================================================
//   Seleccionar todo (cabeceras)
// ================================================================
function sincronizarCabecerasActual() {
  const items = estado.actual;
  const allIncluir = $("allIncluirActual");
  const allComprado = $("allCompradoActual");
  if (allIncluir) {
    allIncluir.checked = items.length > 0 && items.every((it) => it.incluir);
  }
  if (allComprado) {
    const incluidos = items.filter((it) => it.incluir);
    allComprado.checked = incluidos.length > 0 && incluidos.every((it) => it.comprado);
  }
}

function sincronizarCabecerasFuturo() {
  const items = estado.futuro;
  const allComprado = $("allCompradoFuturo");
  if (allComprado) {
    allComprado.checked = items.length > 0 && items.every((it) => it.comprado);
  }
}

// ================================================================
//   Histórico
// ================================================================
function guardarEnHistorico(tab) {
  const lista = estado[tab];
  if (!lista.length) {
    alert("La lista está vacía, no hay nada que guardar.");
    return;
  }
  const nombreTab = { actual: "Compra", futuro: "Compras a futuro", compras: "Compras", ordenes: "Órdenes" };
  const nombreDef =
    (nombreTab[tab] || "Lista") +
    " " + new Date().toLocaleDateString("es-CR");
  const nombre = prompt("Nombre para esta lista en el histórico:", nombreDef);
  if (nombre === null) return; // canceló

  const total = tab === "ordenes"
    ? lista.reduce((s, it) => s + totalOrdenCRC(it), 0)
    : lista.reduce((s, it) => s + totalLinea(it), 0);
  estado.historico.unshift({
    id: uid(),
    fecha: new Date().toISOString(),
    nombre: nombre.trim() || nombreDef,
    tipo: tab,
    items: JSON.parse(JSON.stringify(lista)), // copia profunda
    total,
    tipoCambio: estado.tipoCambio,
  });
  guardar(true);
  render();
  alert("✓ Lista guardada en el histórico. La lista actual se mantiene igual.");
}

function eliminarHistorico(id) {
  const h = estado.historico.find((x) => x.id === id);
  if (!confirm(`¿Eliminar del histórico "${h ? h.nombre : "esta lista"}"?`)) return;
  estado.historico = estado.historico.filter((x) => x.id !== id);
  guardar();
  renderHistorico();
}

function cargarDesdeHistorico(id) {
  const h = estado.historico.find((x) => x.id === id);
  if (!h) return;
  const nombreTab = { actual: "Compra actual", futuro: "Compras a futuro", compras: "Compras", ordenes: "Órdenes" };
  const destino = nombreTab[h.tipo] || h.tipo;
  if (!confirm(
    `Esto reemplazará tu lista de "${destino}" con la copia guardada "${h.nombre}".\n` +
    `¿Continuar? (tu lista actual se perderá si no la has guardado)`
  )) return;

  estado[h.tipo] = JSON.parse(JSON.stringify(h.items));
  // Asegura campos por si la copia es vieja
  if (h.tipo === "actual") {
    estado.actual.forEach((it) => {
      if (typeof it.incluir === "undefined") it.incluir = true;
      if (typeof it.comprado === "undefined") it.comprado = false;
      if (typeof it.pasillo === "undefined") it.pasillo = "";
    });
  } else if (h.tipo === "futuro") {
    estado.futuro.forEach((it) => {
      if (typeof it.url === "undefined") it.url = "";
    });
  }
  guardar(true);
  render();
  // Cambia a la pestaña destino
  const btn = document.querySelector(`.tab[data-tab="${h.tipo}"]`);
  if (btn) btn.click();
}

function renderHistorico() {
  const cont = $("listaHistorico");
  cont.innerHTML = "";
  const lista = estado.historico
    .slice()
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  lista.forEach((h) => {
    const fecha = new Date(h.fecha).toLocaleString("es-CR", {
      dateStyle: "medium", timeStyle: "short",
    });
    const nombreTab = { actual: "Compra actual", futuro: "Compras a futuro", compras: "Compras", ordenes: "Órdenes" };
    const tipoTxt = nombreTab[h.tipo] || h.tipo;
    const nItems = h.items.length;

    const card = document.createElement("div");
    card.className = "hist-card";
    card.innerHTML = `
      <div class="hist-head">
        <div>
          <div class="hist-nombre">${escapeHtml(h.nombre)}</div>
          <div class="hist-meta">${escapeHtml(tipoTxt)} · ${nItems} artículo${nItems === 1 ? "" : "s"} · ${escapeHtml(fecha)}</div>
        </div>
        <div class="hist-total">${fmtCRC(h.total)}</div>
      </div>
      <div class="hist-detalle">
        ${h.tipo === "ordenes" ? histTablaOrdenes(h) : `
        <table class="hist-tabla">
          <thead>
            <tr>
              ${h.tipo === "compras" ? "<th>Fecha</th>" : ""}
              <th>Descripción</th>
              ${h.tipo === "actual" ? "<th>Pasillo</th>" : "<th>Lugar</th>"}
              <th class="num">Cant.</th>
              <th class="num">Precio</th>
              <th class="num">Total (₡)</th>
            </tr>
          </thead>
          <tbody>
            ${h.items.map((it) => {
              const simb = it.moneda === "USD" ? "$" : "₡";
              const segunda = h.tipo === "actual"
                ? `<td>${escapeHtml(it.pasillo || "—")}</td>`
                : `<td>${escapeHtml(it.lugar || "—")}</td>`;
              return `<tr>
                ${h.tipo === "compras" ? `<td>${escapeHtml(fmtFecha(it.fecha))}</td>` : ""}
                <td>${escapeHtml(it.desc)}</td>
                ${segunda}
                <td class="num">${formatNum(it.cant)}</td>
                <td class="num">${simb}${formatNum(it.precio)}</td>
                <td class="num">${fmtCRC(totalHistLinea(it, h.tipoCambio))}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`}
      </div>
      <div class="hist-acciones">
        <button class="btn-mini btn-hist-toggle">Ver detalle</button>
        <button class="btn-mini btn-hist-cargar" data-id="${h.id}">↩ Volver a cargar</button>
        <button class="btn-mini btn-hist-del" data-id="${h.id}">🗑️ Eliminar</button>
      </div>`;
    cont.appendChild(card);
  });

  $("vacioHistorico").style.display = estado.historico.length ? "none" : "block";
}

// Total de una línea usando el tipo de cambio guardado en esa entrada del histórico
function totalHistLinea(item, tc) {
  const p = Number(item.precio) || 0;
  const enCol = item.moneda === "USD" ? p * (Number(tc) || 0) : p;
  return enCol * (Number(item.cant) || 0);
}

// Tabla de detalle del histórico para una entrada tipo "ordenes"
function histTablaOrdenes(h) {
  const tc = h.tipoCambio;
  const si = (v) => (v ? "✓" : "—");
  const enCol = (v, m) => (m === "USD" ? (Number(v) || 0) * (Number(tc) || 0) : (Number(v) || 0));
  return `
    <table class="hist-tabla">
      <thead>
        <tr>
          <th># Orden</th><th>Tienda</th><th>Ítem</th><th>Tracking</th>
          <th class="num">Costo</th><th class="num">Desc.</th><th class="num">Taxes</th>
          <th class="num">Total (₡)</th>
          <th>Pag.</th><th>Env.</th><th>Casill.</th><th>En CR</th>
        </tr>
      </thead>
      <tbody>
        ${h.items.map((it) => {
          const neto = enCol((Number(it.costo) || 0) - (Number(it.descuento) || 0) + (Number(it.taxes) || 0), it.moneda);
          const simb = it.moneda === "USD" ? "$" : "₡";
          return `<tr>
            <td>${escapeHtml(it.orden || "—")}</td>
            <td>${escapeHtml(it.tienda || "—")}</td>
            <td>${escapeHtml(it.item || "")}</td>
            <td>${escapeHtml(it.tracking || "—")}</td>
            <td class="num">${simb}${formatNum(it.costo)}</td>
            <td class="num">${it.descuento ? "-" + simb + formatNum(it.descuento) : "—"}</td>
            <td class="num">${it.taxes ? simb + formatNum(it.taxes) : "—"}</td>
            <td class="num">${fmtCRC(neto)}</td>
            <td>${si(it.pagado)}</td>
            <td>${si(it.enviado)}</td>
            <td>${si(it.casillero)}</td>
            <td>${si(it.enCr)}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
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

function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Fecha de hoy en formato AAAA-MM-DD (para input type=date)
function hoyISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

// Muestra una fecha AAAA-MM-DD en formato local es-CR (dd/mm/aaaa)
function fmtFecha(iso) {
  if (!iso) return "—";
  const partes = iso.split("-");
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// Muestra la diferencia presupuesto - total con color y mensaje
function mostrarDiferencia(elId, presupuesto, total) {
  const el = $(elId);
  if (!el) return;
  const pres = Number(presupuesto) || 0;
  const dif = pres - total;
  el.classList.remove("dif-ok", "dif-mal", "dif-neutro");

  if (pres <= 0) {
    // Sin presupuesto definido: solo muestra el total pendiente, sin juicio
    el.textContent = fmtCRC(0);
    el.classList.add("dif-neutro");
    return;
  }
  if (dif >= 0) {
    el.textContent = "Te sobran " + fmtCRC(dif);
    el.classList.add("dif-ok");
  } else {
    el.textContent = "Te faltan " + fmtCRC(Math.abs(dif));
    el.classList.add("dif-mal");
  }
}

// ================================================================
//   Exportar / Importar respaldo (.json)
// ================================================================
function exportarRespaldo() {
  const datos = JSON.stringify(estado, null, 2);
  const blob = new Blob([datos], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const fecha = new Date().toISOString().slice(0, 10); // AAAA-MM-DD
  const a = document.createElement("a");
  a.href = url;
  a.download = `lista-compras-${fecha}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const el = $("estadoGuardado");
  el.textContent = "✓ Respaldo descargado";
  setTimeout(() => (el.textContent = ""), 3000);
}

function importarRespaldo(archivo) {
  const reader = new FileReader();
  reader.onload = (e) => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      alert("El archivo no es un respaldo válido (no se pudo leer el JSON).");
      return;
    }
    // Validación mínima: debe tener al menos una de las listas esperadas
    const pareceValido =
      data && (Array.isArray(data.actual) || Array.isArray(data.futuro) ||
               Array.isArray(data.compras) || Array.isArray(data.ordenes) ||
               Array.isArray(data.historico));
    if (!pareceValido) {
      alert("El archivo no parece un respaldo de Lista de Compras.");
      return;
    }
    if (!confirm(
      "Esto REEMPLAZARÁ todos los datos actuales de este dispositivo con los del respaldo.\n" +
      "¿Continuar?"
    )) return;

    // Aplica el respaldo, rellenando lo que falte con los valores por defecto
    estado = {
      tipoCambio: TC_DEFAULT,
      tcFecha: null,
      aplicarDescuento: true,
      presupuestoActual: 0,
      presupuestoFuturo: 0,
      presupuestoCompras: 0,
      actual: [],
      futuro: [],
      compras: [],
      ordenes: [],
      historico: [],
      ...data,
    };
    estado.actual = Array.isArray(data.actual) ? data.actual : [];
    estado.futuro = Array.isArray(data.futuro) ? data.futuro : [];
    estado.compras = Array.isArray(data.compras) ? data.compras : [];
    estado.ordenes = Array.isArray(data.ordenes) ? data.ordenes : [];
    estado.historico = Array.isArray(data.historico) ? data.historico : [];
    // Asegura campos nuevos en artículos viejos
    estado.actual.forEach((it) => {
      if (typeof it.incluir === "undefined") it.incluir = true;
      if (typeof it.comprado === "undefined") it.comprado = false;
      if (typeof it.pasillo === "undefined") it.pasillo = "";
    });
    estado.futuro.forEach((it) => {
      if (typeof it.url === "undefined") it.url = "";
    });

    guardar();
    // Refleja valores en los campos de la interfaz
    $("aplicarDescuento").checked = estado.aplicarDescuento;
    $("tipoCambio").value = estado.tipoCambio;
    $("presupuestoActual").value = estado.presupuestoActual || "";
    $("presupuestoFuturo").value = estado.presupuestoFuturo || "";
    $("presupuestoCompras").value = estado.presupuestoCompras || "";
    render();
    alert("✓ Respaldo importado correctamente.");
  };
  reader.readAsText(archivo);
}

// ================================================================
//   Render global
// ================================================================
function render() {
  renderActual();
  renderFuturo();
  renderCompras();
  renderOrdenes();
  renderHistorico();
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
  $("formCompras").addEventListener("submit", agregarCompras);
  $("formOrdenes").addEventListener("submit", agregarOrdenes);

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

  // Presupuesto
  $("presupuestoActual").addEventListener("input", (e) => {
    estado.presupuestoActual = parseFloat(e.target.value) || 0;
    guardar();
    renderActual();
  });
  $("presupuestoFuturo").addEventListener("input", (e) => {
    estado.presupuestoFuturo = parseFloat(e.target.value) || 0;
    guardar();
    renderFuturo();
  });
  $("presupuestoCompras").addEventListener("input", (e) => {
    estado.presupuestoCompras = parseFloat(e.target.value) || 0;
    guardar();
    renderCompras();
  });

  // Guardar manual
  $("btnGuardar").addEventListener("click", () => guardar(true));

  // Exportar / Importar respaldo
  $("btnExportar").addEventListener("click", exportarRespaldo);
  $("btnImportar").addEventListener("click", () => $("archivoImportar").click());
  $("archivoImportar").addEventListener("change", (e) => {
    const archivo = e.target.files[0];
    if (archivo) importarRespaldo(archivo);
    e.target.value = ""; // permite reimportar el mismo archivo
  });

  // Seleccionar todo
  $("allIncluirActual").addEventListener("change", (e) => {
    estado.actual.forEach((it) => {
      it.incluir = e.target.checked;
      if (!it.incluir) it.comprado = false; // si no se incluye, no puede estar comprado
    });
    guardar();
    renderActual();
  });
  $("allCompradoActual").addEventListener("change", (e) => {
    estado.actual.forEach((it) => {
      if (it.incluir) it.comprado = e.target.checked;
    });
    guardar();
    renderActual();
  });
  $("allCompradoFuturo").addEventListener("change", (e) => {
    estado.futuro.forEach((it) => (it.comprado = e.target.checked));
    guardar();
    renderFuturo();
  });

  // Ordenar por columna
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const tab = th.dataset.tab;
      const key = th.dataset.key;
      if (orden[tab].key === key) {
        orden[tab].dir *= -1; // alterna asc/desc
      } else {
        orden[tab].key = key;
        orden[tab].dir = 1;
      }
      if (tab === "actual") renderActual();
      else if (tab === "futuro") renderFuturo();
      else if (tab === "compras") renderCompras();
      else if (tab === "ordenes") renderOrdenes();
    });
  });

  // Delegación de clics: editar / eliminar / guardar / cancelar
  document.body.addEventListener("click", (e) => {
    const edit = e.target.closest(".btn-edit");
    const del = e.target.closest(".btn-del");
    const save = e.target.closest(".btn-save");
    const cancel = e.target.closest(".btn-cancel");
    const hist = e.target.closest(".btn-hist");
    const histCargar = e.target.closest(".btn-hist-cargar");
    const histDel = e.target.closest(".btn-hist-del");
    const histToggle = e.target.closest(".btn-hist-toggle");
    if (edit) iniciarEdicion(edit.dataset.tab, edit.dataset.id);
    else if (del) eliminarItem(del.dataset.tab, del.dataset.id);
    else if (save) guardarEdicion(save.dataset.tab, save.dataset.id);
    else if (cancel) cancelarEdicion();
    else if (hist) guardarEnHistorico(hist.dataset.tab);
    else if (histCargar) cargarDesdeHistorico(histCargar.dataset.id);
    else if (histDel) eliminarHistorico(histDel.dataset.id);
    else if (histToggle) {
      const card = histToggle.closest(".hist-card");
      card.classList.toggle("abierto");
      histToggle.textContent = card.classList.contains("abierto") ? "Ocultar detalle" : "Ver detalle";
    }
  });

  // Delegación de cambios: checks
  document.body.addEventListener("change", (e) => {
    // Compras a futuro: comprado
    if (e.target.classList.contains("chk-comprado") && !e.target.disabled) {
      const item = estado.futuro.find((it) => it.id === e.target.dataset.id);
      if (item) {
        item.comprado = e.target.checked;
        guardar();
        renderFuturo();
      }
    }
    // Compra actual: incluir
    if (e.target.classList.contains("chk-incluir") && !e.target.disabled) {
      const item = estado.actual.find((it) => it.id === e.target.dataset.id);
      if (item) {
        item.incluir = e.target.checked;
        if (!item.incluir) item.comprado = false; // desmarcar comprado si se excluye
        guardar();
        renderActual();
      }
    }
    // Compra actual: comprado
    if (e.target.classList.contains("chk-actual") && !e.target.disabled) {
      const item = estado.actual.find((it) => it.id === e.target.dataset.id);
      if (item) {
        item.comprado = e.target.checked;
        guardar();
        renderActual();
      }
    }
    // Órdenes: estatus secuencial (pagado/enviado/casillero/enCr)
    if (e.target.classList.contains("chk-estatus") && !e.target.disabled) {
      cambiarEstatusOrden(e.target.dataset.id, e.target.dataset.campo, e.target.checked);
    }
  });

  // Enter/Escape mientras se edita en línea
  document.body.addEventListener("keydown", (e) => {
    if (!editando.id) return;
    if (e.target.classList && e.target.classList.contains("ed")) {
      if (e.key === "Enter") {
        e.preventDefault();
        guardarEdicion(editando.tab, editando.id);
      } else if (e.key === "Escape") {
        cancelarEdicion();
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
  if (estado.presupuestoActual) $("presupuestoActual").value = estado.presupuestoActual;
  if (estado.presupuestoFuturo) $("presupuestoFuturo").value = estado.presupuestoFuturo;
  if (estado.presupuestoCompras) $("presupuestoCompras").value = estado.presupuestoCompras;
  $("c-fecha").value = hoyISO(); // fecha de hoy por defecto en Compras
  initEventos();
  render();
  buscarTipoCambio(); // busca el tipo de cambio del día automáticamente
}

document.addEventListener("DOMContentLoaded", init);
