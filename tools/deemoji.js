const fs = require('fs');

const files = [
  'C:/Users/Kamile/Projects/gralha-azul/rescisoes.html',
  'C:/Users/Kamile/Projects/gralha-azul/gestao.html',
];

const VS = '\\uFE0F?';

// Decorative emojis to strip when they LEAD an element's text ("EMOJI Word").
// EXCLUDED on purpose (meaningful state / handled elsewhere): ✅ 2705, ⬜ 2B1C, ❌ 274C
const DECO = '[' + [
  '\\u{1F4CB}','\\u{1F4C4}','\\u{1F50D}','\\u{1F50E}','\\u21A9','\\u{1F527}','\\u{1F6E0}',
  '\\u{1F4A7}','\\u{1F91D}','\\u{1F3E1}','\\u{1F3E0}','\\u2709','\\u{1F4C5}','\\u{1F4C6}',
  '\\u{1F539}','\\u{1F60A}','\\u2696','\\u{1F4A1}','\\u{1F4CC}','\\u{1F6AA}','\\u{1F4B3}',
  '\\u{1F4DD}','\\u{1F4C1}','\\u{1F525}','\\u{1F464}','\\u{1F465}','\\u{1F4E2}','\\u{1F3E2}',
  '\\u{1F4CA}','\\u{1F511}','\\u26A1','\\u23F3','\\u23F0','\\u{1F4F1}','\\u{1F7E0}','\\u{1F389}',
  '\\u{1F4B0}','\\u{1F51C}','\\u{1F550}','\\u{1F504}','\\u{1F4E8}','\\u{1F4E5}','\\u2699',
  '\\u{1F6A8}','\\u{1F534}','\\u25B6','\\u{1F513}','\\u{1F512}','\\u{1F5B1}','\\u{1F477}',
  '\\u{1F514}','\\u{1F4AC}','\\u{1F697}','\\u26A0','\\u{1F5A8}',
].join('') + ']';

const rules = [
  // ---- Action buttons -> written text ----
  [new RegExp('\\u270F' + VS + '\\s*Editar', 'gu'), 'Editar'],
  [new RegExp('\\u{1F5D1}' + VS + '\\s*Excluir', 'gu'), 'Excluir'],
  [new RegExp('\\u{1F4CB}\\s*Copiar', 'gu'), 'Copiar'],
  [new RegExp('\\u{1F4BE}\\s*Salvar', 'gu'), 'Salvar'],
  [new RegExp('>\\s*\\u270F' + VS + '\\s*</button>', 'gu'), '>Editar</button>'],
  [new RegExp('>\\s*\\u{1F5D1}' + VS + '\\s*</button>', 'gu'), '>Excluir</button>'],

  // ---- Decorative leading emojis: ">EMOJI Word" -> ">Word" ----
  [new RegExp('(>)\\s*(?:' + DECO + VS + '\\s+)+(?=[A-Za-zÀ-ÿ0-9(])', 'gu'), '$1'],
  // ---- placeholder="EMOJI ..." ----
  [new RegExp('(placeholder=")\\s*' + DECO + VS + '\\s*', 'gu'), '$1'],
  // ---- value="EMOJI ..." (input default titles) ----
  [new RegExp('(value=")\\s*' + DECO + VS + '\\s*(?=[A-Za-zÀ-ÿ0-9])', 'gu'), '$1'],
  // ---- "✅ Word" labels (tabs/badges) -> "Word" (standalone ✅ kept) ----
  [new RegExp('(>)\\s*\\u2705' + VS + '\\s+(?=[A-Za-zÀ-ÿ0-9])', 'gu'), '$1'],
];

for (const f of files) {
  let txt = fs.readFileSync(f, 'utf8');
  for (const [re, rep] of rules) txt = txt.replace(re, rep);
  // collapse accidental double spaces inside simple text runs after ">"
  const out = txt.startsWith('\uFEFF') ? txt : '\uFEFF' + txt;
  fs.writeFileSync(f, out, 'utf8');
  console.log(f.split('/').pop() + ': done');
}
