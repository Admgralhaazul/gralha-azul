const fs = require('fs');
const files = [
  'C:/Users/Kamile/Projects/gralha-azul/rescisoes.html',
  'C:/Users/Kamile/Projects/gralha-azul/gestao.html',
];
// Emoji-ish ranges (pictographs, symbols, dingbats, misc, transport, supplemental)
const re = /[\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\u1F000-\u1FAFF\u2600-\u26FF\uFE0F\u20E3]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/g;
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  const counts = {};
  let m;
  const re2 = /(\p{Extended_Pictographic})/gu;
  while ((m = re2.exec(txt)) !== null) {
    const ch = m[1];
    counts[ch] = (counts[ch] || 0) + 1;
  }
  console.log('\n==== ' + f.split('/').pop() + ' ====');
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  let total = 0;
  for (const [ch, n] of entries) {
    total += n;
    console.log(`${n}\t${ch}\tU+${ch.codePointAt(0).toString(16).toUpperCase()}`);
  }
  console.log('TOTAL emojis: ' + total + ' (distintos: ' + entries.length + ')');
}
