const fs = require('fs');

const files = [
  'C:/Users/Kamile/Projects/gralha-azul/rescisoes.html',
  'C:/Users/Kamile/Projects/gralha-azul/gestao.html',
];

// VS = optional emoji variation selector
const VS = '\\uFE0F?';

// Ordered list of [regex, replacement]. Action buttons -> written text.
const rules = [
  // Buttons that already carry a word: just drop the leading emoji
  [new RegExp('\\u270F' + VS + '\\s*Editar', 'gu'), 'Editar'],
  [new RegExp('\\u{1F5D1}' + VS + '\\s*Excluir', 'gu'), 'Excluir'],
  [new RegExp('\\u{1F4CB}\\s*Copiar', 'gu'), 'Copiar'],
  [new RegExp('\\u{1F4BE}\\s*Salvar', 'gu'), 'Salvar'],
  [new RegExp('\\u{1F5A8}' + VS + '\\s*', 'gu'), ''], // printer (decorative)
  // Icon-only action buttons -> text word
  [new RegExp('>\\s*\\u270F' + VS + '\\s*</button>', 'gu'), '>Editar</button>'],
  [new RegExp('>\\s*\\u{1F5D1}' + VS + '\\s*</button>', 'gu'), '>Excluir</button>'],
];

let report = {};
for (const f of files) {
  let txt = fs.readFileSync(f, 'utf8');
  let before = txt;
  for (const [re, rep] of rules) {
    txt = txt.replace(re, rep);
  }
  if (txt !== before) {
    const utf8bom = '\uFEFF';
    const out = txt.startsWith('\uFEFF') ? txt : utf8bom + txt;
    fs.writeFileSync(f, out, 'utf8');
  }
  report[f.split('/').pop()] = 'done';
}
console.log(JSON.stringify(report, null, 2));
