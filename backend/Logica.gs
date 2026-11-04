/* ============================================================
   Gastos Casa — lógica pura (sin acceso a Sheets)
   Cuotas prorrateadas, panel mensual y compensación 50/50.
   Se testea en Node (ver test/logica.test.js).
   ============================================================ */

function round2(x) { return Math.round((Number(x) || 0) * 100) / 100; }

function normKey(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 'yyyy-MM' + k meses */
function mesAdd(mes, k) {
  var y = parseInt(mes.slice(0, 4), 10), m = parseInt(mes.slice(5, 7), 10) - 1 + k;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + (m < 9 ? '0' : '') + (m + 1);
}

/**
 * Abre cada movimiento activo en imputaciones mensuales.
 * Un gasto en N cuotas genera N imputaciones (una por mes).
 * @param movs [{id, mes, pago, tipo, rubro, subrubro, moneda, monto, montoARS, medio, cuotas, descripcion}]
 * @param cuotaSiguiente true = la 1ª cuota se imputa al mes siguiente de la compra
 */
function imputar(movs, cuotaSiguiente) {
  var out = [];
  movs.forEach(function (mv) {
    if (mv.estado === 'Anulado') return;
    var n = Math.max(1, parseInt(mv.cuotas, 10) || 1);
    var offset = (n > 1 && cuotaSiguiente) ? 1 : 0;
    var base = round2(mv.monto / n), baseARS = round2(mv.montoARS / n);
    for (var i = 0; i < n; i++) {
      var last = i === n - 1;
      out.push({
        id: mv.id, mesCompra: mv.mes, mes: mesAdd(mv.mes, i + offset), cuota: (i + 1) + '/' + n,
        pago: mv.pago, tipo: mv.tipo, rubro: mv.rubro, subrubro: mv.subrubro, medio: mv.medio,
        moneda: mv.moneda, descripcion: mv.descripcion,
        montoOrig: last ? round2(mv.monto - base * (n - 1)) : base,
        montoARS: last ? round2(mv.montoARS - baseARS * (n - 1)) : baseARS
      });
    }
  });
  return out;
}

/**
 * Panel de un mes.
 * @param imps   imputaciones (de imputar)
 * @param mes    'yyyy-MM'
 * @param users  [nombre1, nombre2]
 * @param pctU1  % del gasto compartido que le corresponde al usuario 1 (50 = mitad)
 */
function calcularPanel(imps, mes, users, pctU1) {
  pctU1 = (pctU1 === undefined || pctU1 === null || pctU1 === '') ? 50 : Number(pctU1);
  var delMes = imps.filter(function (x) { return x.mes === mes; });
  var porUsuario = {};
  users.forEach(function (u) {
    porUsuario[u] = { nombre: u, compartidoARS: 0, personalARS: 0, totalARS: 0, arsNominal: 0, usdNominal: 0, cantidad: 0 };
  });
  var tot = { totalARS: 0, compartidoARS: 0, personalARS: 0, arsNominal: 0, usdNominal: 0, cantidad: 0 };
  var rubros = {};

  delMes.forEach(function (x) {
    var u = porUsuario[x.pago] || (porUsuario[x.pago] = { nombre: x.pago, compartidoARS: 0, personalARS: 0, totalARS: 0, arsNominal: 0, usdNominal: 0, cantidad: 0 });
    var comp = x.tipo !== 'Personal';
    u.totalARS += x.montoARS; tot.totalARS += x.montoARS;
    if (comp) { u.compartidoARS += x.montoARS; tot.compartidoARS += x.montoARS; }
    else { u.personalARS += x.montoARS; tot.personalARS += x.montoARS; }
    if (x.moneda === 'USD') { u.usdNominal += x.montoOrig; tot.usdNominal += x.montoOrig; }
    else { u.arsNominal += x.montoOrig; tot.arsNominal += x.montoOrig; }
    u.cantidad++; tot.cantidad++;

    var r = rubros[x.rubro] || (rubros[x.rubro] = { rubro: x.rubro, total: 0, compartido: 0, personal: 0, subs: {} });
    r.total += x.montoARS; if (comp) r.compartido += x.montoARS; else r.personal += x.montoARS;
    var s = r.subs[x.subrubro] || (r.subs[x.subrubro] = { subrubro: x.subrubro, total: 0, compartido: 0, personal: 0, cantidad: 0 });
    s.total += x.montoARS; s.cantidad++; if (comp) s.compartido += x.montoARS; else s.personal += x.montoARS;
  });

  // Compensación
  var u1 = users[0], u2 = users[1];
  var corresponde1 = tot.compartidoARS * pctU1 / 100;
  var saldo1 = round2(porUsuario[u1].compartidoARS - corresponde1); // >0: u1 puso de más
  var comp = {
    totalCompartido: round2(tot.compartidoARS),
    corresponde: {}, pagado: {}, saldo: {},
    deudor: null, acreedor: null, monto: 0
  };
  comp.corresponde[u1] = round2(corresponde1); comp.corresponde[u2] = round2(tot.compartidoARS - corresponde1);
  comp.pagado[u1] = round2(porUsuario[u1].compartidoARS); comp.pagado[u2] = round2(porUsuario[u2].compartidoARS);
  comp.saldo[u1] = saldo1; comp.saldo[u2] = round2(-saldo1);
  if (Math.abs(saldo1) >= 1) {
    comp.acreedor = saldo1 > 0 ? u1 : u2;
    comp.deudor = saldo1 > 0 ? u2 : u1;
    comp.monto = Math.abs(saldo1);
  }

  // Evolución últimos 6 meses
  var evol = [];
  for (var k = -5; k <= 0; k++) {
    var mk = mesAdd(mes, k), c = 0, p = 0;
    imps.forEach(function (x) { if (x.mes === mk) { if (x.tipo === 'Personal') p += x.montoARS; else c += x.montoARS; } });
    evol.push({ mes: mk, compartido: round2(c), personal: round2(p), total: round2(c + p) });
  }

  // Cuotas a futuro comprometidas (compras hechas hasta este mes)
  var fut = {};
  imps.forEach(function (x) {
    if (x.mes > mes && x.mesCompra <= mes) fut[x.mes] = (fut[x.mes] || 0) + x.montoARS;
  });
  var cuotasFuturas = Object.keys(fut).sort().map(function (m) { return { mes: m, montoARS: round2(fut[m]) }; });

  var porRubro = Object.keys(rubros).map(function (k) {
    var r = rubros[k];
    return {
      rubro: r.rubro, total: round2(r.total), compartido: round2(r.compartido), personal: round2(r.personal),
      subrubros: Object.keys(r.subs).map(function (s) {
        var o = r.subs[s];
        return { subrubro: o.subrubro, total: round2(o.total), compartido: round2(o.compartido), personal: round2(o.personal), cantidad: o.cantidad };
      }).sort(function (a, b) { return b.total - a.total; })
    };
  }).sort(function (a, b) { return b.total - a.total; });

  Object.keys(porUsuario).forEach(function (k) {
    var u = porUsuario[k];
    ['compartidoARS', 'personalARS', 'totalARS', 'arsNominal', 'usdNominal'].forEach(function (f) { u[f] = round2(u[f]); });
  });
  Object.keys(tot).forEach(function (f) { if (f !== 'cantidad') tot[f] = round2(tot[f]); });

  return {
    mes: mes, totales: tot,
    porUsuario: users.map(function (u) { return porUsuario[u]; }),
    compensacion: comp, porRubro: porRubro, evolucion: evol, cuotasFuturas: cuotasFuturas
  };
}

if (typeof module !== 'undefined') module.exports = { round2: round2, normKey: normKey, mesAdd: mesAdd, imputar: imputar, calcularPanel: calcularPanel };
