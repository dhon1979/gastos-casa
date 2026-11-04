/* ============================================================
   Gastos Casa — backend (Google Apps Script, ligado al Sheet)
   API JSON vía doPost. Front en GitHub Pages.
   ============================================================ */

var TZ = 'America/Argentina/Buenos_Aires';
var TOKEN_DIAS = 60;
var HOJAS = {
  Movimientos: ['ID', 'FechaHora', 'Fecha', 'Mes', 'Pagó', 'Descripción', 'Rubro', 'Subrubro', 'Moneda', 'Monto',
    'Cotización', 'MontoARS', 'Medio', 'Cuotas', 'Tipo', 'TextoOriginal', 'Origen', 'CargadoPor', 'CreadoEl', 'Estado', 'ModificadoEl'],
  Imputaciones: ['ID', 'MesCompra', 'Mes', 'Cuota', 'Pagó', 'Tipo', 'Rubro', 'Subrubro', 'Medio', 'Moneda', 'MontoOrig', 'MontoARS', 'Descripción'],
  Reglas: ['Palabra', 'Rubro', 'Subrubro', 'Origen', 'Fecha'],
  Cotizaciones: ['Fecha', 'Tipo', 'Compra', 'Venta', 'Fuente'],
  Cierres: ['Mes', 'TotalCompartido', 'Deudor', 'Acreedor', 'Monto', 'Detalle', 'RegistradoPor', 'FechaRegistro'],
  Config: ['Clave', 'Valor', 'Descripción']
};
var CONFIG_DEFAULT = [
  ['usuario1_nombre', 'Daniel', 'Nombre del usuario 1'],
  ['usuario1_pin', '1111', 'PIN de 4 a 6 dígitos (escribilo en claro: se cifra solo al primer ingreso)'],
  ['usuario2_nombre', 'Esposa', 'Nombre del usuario 2'],
  ['usuario2_pin', '2222', 'PIN de 4 a 6 dígitos (escribilo en claro: se cifra solo al primer ingreso)'],
  ['porcentaje_usuario1', '50', '% del gasto compartido que le toca al usuario 1 (50 = mitad y mitad)'],
  ['tipo_dolar', 'oficial', 'Cotización para gastos en USD: oficial, blue, bolsa, tarjeta, cripto'],
  ['cuota_primer_mes', 'mismo', '"mismo" = la 1ª cuota cae en el mes de compra; "siguiente" = cae el mes siguiente']
];
var RUBROS = ['Supermercado', 'Comida / delivery', 'Servicios', 'Vivienda / alquiler', 'Transporte / combustible', 'Salud / farmacia',
  'Educación', 'Hijos', 'Mascotas', 'Ropa', 'Ocio / salidas', 'Hogar / mantenimiento', 'Regalos', 'Varios'];
var MEDIOS = ['Efectivo', 'Débito', 'Tarjeta de crédito', 'Transferencia / MP'];

/* ------------------------- Menú y setup ------------------------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('💸 Gastos')
    .addItem('Configurar / reparar hojas', 'setup')
    .addItem('Reconstruir imputaciones', 'reconstruirImputaciones')
    .addToUi();
}

/** Ejecutar una vez desde el editor. Crea hojas, encabezados, config y reglas semilla. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(HOJAS).forEach(function (nombre) {
    var sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
    var h = HOJAS[nombre];
    sh.getRange(1, 1, 1, h.length).setValues([h])
      .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#305496').setFontFamily('Arial');
    sh.setFrozenRows(1);
  });
  var cfg = ss.getSheetByName('Config');
  if (cfg.getLastRow() < 2) cfg.getRange(2, 1, CONFIG_DEFAULT.length, 3).setValues(CONFIG_DEFAULT);
  var reg = ss.getSheetByName('Reglas');
  if (reg.getLastRow() < 2) {
    var hoy = new Date();
    var rows = SEED_REGLAS.map(function (r) { return [r[0], r[1], r[2], 'semilla', hoy]; });
    reg.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  var mov = ss.getSheetByName('Movimientos');
  mov.getRange('B:B').setNumberFormat('dd/MM/yyyy HH:mm');
  mov.getRange('C:C').setNumberFormat('dd/MM/yyyy');
  mov.getRange('D:D').setNumberFormat('@');
  mov.getRange('J:L').setNumberFormat('#,##0.00');
  ss.getSheetByName('Imputaciones').getRange('B:C').setNumberFormat('@');
  ss.getSheetByName('Cierres').getRange('A:A').setNumberFormat('@');
  var hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && hoja1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(hoja1);
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  cifrarPins_();
  return 'OK';
}

/* ------------------------- API ------------------------- */

