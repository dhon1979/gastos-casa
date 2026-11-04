// Genera backend/Reglas.gs a partir de las reglas semilla del parser (única fuente de verdad)
const fs = require('fs');
const P = require('./docs/parser.js');
const rows = P.DEFAULT_RULES.map(r => [r.palabra, r.rubro, r.subrubro]);
fs.writeFileSync(__dirname + '/backend/Reglas.gs',
  '/* Generado por build.js desde docs/parser.js — no editar a mano.\n   Las reglas vivas están en la hoja "Reglas" del Sheet: editalas ahí. */\n' +
  'var SEED_REGLAS = ' + JSON.stringify(rows, null, 0).replace(/\],\[/g, '],\n  [') + ';\n');
console.log('Reglas.gs:', rows.length, 'reglas');
