// Entorno de Apps Script simulado en memoria (para tests y servidor de desarrollo)
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
const B = p => fs.readFileSync(path.join(__dirname, '../backend', p), 'utf8');

// ---------- Mock Sheets ----------
function Sheet(name) { this.name = name; this.data = []; }
Sheet.prototype = {
  getName() { return this.name; },
  getLastRow() { return this.data.length; },
  appendRow(r) { this.data.push(r.slice()); },
  deleteRow(i) { this.data.splice(i - 1, 1); },
  setFrozenRows() {},
  getDataRange() { const w = Math.max(1, ...this.data.map(r => r.length)); return this.getRange(1, 1, Math.max(1, this.data.length), w); },
  getRange(r, c, nr, nc) {
    if (typeof r === 'string') return chain({});
    const sh = this; nr = nr || 1; nc = nc || 1;
    return chain({
      getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (sh.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } o.push(row); } return o; },
      setValues(vals) { vals.forEach((row, i) => { while (sh.data.length < r + i) sh.data.push([]); row.forEach((v, j) => { sh.data[r - 1 + i][c - 1 + j] = v; }); }); return this; },
      setValue(v) { return this.setValues([[v]]); },
      clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (sh.data[r - 1 + i]) sh.data[r - 1 + i][c - 1 + j] = ''; sh.data = sh.data.filter((row, idx) => idx === 0 || row.some(x => x !== '')); return this; }
    });
  }
};
function chain(o) { ['setFontWeight', 'setFontColor', 'setBackground', 'setFontFamily', 'setNumberFormat'].forEach(k => o[k] = o[k] || function () { return o; }); return o; }
const sheets = {};
const ss = {
  setSpreadsheetTimeZone() {}, getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = new Sheet(n)), getSheets: () => Object.values(sheets), deleteSheet() {}
};

// ---------- Mock Utilities (TZ fija -03:00) ----------
const pad = n => String(n).padStart(2, '0');
const Utilities = {
  formatDate(d, tz, p) {
    const x = new Date(d.getTime() - 3 * 3600e3);
    return p.replace("'T'", 'T').replace('yyyy', x.getUTCFullYear()).replace('MM', pad(x.getUTCMonth() + 1)).replace('dd', pad(x.getUTCDate()))
      .replace('HH', pad(x.getUTCHours())).replace('mm', pad(x.getUTCMinutes())).replace(/\//g, p.includes('/') ? '/' : '/');
  },
  parseDate(s, tz, p) { return new Date((s.length <= 10 ? s + 'T00:00' : s) + ':00-03:00'); },
  getUuid: () => crypto.randomUUID(),
  DigestAlgorithm: { SHA_256: 'sha256' },
  computeDigest: (a, s) => [...crypto.createHash('sha256').update(s).digest()],
  computeHmacSha256Signature: (s, k) => [...crypto.createHmac('sha256', k).update(s).digest()],
  base64Encode: b => Buffer.from(b).toString('base64'),
  base64EncodeWebSafe: b => Buffer.from(typeof b === 'string' ? Buffer.from(b) : b).toString('base64url'),
  base64DecodeWebSafe: s => [...Buffer.from(s, 'base64url')],
  newBlob: b => ({ getDataAsString: () => Buffer.from(b).toString() })
};
const props = {}, cache = {};
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ({}) },
  Utilities,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => props[k] = v }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => cache[k] = v, remove: k => delete cache[k] }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: (u) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ compra: 1400, venta: 1450 }) }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType() { return this; }, t }) },
  console
};
vm.createContext(ctx);
['Logica.gs', 'Reglas.gs', 'Codigo.gs'].forEach(f => vm.runInContext(B(f), ctx, { filename: f }));

module.exports = { ctx, sheets };