function doGet() { return json_({ ok: true, app: 'gastos-casa', hora: new Date().toISOString() }); }

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents || '{}');
    var a = req.action;
    if (a === 'login') return json_(login_(req.pin));
    var user = verificarToken_(req.token);
    if (!user) return json_({ ok: false, error: 'SESION', mensaje: 'Sesión vencida, ingresá de nuevo.' });
    var h = {
      bootstrap: bootstrap_, guardar: guardar_, editar: editar_, anular: anular_,
      listar: listar_, panel: panel_, cerrarMes: cerrarMes_, reabrirMes: reabrirMes_, dolar: dolarAccion_
    }[a];
    if (!h) return json_({ ok: false, error: 'ACCION', mensaje: 'Acción desconocida: ' + a });
    return json_(h(req, user));
  } catch (err) {
    return json_({ ok: false, error: 'SERVIDOR', mensaje: String(err && err.message || err) });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ------------------------- Auth ------------------------- */

function config_() {
  var vals = hoja_('Config').getDataRange().getValues(), c = {};
  for (var i = 1; i < vals.length; i++) if (vals[i][0]) c[String(vals[i][0]).trim()] = vals[i][1];
  return c;
}
function usuarios_(c) { c = c || config_(); return [String(c.usuario1_nombre || 'Usuario 1'), String(c.usuario2_nombre || 'Usuario 2')]; }

function hash_(pin) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET') || '';
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'gastos:' + secret + ':' + pin);
  return 'sha256:' + Utilities.base64Encode(b);
}

function cifrarPins_() {
  var sh = hoja_('Config'), vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    var k = String(vals[i][0]), v = String(vals[i][1]).trim();
    if (/_pin$/.test(k) && /^\d{4,6}$/.test(v)) sh.getRange(i + 1, 2).setValue(hash_(v));
  }
}

function login_(pin) {
  var cache = CacheService.getScriptCache();
  var fallos = Number(cache.get('fallos') || 0);
  if (fallos >= 6) return { ok: false, error: 'BLOQUEO', mensaje: 'Demasiados intentos. Probá en 15 minutos.' };
  pin = String(pin || '').trim();
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: 'PIN', mensaje: 'PIN inválido.' };
  cifrarPins_();
  var c = config_(), h = hash_(pin), users = usuarios_(c), quien = null;
  if (String(c.usuario1_pin) === h) quien = users[0];
  else if (String(c.usuario2_pin) === h) quien = users[1];
  if (!quien) {
    cache.put('fallos', String(fallos + 1), 900);
    return { ok: false, error: 'PIN', mensaje: 'PIN incorrecto.' };
  }
  cache.remove('fallos');
  var exp = Date.now() + TOKEN_DIAS * 864e5;
  var payload = quien + '|' + exp;
  return { ok: true, token: Utilities.base64EncodeWebSafe(payload) + '.' + firma_(payload), usuario: quien, usuarios: users };
}

function firma_(payload) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret));
}

function verificarToken_(token) {
  if (!token || token.indexOf('.') < 0) return null;
  var parts = token.split('.');
  var payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  if (firma_(payload) !== parts[1]) return null;
  var p = payload.split('|');
  if (Number(p[1]) < Date.now()) return null;
  if (usuarios_().indexOf(p[0]) < 0) return null; // cambió el nombre en Config
  return p[0];
}

/* ------------------------- Acciones ------------------------- */

function bootstrap_(req, user) {
  var c = config_();
  var reglas = hoja_('Reglas').getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { palabra: String(r[0]), rubro: String(r[1]), subrubro: String(r[2]) }; });
  var dolar = null;
  try { dolar = cotizacion_(hoyStr_()); } catch (e) { }
  return {
    ok: true, usuario: user, usuarios: usuarios_(c), reglas: reglas, rubros: RUBROS, medios: MEDIOS, dolar: dolar,
    config: { tipoDolar: String(c.tipo_dolar || 'oficial'), porcentajeU1: Number(c.porcentaje_usuario1 || 50), cuotaPrimerMes: String(c.cuota_primer_mes || 'mismo') }
  };
}

