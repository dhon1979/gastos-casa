const P = require('../docs/parser.js');
const cases = [
  ['gasté 15 mil en el súper con débito', { monto: 15000, medio: 'Débito', rubro: 'Supermercado', subrubro: 'Supermercado' }],
  ['zapatillas 90 mil en 3 cuotas con la Visa', { monto: 90000, cuotas: 3, medio: 'Tarjeta de crédito', subrubro: 'Calzado' }],
  ['verdulería 8500 efectivo', { monto: 8500, medio: 'Efectivo', subrubro: 'Verdulería' }],
  ['carnicería $23.450 con mercado pago', { monto: 23450, medio: 'Transferencia / MP', subrubro: 'Carnicería' }],
  ['alimento para el perro 42000 débito', { monto: 42000, rubro: 'Mascotas', subrubro: 'Alimento mascotas' }],
  ['pagué 120 dólares el hotel con la master', { monto: 120, moneda: 'USD', subrubro: 'Viajes', medio: 'Tarjeta de crédito' }],
  ['nafta 50 lucas en ypf', { monto: 50000, subrubro: 'Combustible' }],
  ['ayer cenamos afuera 65 mil', { monto: 65000, diasAtras: 1, subrubro: 'Restaurante' }],
  ['peluquería 18 mil es personal', { monto: 18000, tipo: 'Personal', subrubro: 'Cuidado personal' }],
  ['quince mil quinientos farmacia', { monto: 15500, subrubro: 'Farmacia' }],
  ['luz 1,5 palos transferencia', { monto: 1500000, subrubro: 'Luz' }],
  ['heladera 1.200.000 en doce cuotas sin interés', { monto: 1200000, cuotas: 12, medio: 'Tarjeta de crédito', subrubro: 'Electrodomésticos' }],
  ['pago con tarjeta de débito 3200 panadería', { monto: 3200, medio: 'Débito', subrubro: 'Panadería' }],
  ['netflix 9.999,50', { monto: 9999.5, subrubro: 'Streaming y apps' }],
  ['cosa rara 1000', { monto: 1000, rubro: 'Varios' }],
];
let fail = 0;
for (const [txt, exp] of cases) {
  const r = P.parse(txt);
  const bad = Object.keys(exp).filter(k => r[k] !== exp[k]);
  console.log((bad.length ? 'FAIL ' : 'ok   ') + txt.padEnd(48) + ` → ${r.monto} ${r.moneda} | ${r.medio} | x${r.cuotas} | ${r.tipo} | -${r.diasAtras}d | "${r.descripcion}" | ${r.rubro} › ${r.subrubro}`);
  if (bad.length) { fail++; console.log('      esperado:', bad.map(k => `${k}=${exp[k]} (got ${r[k]})`).join(', ')); }
}
console.log(fail ? `\n${fail} fallas` : '\nTodo OK');
process.exit(fail ? 1 : 0);
