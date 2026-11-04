// Simula el entorno de Apps Script en memoria y prueba el backend de punta a punta.
const { ctx, sheets } = require('./mock-gas.js');
const call = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).t);
let fails = 0;
const check = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

ctx.setup();
check(sheets.Reglas.data.length > 500, 'setup crea reglas semilla (' + (sheets.Reglas.data.length - 1) + ')');
const cfg = sheets.Config.data;
cfg[1][1] = 'Daniel'; cfg[2][1] = '4321'; cfg[3][1] = 'Sofía'; cfg[4][1] = '8765';
check(String(sheets.Config.data[2][1]).length === 4, 'PIN cargado en claro');

let r = call({ action: 'login', pin: '0000' });
check(!r.ok && r.error === 'PIN', 'PIN incorrecto rechazado');
const d = call({ action: 'login', pin: '4321' });
const s = call({ action: 'login', pin: '8765' });
check(d.ok && d.usuario === 'Daniel' && s.usuario === 'Sofía', 'login de ambos usuarios');
check(String(sheets.Config.data[2][1]).startsWith('sha256:'), 'PIN queda cifrado en el Sheet');
check(!call({ action: 'panel', token: d.token + 'x' }).ok, 'token adulterado rechazado');

const b = call({ action: 'bootstrap', token: d.token });
check(b.ok && b.reglas.length > 500 && b.dolar.venta === 1450, 'bootstrap con reglas y dólar');

const g = (tok, mov) => call({ action: 'guardar', token: tok, mov });
g(d.token, { id: 'a1', fechaHora: '2026-11-02T10:00', monto: 100000, moneda: 'ARS', medio: 'Débito', tipo: 'Compartido', descripcion: 'Súper', rubro: 'Supermercado', subrubro: 'Supermercado' });
g(s.token, { id: 'a2', fechaHora: '2026-11-03T12:00', monto: 40000, moneda: 'ARS', medio: 'Efectivo', tipo: 'Compartido', descripcion: 'Verdulería', rubro: 'Supermercado', subrubro: 'Verdulería' });
g(s.token, { id: 'a3', fechaHora: '2026-11-03T13:00', monto: 90000, moneda: 'ARS', medio: 'Tarjeta de crédito', cuotas: 3, tipo: 'Compartido', descripcion: 'Zapatillas', rubro: 'Ropa', subrubro: 'Calzado' });
g(d.token, { id: 'a4', fechaHora: '2026-11-04T09:00', monto: 20, moneda: 'USD', medio: 'Tarjeta de crédito', tipo: 'Compartido', descripcion: 'Spotify', rubro: 'Servicios', subrubro: 'Streaming y apps' });
g(d.token, { id: 'a5', fechaHora: '2026-11-04T09:30', monto: 50000, moneda: 'ARS', medio: 'Efectivo', tipo: 'Personal', descripcion: 'Peluquería', rubro: 'Salud / farmacia', subrubro: 'Cuidado personal' });
const dup = g(d.token, { id: 'a1', monto: 1 });
check(dup.duplicado, 'reenvío offline no duplica');
check(sheets.Movimientos.data.length === 6, '5 movimientos guardados');
check(sheets.Imputaciones.data.length === 8, 'imputaciones: 7 filas (3 cuotas) + encabezado');

let p = call({ action: 'panel', token: d.token, mes: '2026-11' });
// Compartido nov: Daniel 100000 + 20*1450=29000 → 129000 ; Sofía 40000 + 30000 (cuota 1/3) = 70000 ; total 199000; mitad 99500
check(p.totales.compartidoARS === 199000, 'total compartido nov = 199.000 (' + p.totales.compartidoARS + ')');
check(p.compensacion.deudor === 'Sofía' && p.compensacion.acreedor === 'Daniel' && p.compensacion.monto === 29500, 'Sofía le debe 29.500 a Daniel (' + JSON.stringify([p.compensacion.deudor, p.compensacion.monto]) + ')');
check(p.totales.personalARS === 50000, 'personal fuera de la compensación');
check(p.totales.usdNominal === 20, 'USD nominal = 20');
check(p.cuotasFuturas.length === 2 && p.cuotasFuturas[0].montoARS === 30000, 'cuotas futuras dic/ene = 30.000');
check(p.porRubro[0].rubro === 'Supermercado' && p.porRubro[0].subrubros.length === 2, 'panel por rubro y subrubro');

let pd = call({ action: 'panel', token: s.token, mes: '2026-12' });
check(pd.compensacion.deudor === 'Daniel' && pd.compensacion.monto === 15000, 'dic: cuota 2/3 → Daniel debe 15.000');

const ed = call({ action: 'editar', token: s.token, mov: { id: 'a2', fechaHora: '2026-11-03T12:00', monto: 40000, moneda: 'ARS', medio: 'Efectivo', tipo: 'Compartido', descripcion: 'Verdu del barrio', rubro: 'Supermercado', subrubro: 'Verdulería', aprender: { palabra: 'verdu del barrio', rubro: 'Supermercado', subrubro: 'Verdulería' } } });
check(ed.ok && sheets.Reglas.data.some(r => r[0] === 'verdu del barrio' && r[3] === 'aprendida'), 'edición aprende nueva regla');

call({ action: 'anular', token: d.token, id: 'a5' });
p = call({ action: 'panel', token: d.token, mes: '2026-11' });
check(p.totales.personalARS === 0, 'anulado sale del panel');

const c = call({ action: 'cerrarMes', token: d.token, mes: '2026-11' });
check(c.ok && c.cierre.monto === 29500 && c.cierre.deudor === 'Sofía', 'cierre de mes registrado');
g(s.token, { id: 'a6', fechaHora: '2026-11-04T20:00', monto: 10000, moneda: 'ARS', medio: 'Efectivo', tipo: 'Compartido', descripcion: 'Pizza', rubro: 'Comida / delivery', subrubro: 'Comida rápida' });
p = call({ action: 'panel', token: d.token, mes: '2026-11' });
check(p.cierre && p.cierre.cambio === true, 'avisa si cambió después del cierre');

const l = call({ action: 'listar', token: d.token, mes: '2026-12' });
check(l.movimientos.length === 0 && l.cuotasPrevias.length === 1 && l.cuotasPrevias[0].cuota === '2/3', 'listado dic muestra cuota 2/3 de compra previa');

for (let i = 0; i < 6; i++) call({ action: 'login', pin: '9999' });
check(call({ action: 'login', pin: '4321' }).error === 'BLOQUEO', 'bloqueo tras 6 intentos fallidos');

console.log(fails ? `\n${fails} fallas` : '\nBackend OK');
process.exit(fails ? 1 : 0);
