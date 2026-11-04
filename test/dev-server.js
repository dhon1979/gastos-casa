// Servidor de desarrollo: sirve el frontend y simula Apps Script en /api
const http = require('http'), fs = require('fs'), path = require('path');
const { ctx, sheets } = require('./mock-gas.js');
ctx.setup();
const c = sheets.Config.data; c[1][1] = 'Daniel'; c[2][1] = '1234'; c[3][1] = 'Vero'; c[4][1] = '5678';
const call = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).t);
const tk = { D: call({ action: 'login', pin: '1234' }).token, V: call({ action: 'login', pin: '5678' }).token };
const demo = [['D','2026-11-01T10:15',95000,'ARS','Débito','Compartido','Súper Carrefour','Supermercado','Supermercado'],
 ['V','2026-11-01T18:40',12500,'ARS','Efectivo','Compartido','Verdulería','Supermercado','Verdulería'],
 ['V','2026-11-02T11:00',28400,'ARS','Transferencia / MP','Compartido','Carnicería','Supermercado','Carnicería'],
 ['D','2026-11-02T21:30',38000,'ARS','Tarjeta de crédito','Compartido','Pizza delivery','Comida / delivery','Delivery'],
 ['V','2026-11-03T09:10',42000,'ARS','Débito','Compartido','Alimento para el perro','Mascotas','Alimento mascotas'],
 ['D','2026-11-03T13:20',180000,'ARS','Tarjeta de crédito','Compartido','Zapatillas',  'Ropa','Calzado',6],
 ['D','2026-11-03T20:00',15,'USD','Tarjeta de crédito','Compartido','Spotify','Servicios','Streaming y apps'],
 ['V','2026-11-04T08:30',22000,'ARS','Efectivo','Personal','Peluquería','Salud / farmacia','Cuidado personal'],
 ['D','2026-11-04T10:00',60000,'ARS','Débito','Compartido','Nafta YPF','Transporte / combustible','Combustible'],
 ['D','2026-10-05T10:00',310000,'ARS','Débito','Compartido','Súper del mes','Supermercado','Supermercado'],
 ['V','2026-10-12T10:00',140000,'ARS','Débito','Compartido','Luz y gas','Servicios','Luz'],
 ['V','2026-09-10T10:00',250000,'ARS','Débito','Compartido','Súper','Supermercado','Supermercado'],
 ['D','2026-08-10T10:00',190000,'ARS','Débito','Compartido','Súper','Supermercado','Supermercado'],
 ['V','2026-10-20T10:00',60000,'ARS','Efectivo','Personal','Ropa','Ropa','Ropa']];
demo.forEach((d,i)=>call({action:'guardar',token:tk[d[0]],mov:{id:'demo'+i,fechaHora:d[1],monto:d[2],moneda:d[3],medio:d[4],tipo:d[5],descripcion:d[6],rubro:d[7],subrubro:d[8],cuotas:d[9]||1}}));
const root = path.join(__dirname, '../docs');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png' };
http.createServer((req, res) => {
  if (req.url === '/api' && req.method === 'POST') {
    let b = ''; req.on('data', d => b += d); req.on('end', () => { res.setHeader('Content-Type','application/json'); res.end(ctx.doPost({ postData: { contents: b } }).t); });
    return;
  }
  if (req.url === '/config.js') { res.setHeader('Content-Type','text/javascript'); return res.end("window.GASTOS_CONFIG={API_URL:'/api'};"); }
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; return res.end('404'); } res.setHeader('Content-Type', types[path.extname(f)] || 'text/plain'); res.end(d); });
}).listen(8080, () => console.log('http://localhost:8080  PINs: Daniel 1234 · Vero 5678'));