function guardar_(req, user) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var m = req.mov || {};
    var sh = hoja_('Movimientos');
    if (m.id && buscarFila_(sh, m.id) > 0) return { ok: true, duplicado: true, id: m.id };
    var fila = armarFila_(m, user, null);
    sh.appendRow(fila);
    if (m.aprender) aprender_(m.aprender);
    reconstruirImputaciones();
    return { ok: true, id: fila[0], mov: filaAObj_(fila) };
  } finally { lock.releaseLock(); }
}

function editar_(req, user) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var m = req.mov || {}, sh = hoja_('Movimientos'), r = buscarFila_(sh, m.id);
    if (r < 0) return { ok: false, mensaje: 'No encontré el movimiento.' };
    var prev = sh.getRange(r, 1, 1, HOJAS.Movimientos.length).getValues()[0];
    var fila = armarFila_(m, user, prev);
    sh.getRange(r, 1, 1, fila.length).setValues([fila]);
    if (m.aprender) aprender_(m.aprender);
    reconstruirImputaciones();
    return { ok: true, mov: filaAObj_(fila) };
  } finally { lock.releaseLock(); }
}

function anular_(req, user) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = hoja_('Movimientos'), r = buscarFila_(sh, req.id);
    if (r < 0) return { ok: false, mensaje: 'No encontré el movimiento.' };
    var col = HOJAS.Movimientos.indexOf('Estado') + 1;
    sh.getRange(r, col, 1, 2).setValues([[req.restaurar ? 'Activo' : 'Anulado', new Date()]]);
    reconstruirImputaciones();
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function listar_(req, user) {
  var mes = req.mes || mesStr_(new Date());
  var movs = leerMovs_();
  var delMes = movs.filter(function (m) { return m.mes === mes && m.estado !== 'Anulado'; });
  var c = config_();
  var cuotasPrevias = imputar(movs.filter(function (m) { return m.mes < mes; }), c.cuota_primer_mes === 'siguiente')
    .filter(function (x) { return x.mes === mes; });
  var anulados = movs.filter(function (m) { return m.mes === mes && m.estado === 'Anulado'; });
  return { ok: true, mes: mes, movimientos: delMes.reverse(), cuotasPrevias: cuotasPrevias, anulados: anulados };
}

function panel_(req, user) {
  var mes = req.mes || mesStr_(new Date());
  var c = config_(), users = usuarios_(c);
  var imps = imputar(leerMovs_(), c.cuota_primer_mes === 'siguiente');
  var p = calcularPanel(imps, mes, users, c.porcentaje_usuario1);
  p.cierre = leerCierre_(mes);
  if (p.cierre) p.cierre.cambio = Math.abs(Number(p.cierre.monto) - p.compensacion.monto) >= 1 || (p.cierre.deudor || '') !== (p.compensacion.deudor || '');
  try { p.dolar = cotizacion_(hoyStr_()); } catch (e) { p.dolar = null; }
  p.usdEquivalente = p.dolar && p.dolar.venta ? round2(p.totales.totalARS / p.dolar.venta) : null;
  p.ok = true; p.usuarios = users;
  return p;
}

