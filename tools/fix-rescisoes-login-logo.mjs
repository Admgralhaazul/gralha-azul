import fs from 'fs';

const f = 'C:/Users/Kamile/Projects/gralha-azul/rescisoes.html';
let h = fs.readFileSync(f, 'utf8');
const re = /<img class="login-right-logo" src="data:image\/png;base64,[^"]+"/;
if (!re.test(h)) {
  console.log('Login logo already updated or pattern not found');
  process.exit(0);
}
h = h.replace(
  re,
  '<img class="login-right-logo" src="./assets/logo-gralha-azul.png" alt="Gralha Azul Imobiliária"'
);
fs.writeFileSync(f, h);
console.log('rescisoes login logo updated');
