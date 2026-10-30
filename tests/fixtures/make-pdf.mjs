// Writes tests/fixtures/sample.pdf: a tiny three-page book with a title, for the e2e tests.
//   node tests/fixtures/make-pdf.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pages = [
  ['Chapter One', 'In my younger and more vulnerable years my father gave me some advice.', 'This is a test page for Gilded Pages.'],
  ['Chapter One (cont.)', 'Whenever you feel like criticizing anyone, he told me, just remember.', 'A second page of honest reading.'],
  ['Chapter Two', 'About half way between West Egg and New York the motor road joins the railroad.', 'The third and last page.'],
];

const objs = [];
const add = (s) => objs.push(s) && objs.length;
const catalog = add('');
const pagesObj = add('');
const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
const kids = [];
for (const lines of pages) {
  const text = lines.map((l, i) => `BT /F1 ${i ? 14 : 24} Tf 72 ${700 - i * 40} Td (${l}) Tj ET`).join('\n');
  const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
}
objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
const info = add('<< /Title (The Sample Book) /Author (Test Author) >>');

let out = '%PDF-1.4\n';
const offsets = [];
objs.forEach((o, i) => {
  offsets.push(out.length);
  out += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const xref = out.length;
out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(fileURLToPath(new URL('./sample.pdf', import.meta.url)), out, 'latin1');
console.log('wrote sample.pdf');
