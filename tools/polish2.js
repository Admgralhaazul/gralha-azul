const fs = require('fs');
const R = 'C:/Users/Kamile/Projects/gralha-azul/rescisoes.html';
const G = 'C:/Users/Kamile/Projects/gralha-azul/gestao.html';
const VS = '\\uFE0F?';

const ICO = {
  house: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
  bldg:  '<svg class="ico" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/></svg>',
  key:   '<svg class="ico" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/></svg>',
  clip:  '<svg class="ico" viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM8 11h8M8 15h6"/></svg>',
  pin:   '<svg class="ico" viewBox="0 0 24 24"><path d="M9 3h6l-1 6 3 3v2h-10v-2l3-3z"/><path d="M12 14v7"/></svg>',
};

function process(file, isGestao) {
  let t = fs.readFileSync(file, 'utf8');

  // --- Botoes de acao em <div class="btn-icon"> -> texto ---
  t = t.replace(new RegExp('(class="btn-icon"[^>]*)>\\s*\\u270F' + VS + '\\s*</div>', 'gu'), '$1>Editar</div>');
  t = t.replace(new RegExp('(class="btn-icon"[^>]*)>\\s*\\u{1F5D1}' + VS + '\\s*</div>', 'gu'), '$1>Excluir</div>');

  if (isGestao) {
    // --- Cartoes de modulo (mico) -> SVG ---
    t = t.replace('<div class="mico">\u{1F3E0}</div>', '<div class="mico">' + ICO.house + '</div>');
    t = t.replace('<div class="mico">\u{1F3E2}</div>', '<div class="mico">' + ICO.bldg + '</div>');
    t = t.replace('<div class="mico">\u{1F511}</div>', '<div class="mico">' + ICO.key + '</div>');
    t = t.replace('<div class="mico">\u{1F4CB}</div>', '<div class="mico">' + ICO.clip + '</div>');
    t = t.replace('<div class="mico">\u{1F4CC}</div>', '<div class="mico">' + ICO.pin + '</div>');
  } else {
    // --- Botao Checklist (rescisoes) -> texto ---
    t = t.replace(new RegExp('title="Checklist">\\s*\\u{1F4CB}' + VS + '\\s*</button>', 'gu'), 'title="Checklist">Checklist</button>');
  }

  // --- bump versao do CSS para v=9 ---
  t = t.replace(/enterprise-premium\.css\?v=\d+/g, 'enterprise-premium.css?v=9');

  const out = t.startsWith('\uFEFF') ? t : '\uFEFF' + t;
  fs.writeFileSync(file, out, 'utf8');
  console.log(file.split('/').pop() + ': ok');
}

process(R, false);
process(G, true);
