/* ============================================================
   Gastos Casa — parser de mensajes de voz / texto
   Extrae: monto, moneda, medio de pago, cuotas, fecha, tipo
   (Compartido/Personal), descripción y rubro/subrubro por reglas.
   Sin IA: todo determinístico. Funciona en navegador y en Node.
   ============================================================ */
(function (global) {
  'use strict';

  // ---------- Normalización (mismo largo que el original) ----------
  function norm(s) {
    let out = '';
    for (const ch of String(s || '')) {
      const base = ch.normalize('NFD')[0] || ch;
      out += base.toLowerCase();
    }
    return out;
  }
  function normKey(s) {
    return norm(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // ---------- Números en palabras ----------
  const UNI = { cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9,
    diez:10, once:11, doce:12, trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19,
    veinte:20, veintiun:21, veintiuno:21, veintiuna:21, veintidos:22, veintitres:23, veinticuatro:24, veinticinco:25,
    veintiseis:26, veintisiete:27, veintiocho:28, veintinueve:29,
    treinta:30, cuarenta:40, cincuenta:50, sesenta:60, setenta:70, ochenta:80, noventa:90,
    cien:100, ciento:100, doscientos:200, doscientas:200, trescientos:300, trescientas:300, cuatrocientos:400, cuatrocientas:400,
    quinientos:500, quinientas:500, seiscientos:600, seiscientas:600, setecientos:700, setecientas:700,
    ochocientos:800, ochocientas:800, novecientos:900, novecientas:900 };
  const MULT = { mil:1e3, luca:1e3, lucas:1e3, millon:1e6, millones:1e6, palo:1e6, palos:1e6 };

  function wordsToNumber(words) {
    let total = 0, current = 0, any = false;
    for (const w of words) {
      if (w === 'y') continue;
      if (UNI[w] !== undefined) { current += UNI[w]; any = true; }
      else if (w === 'mil' || w === 'luca' || w === 'lucas') { total += (current || 1) * 1000; current = 0; any = true; }
      else if (MULT[w] === 1e6) { total = (total + (current || 1)) * 1e6; current = 0; any = true; }
      else return null;
    }
    return any ? total + current : null;
  }

  // ---------- Diccionarios fijos ----------
  const MEDIOS = [
    { medio: 'Débito', re: /\b(?:con |en |por )?(?:la |el |una )?(?:tarjeta de debito|debito|maestro)\b/g },
    { medio: 'Tarjeta de crédito', re: /\b(?:con |en |por )?(?:la |el |una )?(?:tarjeta de credito|credito|visa|master ?card|master|amex|american express|naranja|cabal|tarjeta)\b/g },
    { medio: 'Efectivo', re: /\b(?:con |en |por )?(?:el )?(?:efectivo|cash|billetes?|en mano)\b/g },
    { medio: 'Transferencia / MP', re: /\b(?:con |en |por |via )?(?:la |el |una )?(?:transferencia|transferi|transferimos|mercado ?pago|mp|qr|cvu|alias|modo|uala|billetera virtual)\b/g }
  ];
  const USD_RE = /\b(?:dolares?|usd|u\$s|us\$|verdes|dolar)\b|u\$s|us\$/g;
  const PESOS_RE = /\b(?:pesos?|mangos|ars)\b/g;
  const PERSONAL_RE = /\b(?:gasto personal|es personal|personal|solo (?:para )?mi|para mi solo|para mi sola|es mio|es mia|mio|mia)\b/g;
  const CUOTAS_RE = /\b(?:en |a )?(\d{1,2}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|dieciocho|veinticuatro) cuotas?(?: sin interes| fijas| con interes)?\b/g;
  const FECHA_RE = /\b(?:antes de ayer|anteayer|ayer|hoy|esta manana|esta tarde|esta noche|anoche)\b/g;
  const FILLER = new Set(['gaste','gastamos','gasto','pague','pagamos','pago','compre','compramos','compra','son','fueron','fue',
    'de','del','en','el','la','los','las','con','por','un','una','unos','unas','al','para','y','a','que','me','nos','le','les',
    'salio','salieron','cuesta','costo','total','aprox','aproximadamente','mas','o','sea','eh','este','esta','hoy','unos']);
  const CUOTA_WORD = { un:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12, dieciocho:18, veinticuatro:24 };

  // ---------- Tarjetas y titular ----------
  const CARD_WORD_RE = /\b(?:tarjeta|visa|master ?card|master|amex|american express|naranja|cabal|debito|credito|plastico|adicional|extension)\b/g;
  const MI_CARD_RE = /\b(?:con |en |por )?mi (?=(?:tarjeta|visa|master|amex|naranja|cabal|debito|credito|plastico|adicional)\b)/;
  const MEDIO_CRED = 'Tarjeta de crédito', MEDIO_DEB = 'Débito';
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function normTarjetas(list) {
    return (list || []).map(t => {
      const tipo = norm(t.medio || t.tipo || '');
      const claves = String(t.claves || t.palabras || '').split(/[,;]/).map(normKey).filter(Boolean);
      return { nombre: String(t.nombre || t.tarjeta || ''), titular: String(t.titular || ''), medio: /deb/.test(tipo) ? MEDIO_DEB : MEDIO_CRED, claves };
    }).filter(t => t.nombre);
  }
  const firstKey = u => normKey(u).split(' ')[0];

  // ---------- Montos ----------
  function parseNumericToken(raw) {
    let t = raw;
    if (/^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/.test(t)) {
      // separadores de miles (y quizás decimales al final)
      const m = t.match(/^(.*?)(?:[.,](\d{1,2}))?$/);
      const intPart = m[1].replace(/[.,]/g, '');
      return parseFloat(intPart + (m[2] ? '.' + m[2] : ''));
    }
    if (/^\d+[.,]\d+$/.test(t)) return parseFloat(t.replace(',', '.'));
    return parseFloat(t);
  }

  function findAmounts(n) {
    const found = [];
    // numérico + multiplicador opcional
    const numRe = /(?:\$|u\$s|us\$)?\s?(\d+(?:[.,]\d+)*)\s?(mil|k|lucas?|millones|millon|palos?)?\b/g;
    let m;
    while ((m = numRe.exec(n))) {
      let v = parseNumericToken(m[1]);
      if (isNaN(v)) continue;
      const mult = m[2];
      if (mult) v *= (mult === 'k' ? 1e3 : (MULT[mult] || 1));
      const hasCur = /\$|u\$s|us\$/.test(m[0]);
      found.push({ value: v, start: m.index, end: m.index + m[0].length, cur: hasCur, mult: !!mult });
    }
    // palabras
    const tokRe = /[a-z]+/g;
    const toks = [];
    while ((m = tokRe.exec(n))) toks.push({ w: m[0], s: m.index, e: m.index + m[0].length });
    for (let i = 0; i < toks.length; i++) {
      if (UNI[toks[i].w] === undefined && MULT[toks[i].w] === undefined) continue;
      let j = i, words = [];
      while (j < toks.length && (UNI[toks[j].w] !== undefined || MULT[toks[j].w] !== undefined || (toks[j].w === 'y' && words.length))) {
        words.push(toks[j].w); j++;
      }
      while (words.length && words[words.length - 1] === 'y') { words.pop(); j--; }
      // "un"/"una" sueltos no son montos
      if (words.length === 1 && /^(un|una|uno)$/.test(words[0])) continue;
      const v = wordsToNumber(words);
      if (v) found.push({ value: v, start: toks[i].s, end: toks[j - 1].e, cur: false, mult: words.some(w => MULT[w]) });
      i = j - 1;
    }
    // un número seguido de "mil" en palabras: "15 mil" ya cubierto; "mil quinientos" cubierto.
    return found;
  }

  // ---------- Clasificación ----------
  function compileRules(rules) {
    return (rules || [])
      .map(r => ({ k: normKey(r.palabra || r.k), rubro: r.rubro, subrubro: r.subrubro }))
      .filter(r => r.k)
      .sort((a, b) => b.k.length - a.k.length)
      .map(r => Object.assign(r, { re: new RegExp('(?:^| )' + r.k.replace(/ /g, ' (?:[a-z]+ )?') + '(?:s|es)?(?= |$)') }));
  }

  function classify(text, compiled) {
    const t = ' ' + normKey(text) + ' ';
    for (const r of compiled) {
      if (r.re.test(t.trim()) || r.re.test(t)) return { rubro: r.rubro, subrubro: r.subrubro, regla: r.k };
    }
    return { rubro: 'Varios', subrubro: 'Sin clasificar', regla: null };
  }

  // ---------- Parse principal ----------
  function parse(text, opts) {
    opts = opts || {};
    const original = String(text || '').trim();
    const n = norm(original);
    const spans = []; // [start,end) a quitar de la descripción
    const res = {
      texto: original, monto: null, moneda: 'ARS', medio: null, cuotas: 1,
      tipo: 'Compartido', personalDe: null, tarjeta: null, titular: null, diasAtras: 0, descripcion: '', rubro: 'Varios', subrubro: 'Sin clasificar', regla: null
    };
    let m;

    // cuotas
    CUOTAS_RE.lastIndex = 0;
    if ((m = CUOTAS_RE.exec(n))) {
      const c = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : CUOTA_WORD[m[1]];
      if (c >= 1 && c <= 36) res.cuotas = c;
      spans.push([m.index, m.index + m[0].length]);
    }
    const inSpans = (s, e) => spans.some(([a, b]) => s < b && e > a);

    // medio
    for (const md of MEDIOS) {
      md.re.lastIndex = 0;
      while ((m = md.re.exec(n))) {
        if (inSpans(m.index, m.index + m[0].length)) continue;
        if (!res.medio) res.medio = md.medio;
        spans.push([m.index, m.index + m[0].length]);
      }
    }
    if (res.cuotas > 1 && !res.medio) res.medio = 'Tarjeta de crédito';

    // moneda
    USD_RE.lastIndex = 0;
    while ((m = USD_RE.exec(n))) { res.moneda = 'USD'; spans.push([m.index, m.index + m[0].length]); }
    PESOS_RE.lastIndex = 0;
    while ((m = PESOS_RE.exec(n))) spans.push([m.index, m.index + m[0].length]);

    // tipo
    PERSONAL_RE.lastIndex = 0;
    if ((m = PERSONAL_RE.exec(n))) { res.tipo = 'Personal'; spans.push([m.index, m.index + m[0].length]); }
    if (/\b(?:compartido|entre los dos|de la casa|para la casa)\b/.test(n)) {
      res.tipo = 'Compartido';
      const mm = n.match(/\b(?:compartido|entre los dos)\b/);
      if (mm) spans.push([mm.index, mm.index + mm[0].length]);
    }

    // personal de X
    const users = (opts.users || []).filter(Boolean);
    for (const u of users) {
      const k = firstKey(u); if (!k) continue;
      const mm = new RegExp('\\b(?:gasto )?personal (?:de|para) ' + escRe(k) + '\\b').exec(n);
      if (mm) { res.tipo = 'Personal'; res.personalDe = u; spans.push([mm.index, mm.index + mm[0].length]); }
    }

    // titular: "visa de Daniel", "débito de Vero", "a nombre de Daniel", "mi tarjeta"
    let titular = null;
    const cardEnds = []; CARD_WORD_RE.lastIndex = 0;
    while ((m = CARD_WORD_RE.exec(n))) cardEnds.push(m.index + m[0].length);
    for (const u of users) {
      const k = firstKey(u); if (!k || titular) continue;
      const re = new RegExp('\\b(?:a nombre )?de ' + escRe(k) + '\\b', 'g');
      while ((m = re.exec(n))) {
        if (inSpans(m.index, m.index + m[0].length)) continue;
        if (cardEnds.some(e => e <= m.index && m.index - e <= 25)) { titular = u; spans.push([m.index, m.index + m[0].length]); break; }
      }
    }
    if (!titular && opts.me && (m = MI_CARD_RE.exec(n))) { titular = opts.me; spans.push([m.index, m.index + m[0].length]); }

    // tarjeta concreta (hoja Tarjetas)
    const cards = normTarjetas(opts.tarjetas);
    if (cards.length) {
      const esTarjeta = res.medio === MEDIO_CRED || res.medio === MEDIO_DEB;
      let cand = res.medio && !esTarjeta ? [] : cards.filter(c => !res.medio || c.medio === res.medio);
      if (titular) cand = cand.filter(c => normKey(c.titular) === normKey(titular));
      const hits = {};
      const conClave = cand.filter(c => c.claves.some(kw => {
        const mm = new RegExp('(?:^|[^a-z0-9])(' + escRe(kw) + ')(?=$|[^a-z0-9])').exec(n);
        if (!mm) return false;
        const st = mm.index + mm[0].length - mm[1].length;
        (hits[c.nombre] = hits[c.nombre] || []).push([st, st + mm[1].length]);
        return true;
      }));
      if (conClave.length) cand = conClave;
      if (cand.length === 1 && (conClave.length || titular || esTarjeta)) {
        const c = cand[0];
        res.tarjeta = c.nombre; res.titular = c.titular;
        if (!res.medio) res.medio = c.medio;
        (hits[c.nombre] || []).forEach(sp => spans.push(sp));
      }
    }
    if (!res.titular && titular) res.titular = titular;

    // fecha relativa
    FECHA_RE.lastIndex = 0;
    if ((m = FECHA_RE.exec(n))) {
      if (/antes de ayer|anteayer/.test(m[0])) res.diasAtras = 2;
      else if (/ayer|anoche/.test(m[0])) res.diasAtras = 1;
      spans.push([m.index, m.index + m[0].length]);
    }

    // monto
    const amounts = findAmounts(n).filter(a => !inSpans(a.start, a.end));
    if (amounts.length) {
      const pick = amounts.find(a => a.cur) || amounts.slice().sort((a, b) => b.value - a.value)[0];
      res.monto = Math.round(pick.value * 100) / 100;
      spans.push([pick.start, pick.end]);
    }

    // descripción: segmentos entre spans, limpiando relleno en los bordes
    spans.sort((a, b) => a[0] - b[0]);
    const segs = [];
    let pos = 0;
    for (const [a, b] of spans) { if (a > pos) segs.push([pos, a]); pos = Math.max(pos, b); }
    if (pos < original.length) segs.push([pos, original.length]);
    const words = [];
    for (const [a, b] of segs) {
      let ws = original.slice(a, b).replace(/[$,.;:!¡?¿]/g, ' ').split(/\s+/).filter(Boolean);
      while (ws.length && FILLER.has(norm(ws[0]))) ws.shift();
      while (ws.length && FILLER.has(norm(ws[ws.length - 1]))) ws.pop();
      ws = ws.filter(w => !/^(gaste|gastamos|pague|pagamos|compre|compramos)$/.test(norm(w)));
      words.push(...ws);
    }
    let desc = words.join(' ').trim();
    if (desc) desc = desc.charAt(0).toUpperCase() + desc.slice(1);
    res.descripcion = desc;

    // clasificación
    const compiled = opts.compiled || compileRules(opts.rules || DEFAULT_RULES);
    let c = classify(desc, compiled);
    if (!c.regla) c = classify(original, compiled);
    Object.assign(res, c);
    return res;
  }

  // Palabra clave sugerida para aprender de una corrección
  function learnKey(descripcion) {
    const ws = normKey(descripcion).split(' ').filter(w => w && !FILLER.has(w) && !/^\d+$/.test(w));
    if (!ws.length) return '';
    return ws.length <= 3 ? ws.join(' ') : ws[0];
  }

  // ---------- Reglas semilla: [rubro, subrubro, palabras...] ----------
  const SEED = [
    ['Supermercado','Supermercado','super','supermercado','chango','changomas','carrefour','coto','vea','jumbo','disco','libertad','la anonima','makro','vital','maxiconsumo','mayorista','hipermercado','compras del mes','mercaderia','supermercado dia'],
    ['Supermercado','Verdulería','verduleria','verdura','fruta','fruteria','verdulero','papa','tomate','lechuga','banana','manzana','cebolla','zanahoria','palta','naranjas'],
    ['Supermercado','Carnicería','carniceria','carne','carnicero','asado','pollo','polleria','milanesa','chorizo','vacio','bife','cerdo','pescaderia','pescado','carne picada','matambre'],
    ['Supermercado','Panadería','panaderia','pan','factura','medialuna','confiteria','bizcocho','prepizza'],
    ['Supermercado','Almacén y bebidas','almacen','kiosco','kiosko','despensa','chino','gaseosa','bebida','vino','cerveza','fiambreria','fiambre','queso','lacteo','leche','huevo','yerba','azucar','aceite de cocina','dietetica','agua mineral','soda','sifon','hielo','cigarrillo','puchos','golosina'],
    ['Supermercado','Limpieza y perfumería','limpieza','lavandina','detergente','perfumeria','papel higienico','jabon','shampoo','desodorante','pasta dental','suavizante','jabon en polvo'],
    ['Comida / delivery','Delivery','delivery','pedidosya','pedidos ya','rappi','pedido'],
    ['Comida / delivery','Restaurante','restaurante','restaurant','resto','parrilla','almuerzo','cena','cenamos','almorzamos','bodegon','comedor','tenedor libre'],
    ['Comida / delivery','Comida rápida','pizza','pizzeria','empanada','hamburguesa','mcdonalds','burger','lomito','sushi','rotiseria','comida','sandwich','pancho','tamales','humitas'],
    ['Comida / delivery','Café y merienda','cafe','cafeteria','starbucks','havanna','desayuno','merienda'],
    ['Comida / delivery','Heladería','helado','heladeria','grido','freddo'],
    ['Servicios','Luz','luz','edesa','electricidad','factura de luz','boleta de luz','energia'],
    ['Servicios','Gas','gas','gasnor','garrafa','factura de gas','boleta de gas'],
    ['Servicios','Agua','aguas del norte','factura de agua','boleta de agua','servicio de agua','cosaysa'],
    ['Servicios','Internet y TV','internet','wifi','fibra','cable','directv','flow','telecentro','fibertel','starlink'],
    ['Servicios','Celular','celular','telefono','recarga','claro','movistar','abono del celular','plan del celular'],
    ['Servicios','Streaming y apps','netflix','spotify','disney','hbo','prime video','amazon prime','youtube premium','paramount','icloud','google one','suscripcion','chatgpt','apple tv'],
    ['Servicios','Impuestos y tasas','impuesto','municipal','municipalidad','rentas','inmobiliario','tasa','monotributo','arca','afip','ganancias','bienes personales'],
    ['Vivienda / alquiler','Alquiler','alquiler','inmobiliaria'],
    ['Vivienda / alquiler','Expensas','expensas','consorcio'],
    ['Vivienda / alquiler','Seguro hogar','seguro de hogar','seguro del hogar','seguro de la casa'],
    ['Vivienda / alquiler','Crédito hipotecario','hipoteca','hipotecario','credito hipotecario'],
    ['Transporte / combustible','Combustible','nafta','combustible','gasoil','diesel','ypf','shell','axion','puma','gnc','estacion de servicio','cargue nafta','infinia'],
    ['Transporte / combustible','Taxi / Uber','uber','taxi','remis','cabify','didi'],
    ['Transporte / combustible','Colectivo','colectivo','saeta','sube','bondi','micro','pasaje de colectivo'],
    ['Transporte / combustible','Peajes y estacionamiento','peaje','estacionamiento','cochera','parquimetro','playa de estacionamiento'],
    ['Transporte / combustible','Mantenimiento auto','mecanico','taller','gomeria','service del auto','service','aceite','cubierta','neumatico','lavadero','lavado del auto','repuesto','bateria','alineacion','balanceo'],
    ['Transporte / combustible','Seguro y patente','seguro del auto','seguro auto','patente','vtv','rto','seguro de la camioneta'],
    ['Salud / farmacia','Farmacia','farmacia','remedio','medicamento','ibuprofeno','paracetamol','antibiotico','farmacity','receta','pastillas'],
    ['Salud / farmacia','Médicos y estudios','medico','medica','consulta','doctor','doctora','pediatra','ginecologo','ginecologa','dermatologo','odontologo','odontologa','dentista','kinesiologo','kinesiologia','analisis','laboratorio','estudios','ecografia','radiografia','psicologo','psicologa','terapia','oculista','optica','lentes','guardia','sanatorio','clinica'],
    ['Salud / farmacia','Prepaga / obra social','prepaga','obra social','osde','swiss medical','galeno','medife','omint','sancor salud','ips','coseguro','bono'],
    ['Salud / farmacia','Cuidado personal','peluqueria','barberia','corte de pelo','manicura','unas','depilacion','cosmetico','maquillaje','crema','perfume'],
    ['Educación','Colegio y cuotas','colegio','escuela','cuota del colegio','matricula','universidad','facultad','instituto','guarderia','jardin de infantes'],
    ['Educación','Cursos y clases','curso','clase','profesor','profesora','ingles','academia','capacitacion','taller de','udemy'],
    ['Educación','Útiles y libros','utiles','libreria','libro','cuaderno','fotocopia','mochila del colegio','uniforme'],
    ['Hijos','Bebé y pañales','panales','bebe','leche en polvo','mamadera','toallitas'],
    ['Hijos','Actividades','futbol','natacion','danza','baile','escuelita','colonia','campamento','hockey','rugby'],
    ['Hijos','Juguetes','juguete','jugueteria','peluche'],
    ['Hijos','Ropa niños','ropa de los chicos','ropa del nene','ropa de la nena','ropa para el nene','ropa para la nena'],
    ['Mascotas','Alimento mascotas','alimento','alimento para perro','alimento perro','alimento gato','alimento del perro','alimento del gato','balanceado','dog chow','pedigree','royal canin','excellent','purina','comida del perro','comida para el perro','comida del gato','comida para el gato','piedritas','arena para gato','vitalcan','old prince'],
    ['Mascotas','Veterinaria','veterinaria','veterinario','vete','vacuna del perro','vacuna del gato','antipulgas','pipeta','desparasitario'],
    ['Mascotas','Accesorios mascotas','pet shop','petshop','peluqueria canina','collar','correa','cucha','juguete del perro','mascota','perro','gato'],
    ['Ropa','Ropa','ropa','remera','pantalon','jean','campera','buzo','camisa','vestido','pollera','medias','ropa interior','zara','short','malla','corpiño','calzoncillo'],
    ['Ropa','Calzado','zapatillas','zapatos','botas','ojotas','sandalias','calzado','borcegos'],
    ['Ropa','Accesorios','cartera','mochila','reloj','anteojos de sol','billetera','cinturon','bijou'],
    ['Ocio / salidas','Salidas','bar','boliche','tragos','salida','pena','birra','cervezeria','after'],
    ['Ocio / salidas','Cine y espectáculos','cine','teatro','recital','show','entradas','entrada','concierto','cinemark','hoyts','festival'],
    ['Ocio / salidas','Viajes','viaje','hotel','hospedaje','airbnb','pasaje','vuelo','aerolineas','flybondi','jetsmart','cabana','excursion','vacaciones','booking','despegar'],
    ['Ocio / salidas','Deportes y gimnasio','gimnasio','gym','padel','paddle','cancha','club','pileta','golf','crossfit'],
    ['Ocio / salidas','Hobbies','guitarra','cuerdas','pua','musica','instrumento','videojuego','playstation','steam','juego','pesca'],
    ['Hogar / mantenimiento','Ferretería y pinturería','ferreteria','tornillo','pintura','pintureria','herramienta','foco','lampara','cano'],
    ['Hogar / mantenimiento','Arreglos y técnicos','plomero','electricista','gasista','albanil','arreglo','reparacion','cerrajero','service del aire','tecnico','fumigacion'],
    ['Hogar / mantenimiento','Muebles y deco','mueble','deco','decoracion','colchon','sillon','cortina','bazar','vajilla','sabanas','toallas','almohada'],
    ['Hogar / mantenimiento','Electrodomésticos','heladera','lavarropas','microondas','televisor','tele','aire acondicionado','ventilador','electro','licuadora','cafetera','pava electrica','secarropas','aspiradora','notebook','computadora'],
    ['Hogar / mantenimiento','Jardín','vivero','planta','jardinero','pasto','corte de pasto','abono','tierra'],
    ['Hogar / mantenimiento','Servicio doméstico','empleada','empleada domestica','senora de la limpieza','limpieza de la casa','ninera'],
    ['Regalos','Regalos','regalo','cumpleanos','cumple','obsequio','dia de la madre','dia del padre','navidad','reyes','dia del nino','casamiento'],
    ['Regalos','Donaciones','donacion','colecta','limosna','ofrenda'],
    ['Varios','Bancos y comisiones','comision','mantenimiento de cuenta','cargo bancario','interes'],
    ['Varios','Trámites','tramite','escribania','gestor','registro','documento','pasaporte','dni']
  ];
  const DEFAULT_RULES = [];
  for (const row of SEED) {
    const [rubro, subrubro, ...kws] = row;
    for (const k of kws) DEFAULT_RULES.push({ palabra: k, rubro, subrubro });
  }

  const RUBROS = ['Supermercado','Comida / delivery','Servicios','Vivienda / alquiler','Transporte / combustible','Salud / farmacia',
    'Educación','Hijos','Mascotas','Ropa','Ocio / salidas','Hogar / mantenimiento','Regalos','Varios'];
  const MEDIOS_LISTA = ['Efectivo','Débito','Tarjeta de crédito','Transferencia / MP'];

  const API = { parse, normTarjetas, classify, compileRules, learnKey, norm, normKey, wordsToNumber, DEFAULT_RULES, RUBROS, MEDIOS: MEDIOS_LISTA, SEED };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.GastosParser = API;
})(typeof window !== 'undefined' ? window : this);