function cerrarMes_(req, user) {
  var p = panel_({ mes: req.mes }, user), cmp = p.compensacion;
  var sh = hoja_('Cierres'), vals = sh.getDataRange().getValues(), fila = -1;
  for (var i = 1; i < vals.length; i++) if (mesDe_(vals[i][0]) === req.mes) fila = i + 1;
  var detalle = p.usuarios.map(function (u) { return u + ' pagó ' + cmp.pagado[u] + ' (le tocaba ' + cmp.corresponde[u] + ')'; }).join(' · ');
  var row = [req.mes, cmp.totalCompartido, cmp.deudor || '', cmp.acreedor || '', cmp.monto, detalle, user, new Date()];
  if (fila > 0) sh.getRange(fila, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  return { ok: true, cierre: leerCierre_(req.mes) };
}

function reabrirMes_(req, user) {
  var sh = hoja_('Cierres'), vals = sh.getDataRange().getValues();
  for (var i = vals.length - 1; i >= 1; i--) if (mesDe_(vals[i][0]) === req.mes) sh.deleteRow(i + 1);
  return { ok: true };
}

function dolarAccion_(req) { return { ok: true, dolar: cotizacion_(req.fecha || hoyStr_()) }; }

/* ------------------------- Movimientos ------------------------- */

function armarFila_(m, user, prev) {
  var users = usuarios_();
  var monto = Number(m.monto);
  if (!(monto > 0)) throw new Error('El monto tiene que ser mayor a cero.');
  var moneda = m.moneda === 'USD' ? 'USD' : 'ARS';
  var medio = MEDIOS.indexOf(m.medio) >= 0 ? m.medio : 'Efectivo';
  var cuotas = medio === 'Tarjeta de crédito' ? Math.min(36, Math.max(1, parseInt(m.cuotas, 10) || 1)) : 1;
  var tipo = m.tipo === 'Personal' ? 'Personal' : 'Compartido';
  var pago = users.indexOf(m.pago) >= 0 ? m.pago : user;
  var fh = m.fechaHora ? Utilities.parseDate(String(m.fechaHora).slice(0, 16), TZ, "yyyy-MM-dd'T'HH:mm") : new Date();
  var fechaStr = Utilities.formatDate(fh, TZ, 'yyyy-MM-dd');
  var cot = 1;
  if (moneda === 'USD') {
    if (Number(m.cotizacion) > 0) cot = Number(m.cotizacion);
    else if (prev && prev[8] === 'USD' && Utilities.formatDate(new Date(prev[2]), TZ, 'yyyy-MM-dd') === fechaStr) cot = Number(prev[10]);
    else cot = cotizacion_(fechaStr).venta;
  }
  var ahora = new Date();
  return [
    prev ? prev[0] : (m.id || Utilities.getUuid()),
    fh, Utilities.parseDate(fechaStr, TZ, 'yyyy-MM-dd'), fechaStr.slice(0, 7),
    pago, String(m.descripcion || '').slice(0, 200) || '(sin descripción)',
    String(m.rubro || 'Varios'), String(m.subrubro || 'Sin clasificar'),
    moneda, round2(monto), cot, round2(monto * cot), medio, cuotas, tipo,
    prev ? prev[15] : String(m.texto || ''), prev ? prev[16] : String(m.origen || 'manual'),
    prev ? prev[17] : user, prev ? prev[18] : ahora, prev ? (prev[19] || 'Activo') : 'Activo', prev ? ahora : ''
  ];
}

function filaAObj_(r) {
  var f = function (d, p) { return esFecha_(d) ? Utilities.formatDate(d, TZ, p) : String(d || ''); };
  return {
    id: String(r[0]), fechaHora: f(r[1], "yyyy-MM-dd'T'HH:mm"), fecha: f(r[2], 'yyyy-MM-dd'), mes: String(r[3]),
    pago: String(r[4]), descripcion: String(r[5]), rubro: String(r[6]), subrubro: String(r[7]),
    moneda: String(r[8]), monto: Number(r[9]), cotizacion: Number(r[10]), montoARS: Number(r[11]),
    medio: String(r[12]), cuotas: Number(r[13]) || 1, tipo: String(r[14]), texto: String(r[15]),
    origen: String(r[16]), cargadoPor: String(r[17]), estado: String(r[19] || 'Activo')
  };
}

function leerMovs_() {
  var v = hoja_('Movimientos').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (!v[i][0]) continue;
    var o = filaAObj_(v[i]);
    if (!/^\d{4}-\d{2}$/.test(o.mes) && esFecha_(v[i][2])) o.mes = Utilities.formatDate(v[i][2], TZ, 'yyyy-MM');
    out.push(o);
  }
  return out;
}

function buscarFila_(sh, id) {
  if (!id) return -1;
  var ids = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 1).getValues();
  for (var i = ids.length - 1; i >= 1; i--) if (String(ids[i][0]) === String(id)) return i + 1;
  return -1;
}

