const fs = require('fs');
const p = 'C:/Users/Kamile/Projects/gralha-azul/rescisoes.html';
let t = fs.readFileSync(p, 'utf8');
const fixes = [
  ['action-edit"AgdSlot', 'action-edit" onclick="editAgdSlot'],
  ['action-edit"DocLink', 'action-edit" onclick="editDocLink'],
  ['action-edit"Ag(', 'action-edit" onclick="editAg('],
  ['action-edit"Cart(', 'action-edit" onclick="editCart('],
  ['action-edit"Conf(', 'action-edit" onclick="editConf('],
  ['action-edit"Man(', 'action-edit" onclick="editMan('],
  ['action-edit"San(', 'action-edit" onclick="editSan('],
  ['action-edit"Mkt(', 'action-edit" onclick="editMkt('],
  ['action-edit"Carta(', 'action-edit" onclick="editCarta('],
  ['action-edit"Loft(', 'action-edit" onclick="editLoft('],
  ['action-edit"Saiu(', 'action-edit" onclick="editSaiu('],
];
for (const [a, b] of fixes) t = t.split(a).join(b);
t = t.replace(/class="abt" onclick="del/g, 'class="abt action-delete" onclick="del');
fs.writeFileSync(p, t.startsWith('\uFEFF') ? t : '\uFEFF' + t, 'utf8');
console.log('ok', (t.match(/action-edit" onclick/g) || []).length);
