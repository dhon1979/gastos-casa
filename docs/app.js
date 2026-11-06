/* Gastos Casa — app */
(function () {
  'use strict';
  const P = window.GastosParser;
  const API_URL = (window.GASTOS_CONFIG || {}).API_URL || '';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('gc_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('gc_' + k, JSON.stringify(v)); } catch (e) { } },
    del(k) { try { localStorage.removeItem('gc_' + k); } catch (e) { } }
  };
  const ICON = { 'Supermercado': '🛒', 'Comida / delivery': '🍕', 'Servicios': '💡', 'Vivienda / alquiler': '🏠', 'Transporte / combustible': '⛽',
    'Salud / farmacia': '💊', 'Educación': '📚', 'Hijos': '🧸', 'Mascotas': '🐾', 'Ropa': '👕', 'Ocio / salidas': '🎬',
    'Hogar / mantenimiento': '🔧', 'Regalos': '🎁', 'Varios': '📦' };
  const fmtARS = n => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
  const fmtUSD = n => 'US$ ' + (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = n => String(n).padStart(2, '0');
  const mesActual = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); };
  const mesAdd = (m, k) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const mesLabel = m => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1); return cap(d.toLocaleDateString('es-AR', { month: 'long' })) + ' ' + d.getFullYear(); };
  const mesCorto = m => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
  const localISO = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  const S = {
    token: LS.get('token', null), user: LS.get('user', null), boot: LS.get('boot', null),
    compiled: null, mesMov: mesActual(), mesPan: mesActual(), movData: null, panData: null,
    f: { who: 'all', tipo: 'all', q: '' }, rubroFiltro: 'total', editing: null, sugg: null
  };

  /* ---------------- API ---------------- */
  async function api(action, data) {
    if (!API_URL || API_URL.indexOf('PEGAR') === 0) throw new Error('Falta configurar API_URL en config.js');
    const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, token: S.token }, data || {})) });
    const j = await res.json();
    if (!j.ok && j.error === 'SESION') { logout(true); throw new Error(j.mensaje); }
    if (!j.ok) { const e = new Error(j.mensaje || 'Error'); e.server = true; throw e; }
    return j;
  }
  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms || 2600);
  }

  /* ---------------- Cola offline ---------------- */
  const queue = () => LS.get('queue', []);
  function setBadge() {
    const n = queue().length, b = $('#pendingBadge');
    b.textContent = n + (n === 1 ? ' pendiente' : ' pendientes'); b.classList.toggle('hidden', !n);
  }
  let flushing = false;
  async function flush() {
    if (flushing || !S.token || !navigator.onLine) return;
    flushing = true;
    try {
      let q = queue();
      while (q.length) {
        try { await api('guardar', { mov: q[0] }); }
        catch (e) { if (e.server) { toast('No se pudo enviar "' + q[0].descripcion + '": ' + e.message, 5000); } else break; }
        q = queue(); q.shift(); LS.set('queue', q);
      }
    } finally { flushing = false; setBadge(); }
  }
  window.addEventListener('online', () => { flush().then(refreshAll); });
  setInterval(flush, 30000);

  /* ---------------- Login ---------------- */
  let pin = '';
  function buildPad() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    $('#pad').innerHTML = keys.map(k => k ? `<button type="button" class="${k === '⌫' ? 'k' : ''}" data-k="${k}">${k}</button>` : '<span></span>').join('');
    $('#pad').addEventListener('click', e => {
      const k = e.target.closest('button') && e.target.closest('button').dataset.k; if (!k) return;
      if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
      drawDots(); if (pin.length === 4) doLogin();
    });
  }
  function drawDots() { $$('#dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length)); }
  async function doLogin() {
    $('#loginMsg').textContent = 'Verificando…';
    try {
      const r = await api('login', { pin });
      S.token = r.token; S.user = r.usuario; LS.set('token', r.token); LS.set('user', r.usuario);
      $('#loginMsg').textContent = ''; pin = ''; drawDots(); start();
    } catch (e) {
      $('#loginMsg').textContent = e.message; $('#dots').classList.add('err');
      setTimeout(() => { $('#dots').classList.remove('err'); pin = ''; drawDots(); }, 500);
    }
  }
  function logout(expired) {
    LS.del('token'); S.token = null;
    $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
    if (expired) $('#loginMsg').textContent = 'Sesión vencida, ingresá de nuevo.';
  }

  /* ---------------- Arranque ---------------- */
  async function start() {
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    applyBoot();
    try {
      const b = await api('bootstrap'); S.boot = b; LS.set('boot', b); applyBoot();
    } catch (e) { if (!S.boot) toast('Sin conexión: uso reglas por defecto'); }
    flush(); refreshAll();
  }
  function applyBoot() {
    const b = S.boot || {};
    const users = b.usuarios || [S.user || 'Yo', 'Pareja'];
    S.users = users;
    S.compiled = P.compileRules(b.reglas && b.reglas.length ? b.reglas : P.DEFAULT_RULES);
    $('#whoName').textContent = S.user || '';
    $('#avatar').textContent = (S.user || '?').charAt(0).toUpperCase();
    $('#avatar').classList.toggle('u2', users[1] === S.user);
    setBadge();
  }
  const esTarjetaMedio = md => md === 'Tarjeta de crédito' || md === 'Débito';
  const tarjetas = () => (S.boot && S.boot.tarjetas) || [];
  const cardsFor = md => tarjetas().filter(t => t.medio === md);
  const cardByName = n => tarjetas().find(t => t.nombre === n);
  /** Tarjeta por defecto para un medio: la última usada por este usuario, o la única que haya. */
  function defaultCard(md, titular) {
    let cs = cardsFor(md);
    if (titular) cs = cs.filter(t => t.titular === titular);
    const last = LS.get('lastTarjeta_' + S.user + '_' + md, null);
    if (last && cs.some(t => t.nombre === last)) return last;
    return cs.length === 1 ? cs[0].nombre : '';
  }
  function subrubrosDe(rubro) {
    const rules = (S.boot && S.boot.reglas && S.boot.reglas.length) ? S.boot.reglas : P.DEFAULT_RULES;
    return Array.from(new Set(rules.filter(r => r.rubro === rubro).map(r => r.subrubro))).sort();
  }

  /* ---------------- Navegación ---------------- */
  $$('.tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.v)));
  function go(v) {
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
    window.scrollTo(0, 0);
    if (v === 'movs') loadMovs(); if (v === 'panel') loadPanel();
  }
  $('#whoBtn').addEventListener('click', () => { if (confirm('¿Cerrar sesión de ' + S.user + '?')) logout(); });
  $$('#v-movs .monthnav button').forEach(b => b.addEventListener('click', () => { S.mesMov = mesAdd(S.mesMov, +b.dataset.m); loadMovs(); }));
  $$('#v-panel .monthnav button').forEach(b => b.addEventListener('click', () => { S.mesPan = mesAdd(S.mesPan, +b.dataset.m); loadPanel(); }));
  function refreshAll() { loadRecent(); if ($('#v-movs').classList.contains('on')) loadMovs(); if ($('#v-panel').classList.contains('on')) loadPanel(); }

  /* ---------------- Voz ---------------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, recOn = false, finalTxt = '';
  if (!SR) {
    $('#micBtn').classList.add('hidden');
    $('#micHint').innerHTML = 'Este navegador no permite dictado directo: tocá el 🎤 del teclado en el cuadro de abajo.<br><em>“verdulería 8 mil efectivo”</em>';
  }
  $('#micBtn').addEventListener('click', () => {
    if (recOn) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'es-AR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    finalTxt = ''; $('#live').textContent = 'Escuchando…';
    rec.onresult = e => {
      let interim = ''; finalTxt = '';
      for (const r of e.results) { if (r.isFinal) finalTxt += r[0].transcript; else interim += r[0].transcript; }
      $('#live').textContent = finalTxt || interim;
    };
    rec.onerror = e => { if (e.error === 'not-allowed') toast('Habilitá el micrófono para esta página'); else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Error de dictado: ' + e.error); };
    rec.onend = () => {
      recOn = false; $('#micBtn').classList.remove('rec');
      const t = (finalTxt || $('#live').textContent).trim();
      $('#live').textContent = '';
      if (t && t !== 'Escuchando…') handleText(t, 'voz');
    };
    rec.start(); recOn = true; $('#micBtn').classList.add('rec');
  });
  $('#textForm').addEventListener('submit', e => {
    e.preventDefault(); const t = $('#textIn').value.trim(); if (!t) return;
    $('#textIn').value = ''; $('#textIn').blur(); handleText(t, 'texto');
  });
  $('#manualBtn').addEventListener('click', () => openSheet(null));

  function handleText(t, origen) {
    const p = P.parse(t, { compiled: S.compiled, users: S.users, me: S.user, tarjetas: tarjetas() });
    const fh = new Date(); fh.setDate(fh.getDate() - (p.diasAtras || 0));
    const medio = p.medio || LS.get('lastMedio_' + S.user, 'Débito');
    const tarjeta = esTarjetaMedio(medio) ? (p.tarjeta || defaultCard(medio, p.titular)) : '';
    const card = cardByName(tarjeta);
    const pago = card && S.users.indexOf(card.titular) >= 0 ? card.titular : (S.users.indexOf(p.titular) >= 0 ? p.titular : S.user);
    openSheet({
      texto: t, origen, monto: p.monto, moneda: p.moneda, descripcion: p.descripcion, rubro: p.rubro, subrubro: p.subrubro,
      medio, tarjeta, cuotas: p.cuotas, tipo: p.tipo, personalDe: p.personalDe || S.user, pago, fechaHora: localISO(fh)
    }, false);
  }

  /* ---------------- Editor ---------------- */
  const sheet = $('#sheet'), sheetBg = $('#sheetBg');
  let ed = {};
  function opts(el, values, cur, cls) {
    el.innerHTML = values.map(v => `<button type="button" data-v="${esc(v)}" class="${v === cur ? 'on' : ''} ${cls ? cls(v) : ''}">${esc(v)}</button>`).join('');
  }
  function bindOpts(el, key, after) {
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      ed[key] = b.dataset.v; el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      if (after) after();
    });
  }
  bindOpts($('#fMedio'), 'medio', () => {
    $('#cuotasBox').classList.toggle('hidden', ed.medio !== 'Tarjeta de crédito');
    const c = cardByName(ed.tarjeta);
    if (!c || c.medio !== ed.medio) setTarjeta(esTarjetaMedio(ed.medio) ? defaultCard(ed.medio) : '');
    else renderTarjetas();
  });
  $('#fTarjeta').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setTarjeta(b.dataset.v === ed.tarjeta ? '' : b.dataset.v);
  });
  function setTarjeta(nombre) {
    const prevCard = cardByName(ed.tarjeta);
    ed.tarjeta = nombre || '';
    const c = cardByName(ed.tarjeta);
    if (c && S.users.indexOf(c.titular) >= 0) ed.pago = c.titular;
    else if (prevCard) ed.pago = S.user;
    renderTarjetas(); renderPago();
  }
  function renderTarjetas() {
    const cs = esTarjetaMedio(ed.medio) ? cardsFor(ed.medio) : [];
    $('#tarjetaBox').classList.toggle('hidden', !cs.length);
    $('#fTarjeta').innerHTML = cs.map(t => `<button type="button" data-v="${esc(t.nombre)}" class="${t.nombre === ed.tarjeta ? 'on' : ''}">${esc(t.nombre)}<small>titular ${esc(t.titular)}</small></button>`).join('');
  }
  function renderPago() { opts($('#fPago'), S.users, ed.pago, v => v === S.users[1] ? 'u2' : ''); }
  function renderTipo() {
    const cur = ed.tipo === 'Personal' ? 'P|' + ed.personalDe : 'Compartido';
    const vals = [['Compartido', 'Compartido']].concat(S.users.map(u => ['P|' + u, 'Personal de ' + u]));
    $('#fTipo').innerHTML = vals.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${v === cur ? 'on' : ''}">${esc(l)}</button>`).join('');
  }
  $('#fTipo').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v === 'Compartido') { ed.tipo = 'Compartido'; }
    else { ed.tipo = 'Personal'; ed.personalDe = b.dataset.v.slice(2); }
    renderTipo();
  });
  bindOpts($('#fCuotas'), 'cuotas');
  bindOpts($('#fPago'), 'pago');
  bindOpts($('#fMoneda'), 'moneda', updConv);
  $('#fMonto').addEventListener('input', updConv); $('#fCot').addEventListener('input', updConv);
  $('#fRubro').addEventListener('change', () => { fillSubs(); $('#fRubro').classList.remove('flag'); });
  $('#fSub').addEventListener('input', () => $('#fRubro').classList.remove('flag'));

  const parseNum = s => {
    s = String(s || '').trim().replace(/\s/g, '').replace(/^\$/, '');
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    return parseFloat(s);
  };
  function updConv() {
    const usd = ed.moneda === 'USD';
    $('#cotBox').classList.toggle('hidden', !usd);
    if (usd && !$('#fCot').value && S.boot && S.boot.dolar) $('#fCot').value = S.boot.dolar.venta;
    const m = parseNum($('#fMonto').value), c = parseNum($('#fCot').value);
    $('#convTxt').textContent = usd && m > 0 && c > 0 ? '≈ ' + fmtARS(m * c) + ' (dólar ' + ((S.boot && S.boot.config && S.boot.config.tipoDolar) || '') + ')' : '';
  }
  function fillSubs() {
    const subs = subrubrosDe($('#fRubro').value);
    $('#subList').innerHTML = subs.map(s => `<option value="${esc(s)}">`).join('');
  }
  function openSheet(m, isEdit) {
    const rubros = (S.boot && S.boot.rubros) || P.RUBROS;
    m = m || { monto: null, moneda: 'ARS', medio: LS.get('lastMedio_' + S.user, 'Débito'), cuotas: 1, tipo: 'Compartido', pago: S.user,
      fechaHora: localISO(new Date()), rubro: 'Varios', subrubro: '', descripcion: '', origen: 'manual', texto: '' };
    if (!isEdit && !m.texto && esTarjetaMedio(m.medio) && !m.tarjeta) {
      m.tarjeta = defaultCard(m.medio);
      const c = cardByName(m.tarjeta); if (c && S.users.indexOf(c.titular) >= 0) m.pago = c.titular;
    }
    ed = { id: m.id, moneda: m.moneda || 'ARS', medio: m.medio, cuotas: String(m.cuotas || 1), tipo: m.tipo || 'Compartido', pago: m.pago || S.user,
      tarjeta: m.tarjeta || '', personalDe: m.personalDe || (isEdit ? m.pago : S.user) || S.user,
      texto: m.texto || '', origen: m.origen || 'manual', isEdit: !!isEdit };
    S.sugg = { rubro: m.rubro, subrubro: m.subrubro };
    $('#sheetTitle').textContent = isEdit ? 'Editar gasto' : (m.texto ? 'Confirmar gasto' : 'Nuevo gasto');
    $('#origTxt').textContent = m.texto ? '“' + m.texto + '”' : ''; $('#origTxt').classList.toggle('hidden', !m.texto);
    $('#fMonto').value = m.monto ? String(m.monto).replace('.', ',') : '';
    $('#fMonto').classList.toggle('flag', !m.monto && !!m.texto);
    $('#fCot').value = m.moneda === 'USD' && m.cotizacion > 1 ? m.cotizacion : '';
    $('#fMoneda').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === ed.moneda));
    $('#fDesc').value = m.descripcion || '';
    $('#fRubro').innerHTML = rubros.map(r => `<option ${r === m.rubro ? 'selected' : ''}>${esc(r)}</option>`).join('');
    $('#fRubro').classList.toggle('flag', m.rubro === 'Varios' && (!m.subrubro || m.subrubro === 'Sin clasificar'));
    $('#fSub').value = m.subrubro === 'Sin clasificar' ? '' : (m.subrubro || '');
    fillSubs();
    opts($('#fMedio'), (S.boot && S.boot.medios) || P.MEDIOS, ed.medio);
    const cuotasOpts = ['1', '2', '3', '6', '9', '12', '18', '24'];
    if (cuotasOpts.indexOf(ed.cuotas) < 0) cuotasOpts.push(ed.cuotas);
    opts($('#fCuotas'), cuotasOpts, ed.cuotas);
    $('#cuotasBox').classList.toggle('hidden', ed.medio !== 'Tarjeta de crédito');
    if (ed.tarjeta && !cardByName(ed.tarjeta)) S.boot && (S.boot.tarjetas = tarjetas().concat([{ nombre: ed.tarjeta, titular: ed.pago, medio: ed.medio }]));
    renderTarjetas(); renderPago(); renderTipo();
    $('#fFecha').value = (m.fechaHora || localISO(new Date())).slice(0, 16);
    $('#anularBtn').classList.toggle('hidden', !isEdit);
    updConv();
    sheet.classList.add('on'); sheetBg.classList.add('on');
    if (!m.monto) setTimeout(() => $('#fMonto').focus(), 250);
  }
  function closeSheet() { sheet.classList.remove('on'); sheetBg.classList.remove('on'); }
  $('#cancelBtn').addEventListener('click', closeSheet); sheetBg.addEventListener('click', closeSheet);

  $('#movForm').addEventListener('submit', async e => {
    e.preventDefault();
    const monto = parseNum($('#fMonto').value);
    if (!(monto > 0)) { $('#fMonto').classList.add('flag'); $('#fMonto').focus(); return toast('Falta el monto'); }
    const rubro = $('#fRubro').value, subrubro = $('#fSub').value.trim() || 'Otros';
    const mov = {
      id: ed.id || uid(), fechaHora: $('#fFecha').value, monto, moneda: ed.moneda, cotizacion: ed.moneda === 'USD' ? parseNum($('#fCot').value) || null : null,
      descripcion: $('#fDesc').value.trim() || subrubro, rubro, subrubro, medio: ed.medio,
      cuotas: ed.medio === 'Tarjeta de crédito' ? +ed.cuotas : 1, tipo: ed.tipo, pago: ed.pago, texto: ed.texto, origen: ed.origen,
      tarjeta: esTarjetaMedio(ed.medio) ? ed.tarjeta : '', personalDe: ed.tipo === 'Personal' ? ed.personalDe : ''
    };
    // Aprendizaje: si corrigieron la clasificación sugerida
    if (!S.sugg || S.sugg.rubro !== rubro || (S.sugg.subrubro || '') !== subrubro) {
      const k = P.learnKey(mov.descripcion);
      if (k && k.length >= 3 && !(rubro === 'Varios' && subrubro === 'Otros')) {
        mov.aprender = { palabra: k, rubro, subrubro };
        if (S.boot) { S.boot.reglas = (S.boot.reglas || []).filter(r => P.normKey(r.palabra) !== k).concat([{ palabra: k, rubro, subrubro }]); LS.set('boot', S.boot); applyBoot(); }
      }
    }
    LS.set('lastMedio_' + S.user, mov.medio);
    if (mov.tarjeta) LS.set('lastTarjeta_' + S.user + '_' + mov.medio, mov.tarjeta);
    $('#saveBtn').disabled = true;
    try {
      if (ed.isEdit) { await api('editar', { mov }); toast('Cambios guardados ✓'); }
      else { await api('guardar', { mov }); toast('Guardado ✓ · ' + rubro + ' › ' + subrubro); }
      closeSheet(); refreshAll();
    } catch (err) {
      if (err.server) toast(err.message, 4000);
      else if (!ed.isEdit) {
        const q = queue(); q.push(mov); LS.set('queue', q); setBadge(); closeSheet();
        toast('Sin conexión: quedó guardado en el teléfono y se envía solo'); loadRecent();
      } else toast('Sin conexión: no se pudo editar');
    } finally { $('#saveBtn').disabled = false; }
  });
  $('#anularBtn').addEventListener('click', async () => {
    if (!confirm('¿Anular este movimiento? Deja de contar en los totales.')) return;
    try { await api('anular', { id: ed.id }); toast('Movimiento anulado'); closeSheet(); refreshAll(); }
    catch (e) { toast(e.message); }
  });

  /* ---------------- Listas ---------------- */
  function rowHTML(m, extra) {
    const u2 = m.pago === S.users[1] ? 'u2' : '';
    const usd = m.moneda === 'USD';
    const det = [m.subrubro, m.tarjeta || m.medio, m.cuotas > 1 ? m.cuotas + ' cuotas' : '', 'pagó ' + m.pago].filter(Boolean).join(' · ');
    const pTag = m.tipo === 'Personal' ? `<span class="tag p">Personal${m.personalDe ? ' ' + esc(m.personalDe) : ''}</span>` : '';
    return `<div class="row" data-id="${esc(m.id)}">
      <div class="ic">${ICON[m.rubro] || '📦'}<i class="${u2}"></i></div>
      <div class="tx"><b>${esc(m.descripcion)}${pTag}${m.pendiente ? '<span class="tag">pendiente</span>' : ''}${extra || ''}</b><small>${esc(det)}</small></div>
      <div class="am num">${usd ? fmtUSD(m.monto) + '<small>≈ ' + fmtARS(m.montoARS) + '</small>' : fmtARS(m.monto)}</div></div>`;
  }
  function bindRows(container, list) {
    container.querySelectorAll('.row[data-id]').forEach(el => el.addEventListener('click', () => {
      const m = list.find(x => x.id === el.dataset.id); if (m && !m.pendiente) openSheet(m, true);
    }));
  }
  async function loadRecent() {
    const pend = queue().map(m => Object.assign({ pendiente: true, montoARS: m.monto * (m.cotizacion || 1) }, m));
    try {
      const r = await api('listar', { mes: mesActual() });
      S.recent = pend.concat(r.movimientos).slice(0, 6);
    } catch (e) { S.recent = pend.concat(S.recent || []).slice(0, 6); }
    const el = $('#recent');
    el.innerHTML = S.recent.length ? S.recent.map(m => rowHTML(m)).join('') : '<div class="empty">Todavía no hay gastos este mes</div>';
    bindRows(el, S.recent);
  }
  async function loadMovs() {
    $('#movMes').textContent = mesLabel(S.mesMov);
    $('#movList').innerHTML = '<div class="loading">Cargando…</div>';
    try { S.movData = await api('listar', { mes: S.mesMov }); renderMovs(); }
    catch (e) { $('#movList').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  function renderFilters() {
    const chip = (k, v, label) => `<button class="chip ${S.f[k] === v ? 'on' : ''}" data-k="${k}" data-v="${esc(v)}">${esc(label)}</button>`;
    $('#movFilters').innerHTML = chip('who', 'all', 'Todos') + S.users.map(u => chip('who', u, u)).join('') +
      chip('tipo', 'all', 'Todo tipo') + chip('tipo', 'Compartido', 'Compartidos') + chip('tipo', 'Personal', 'Personales');
  }
  $('#movFilters').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; S.f[b.dataset.k] = b.dataset.v; renderMovs(); });
  $('#movSearch').addEventListener('input', e => { S.f.q = P.normKey(e.target.value); renderMovs(); });
  function pass(m) {
    if (S.f.who !== 'all' && m.pago !== S.f.who) return false;
    if (S.f.tipo !== 'all' && m.tipo !== S.f.tipo) return false;
    if (S.f.q && P.normKey([m.descripcion, m.rubro, m.subrubro, m.medio, m.tarjeta, m.texto].join(' ')).indexOf(S.f.q) < 0) return false;
    return true;
  }
  function renderMovs() {
    renderFilters();
    const d = S.movData; if (!d) return;
    const list = d.movimientos.filter(pass);
    const cuotas = d.cuotasPrevias.filter(pass);
    const total = list.reduce((a, m) => a + m.montoARS, 0);
    $('#movCount').textContent = list.length + (list.length === 1 ? ' compra' : ' compras');
    $('#movSum').textContent = fmtARS(total);
    let html = '', lastDay = '';
    list.forEach(m => {
      if (m.fecha !== lastDay) {
        lastDay = m.fecha;
        const dayTot = list.filter(x => x.fecha === m.fecha).reduce((a, x) => a + x.montoARS, 0);
        const lbl = cap(new Date(m.fecha + 'T12:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' }));
        html += `<div class="daygroup"><span>${esc(lbl)}</span><span class="num">${fmtARS(dayTot)}</span></div>`;
      }
      html += rowHTML(m);
    });
    if (cuotas.length) {
      const ct = cuotas.reduce((a, x) => a + x.montoARS, 0);
      html += `<div class="daygroup"><span>Cuotas de compras anteriores</span><span class="num">${fmtARS(ct)}</span></div>`;
      html += cuotas.map(x => rowHTML({ id: '', descripcion: x.descripcion, rubro: x.rubro, subrubro: x.subrubro, medio: 'Cuota ' + x.cuota, tarjeta: x.tarjeta ? x.tarjeta + ' · cuota ' + x.cuota : '', personalDe: x.personalDe,
        pago: x.pago, tipo: x.tipo, moneda: x.moneda, monto: x.montoOrig, montoARS: x.montoARS, cuotas: 1 })).join('');
    }
    $('#movList').innerHTML = html || '<div class="empty">Sin movimientos para este filtro</div>';
    bindRows($('#movList'), list);
  }

  /* ---------------- Panel ---------------- */
  async function loadPanel() {
    $('#panMes').textContent = mesLabel(S.mesPan);
    $('#panel').innerHTML = '<div class="loading">Cargando…</div>';
    try { S.panData = await api('panel', { mes: S.mesPan }); renderPanel(); }
    catch (e) { $('#panel').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  function renderPanel() {
    const d = S.panData, c = d.compensacion, t = d.totales, U = d.usuarios;
    let h = '';
    // Compensación
    h += `<div class="card hero"><h3>Compensación del mes</h3>`;
    if (c.monto > 0) h += `<div class="sub">${esc(c.deudor)} le transfiere a ${esc(c.acreedor)}</div><div class="big num">${fmtARS(c.monto)}</div>`;
    else h += `<div class="big">Están parejos 👌</div>`;
    h += `<div class="sub">Gasto compartido del mes: ${fmtARS(c.totalCompartido)}</div><div class="split">` +
      U.map(u => `<div>${esc(u)} pagó<b class="num">${fmtARS(c.pagado[u])}</b>le tocaba ${fmtARS(c.corresponde[u])}</div>`).join('') + '</div>';
    U.forEach((u, i) => {
      if (c.cruzado && c.cruzado[u] > 0) h += `<div class="cross">+ ${fmtARS(c.cruzado[u])} de gastos personales de ${esc(u)} que pagó ${esc(U[1 - i])}</div>`;
    });
    if (d.cierre) {
      h += `<div class="closed">✓ Compensado: ${esc(d.cierre.deudor || '—')} → ${esc(d.cierre.acreedor || '—')} ${fmtARS(d.cierre.monto)} · registrado por ${esc(d.cierre.registradoPor)} el ${esc(d.cierre.fecha)}` +
        (d.cierre.cambio ? '<br>⚠️ Hubo cambios después del cierre.' : '') + '</div>';
      h += `<div class="actions">${d.cierre.cambio ? '<button class="btn" id="cerrarBtn">Actualizar cierre</button>' : ''}<button class="btn ghost" id="reabrirBtn">Reabrir mes</button></div>`;
    } else if (c.totalCompartido > 0) h += `<button class="btn block" id="cerrarBtn">Registrar compensación</button>`;
    h += '</div>';

    // KPIs
    h += `<div class="kpis">
      <div class="kpi"><span>Total del mes</span><b class="num">${fmtARS(t.totalARS)}</b>${d.usdEquivalente ? `<small>≈ ${fmtUSD(d.usdEquivalente)}</small>` : ''}</div>
      <div class="kpi"><span>Pagado en dólares</span><b class="num">${fmtUSD(t.usdNominal)}</b><small>nominal</small></div>
      <div class="kpi"><span>Compartido</span><b class="num">${fmtARS(t.compartidoARS)}</b></div>
      <div class="kpi"><span>Personal</span><b class="num">${fmtARS(t.personalARS)}</b></div>
    </div>`;

    // Por persona
    const maxU = Math.max(1, ...d.porUsuario.map(u => u.totalARS));
    h += `<div class="card users2"><h3>Cuánto pagó cada uno</h3>` + d.porUsuario.map((u, i) => `<div>
      <div class="h"><b>${esc(u.nombre)}</b><b class="num">${fmtARS(u.totalARS)}</b></div>
      <div class="bar"><i style="width:${u.totalARS / maxU * 100}%;background:var(--${i ? 'u2' : 'u1'})"></i></div>
      <small style="color:var(--ink-2)">Pagó compartido ${fmtARS(u.compartidoARS)} · Gastos personales propios ${fmtARS(u.personalARS)}${u.usdNominal ? ' · ' + fmtUSD(u.usdNominal) : ''}</small></div>`).join('') + '</div>';

    // Por tarjeta (para controlar el resumen)
    if (d.porTarjeta && d.porTarjeta.length) {
      h += `<div class="card"><h3>Por tarjeta <span style="text-transform:none;letter-spacing:0;font-weight:400">· incluye cuotas del mes</span></h3>` +
        d.porTarjeta.map(t => `<div class="subs" style="display:flex;justify-content:space-between;padding:6px 0;color:var(--ink)"><span>${esc(t.tarjeta)} <small style="color:var(--ink-3)">(${t.cantidad})</small></span>
          <span class="num" style="text-align:right"><b>${fmtARS(t.arsNominal)}</b>${t.usdNominal ? `<br><small>+ ${fmtUSD(t.usdNominal)}</small>` : ''}</span></div>`).join('') + '</div>';
    }

    // Por rubro
    const key = S.rubroFiltro;
    const rubs = d.porRubro.map(r => Object.assign({}, r, { v: r[key] })).filter(r => r.v > 0).sort((a, b) => b.v - a.v);
    const totR = rubs.reduce((a, r) => a + r.v, 0) || 1;
    h += `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h3 style="margin:0">Por rubro</h3>
      <div class="seg" id="rubSeg">${[['total', 'Todo'], ['compartido', 'Compartido'], ['personal', 'Personal']].map(([k, l]) => `<button data-k="${k}" class="${k === key ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    h += rubs.length ? rubs.map(r => `<div class="rub"><div class="h"><span>${ICON[r.rubro] || '📦'} ${esc(r.rubro)}</span><span class="num">${fmtARS(r.v)} <small style="color:var(--ink-3);font-weight:400">${Math.round(r.v / totR * 100)}%</small></span></div>
      <div class="bar"><i style="width:${r.v / rubs[0].v * 100}%"></i></div>
      <div class="subs">${r.subrubros.filter(s => s[key] > 0).sort((a, b) => b[key] - a[key]).map(s => `<div><span>${esc(s.subrubro)} <small>(${s.cantidad})</small></span><span class="num">${fmtARS(s[key])}</span></div>`).join('')}</div></div>`).join('')
      : '<div class="empty">Sin gastos</div>';
    h += '</div>';

    // Evolución
    const maxE = Math.max(1, ...d.evolucion.map(e => e.total));
    h += `<div class="card"><h3>Últimos 6 meses</h3><div class="evo">` + d.evolucion.map(e => `<div class="col ${e.mes === d.mes ? 'cur' : ''}">
      <div class="stack" style="height:${e.total / maxE * 100}%"><i style="height:${e.total ? e.compartido / e.total * 100 : 0}%;background:var(--accent)"></i><i style="height:${e.total ? e.personal / e.total * 100 : 0}%;background:var(--u2)"></i></div>
      <span>${esc(mesCorto(e.mes))}</span></div>`).join('') +
      `</div><div class="legend"><span><i style="background:var(--accent)"></i>Compartido</span><span><i style="background:var(--u2)"></i>Personal</span></div></div>`;

    // Cuotas futuras
    if (d.cuotasFuturas.length) {
      h += `<div class="card"><h3>Cuotas que vienen</h3>` + d.cuotasFuturas.map(x => `<div class="subs" style="display:flex;justify-content:space-between;padding:4px 0"><span>${esc(mesLabel(x.mes))}</span><b class="num">${fmtARS(x.montoARS)}</b></div>`).join('') + '</div>';
    }
    if (d.dolar) h += `<p style="text-align:center;color:var(--ink-3);font-size:12px">Dólar ${esc(d.dolar.tipo)} hoy: ${fmtARS(d.dolar.venta)}${d.dolar.aproximada ? ' (último disponible)' : ''}</p>`;

    $('#panel').innerHTML = h;
    $$('#panel .rub').forEach(el => el.addEventListener('click', () => el.classList.toggle('open')));
    const seg = $('#rubSeg'); if (seg) seg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { S.rubroFiltro = b.dataset.k; renderPanel(); } });
    const cb = $('#cerrarBtn'); if (cb) cb.addEventListener('click', async () => {
      const msg = c.monto > 0 ? `¿Registrar que ${c.deudor} le transfirió ${fmtARS(c.monto)} a ${c.acreedor}?` : '¿Registrar el mes como compensado?';
      if (!confirm(msg)) return;
      try { await api('cerrarMes', { mes: d.mes }); toast('Compensación registrada ✓'); loadPanel(); } catch (e) { toast(e.message); }
    });
    const rb = $('#reabrirBtn'); if (rb) rb.addEventListener('click', async () => {
      if (!confirm('¿Reabrir el mes? Se borra el registro de compensación.')) return;
      try { await api('reabrirMes', { mes: d.mes }); loadPanel(); } catch (e) { toast(e.message); }
    });
  }

  /* ---------------- Init ---------------- */
  buildPad();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  if (!API_URL || API_URL.indexOf('PEGAR') === 0) {
    $('#login').classList.remove('hidden'); $('#loginMsg').textContent = 'Falta configurar API_URL en config.js';
  } else if (S.token) start();
  else $('#login').classList.remove('hidden');
})();