/** Reescribe la hoja Imputaciones (base plana para tablas dinámicas). */
function reconstruirImputaciones() {
  var c = config_();
  var imps = imputar(leerMovs_(), c.cuota_primer_mes === 'siguiente');
  var sh = hoja_('Imputaciones');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, HOJAS.Imputaciones.length).clearContent();
  if (!imps.length) return;
  var rows = imps.map(function (x) {
    return [x.id, x.mesCompra, x.mes, x.cuota, x.pago, x.tipo, x.rubro, x.subrubro, x.medio, x.moneda, x.montoOrig, x.montoARS, x.descripcion];
  });
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/* ------------------------- Reglas ------------------------- */

function aprender_(a) {
  var k = normKey(a.palabra);
  if (!k || k.length < 3 || !a.rubro) return;
  var sh = hoja_('Reglas'), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (normKey(v[i][0]) === k) {
      sh.getRange(i + 1, 2, 1, 4).setValues([[a.rubro, a.subrubro || 'Otros', 'aprendida', new Date()]]);
      return;
    }
  }
  sh.appendRow([k, a.rubro, a.subrubro || 'Otros', 'aprendida', new Date()]);
}

/* ------------------------- Cotización USD ------------------------- */

/** Venta del dólar configurado para una fecha 'yyyy-MM-dd'. Cachea en la hoja Cotizaciones. */
function cotizacion_(fecha) {
  var tipo = String(config_().tipo_dolar || 'oficial').toLowerCase();
  var sh = hoja_('Cotizaciones'), v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    var f = esFecha_(v[i][0]) ? Utilities.formatDate(v[i][0], TZ, 'yyyy-MM-dd') : String(v[i][0]);
    if (f === fecha && String(v[i][1]) === tipo) return { fecha: fecha, tipo: tipo, compra: Number(v[i][2]), venta: Number(v[i][3]) };
  }
  var r = null;
  try {
    if (fecha === hoyStr_()) {
      var res = UrlFetchApp.fetch('https://dolarapi.com/v1/dolares/' + tipo, { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) { var d = JSON.parse(res.getContentText()); r = { compra: d.compra, venta: d.venta, fuente: 'dolarapi' }; }
    } else {
      // históricos: hasta 6 días hacia atrás (fines de semana / feriados)
      var dt = Utilities.parseDate(fecha, TZ, 'yyyy-MM-dd');
      for (var k = 0; k < 6 && !r; k++) {
        var p = Utilities.formatDate(new Date(dt.getTime() - k * 864e5), TZ, 'yyyy/MM/dd');
        var res2 = UrlFetchApp.fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares/' + tipo + '/' + p, { muteHttpExceptions: true });
        if (res2.getResponseCode() === 200) { var d2 = JSON.parse(res2.getContentText()); if (d2 && d2.venta) r = { compra: d2.compra, venta: d2.venta, fuente: 'argentinadatos' }; }
      }
    }
  } catch (e) { }
  if (!r) {
    // último valor conocido del mismo tipo
    for (var j = v.length - 1; j >= 1; j--) if (String(v[j][1]) === tipo) return { fecha: fecha, tipo: tipo, compra: Number(v[j][2]), venta: Number(v[j][3]), aproximada: true };
    throw new Error('No pude obtener la cotización del dólar. Cargala a mano en el gasto.');
  }
  sh.appendRow([fecha, tipo, r.compra, r.venta, r.fuente]);
  return { fecha: fecha, tipo: tipo, compra: Number(r.compra), venta: Number(r.venta) };
}

/* ------------------------- Utilidades ------------------------- */

function hoja_(n) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n);
  if (!sh) throw new Error('Falta la hoja "' + n + '". Ejecutá setup() desde el menú 💸 Gastos.');
  return sh;
}
function esFecha_(x) { return !!x && typeof x === 'object' && typeof x.getTime === 'function'; }
function mesDe_(x) { return esFecha_(x) ? Utilities.formatDate(x, TZ, 'yyyy-MM') : String(x); }
function hoyStr_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function mesStr_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM'); }
function leerCierre_(mes) {
  var v = hoja_('Cierres').getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (mesDe_(v[i][0]) === mes) {
    return { mes: mes, totalCompartido: Number(v[i][1]), deudor: String(v[i][2]), acreedor: String(v[i][3]), monto: Number(v[i][4]),
      detalle: String(v[i][5]), registradoPor: String(v[i][6]), fecha: esFecha_(v[i][7]) ? Utilities.formatDate(v[i][7], TZ, 'dd/MM/yyyy HH:mm') : '' };
  }
  return null;
}
