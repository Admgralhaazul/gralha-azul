import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

const outDir = 'C:/Users/Kamile/Projects/gralha-azul/tools/pdf-text';
fs.mkdirSync(outDir, { recursive: true });

const files = [
  { key: 'ocup', path: 'C:/Users/Kamile/Downloads/Manutenções Imóveis Ocupados geral.pdf' },
  { key: 'ager', path: 'C:/Users/Kamile/Downloads/manutenções assistente adm.pdf' },
  { key: 'tiago', path: 'C:/Users/Kamile/Downloads/manitenções tiago (executadas pela imob e condomínios).pdf' },
];

for (const f of files) {
  const buf = fs.readFileSync(f.path);
  const parser = new PDFParse({ data: buf });
  const textResult = await parser.getText();
  await parser.destroy();
  fs.writeFileSync(path.join(outDir, f.key + '.txt'), textResult.text, 'utf8');
  console.log(f.key, 'pages', textResult.total, 'chars', textResult.text.length);
}
