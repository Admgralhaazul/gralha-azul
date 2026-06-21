// Extrai os dois sistemas embutidos (srcdoc) do index.html para arquivos editaveis.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function unescapeHtml(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function extract(frameId) {
  const idIdx = src.indexOf(frameId);
  if (idIdx === -1) throw new Error('frame nao encontrado: ' + frameId);
  const marker = 'srcdoc="';
  const sd = src.indexOf(marker, idIdx);
  if (sd === -1) throw new Error('srcdoc nao encontrado para ' + frameId);
  const start = sd + marker.length;
  const end = src.indexOf('"', start); // proximo " literal (aspas internas estao escapadas)
  const raw = src.slice(start, end);
  return unescapeHtml(raw);
}

const resc = extract('id="ga-frame-r"');
const gest = extract('id="ga-frame-g"');

fs.writeFileSync(path.join(root, 'rescisoes.html'), resc, 'utf8');
fs.writeFileSync(path.join(root, 'gestao.html'), gest, 'utf8');

console.log('rescisoes.html:', resc.length, 'chars, comeca com', JSON.stringify(resc.slice(0, 30)));
console.log('gestao.html:', gest.length, 'chars, comeca com', JSON.stringify(gest.slice(0, 30)));
console.log('rescisoes tem login-overlay:', resc.includes('login-overlay'));
console.log('gestao tem dashboard/sidebar:', gest.includes('Panorama') || gest.includes('sidebar') || gest.includes('nav'));
