// 테스트용 최소 PDF 생성 (의존성 없음). 세로 Letter 1장 + 회전 90° 페이지 1장 + A4 1장.
// 실행: node scripts/make-sample-pdf.mjs <출력 경로>
import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'sample.pdf';

function stream(text) {
  return `<< /Length ${Buffer.byteLength(text, 'latin1')} >>\nstream\n${text}\nendstream`;
}
function pageText(label, x, y) {
  return `BT /F1 28 Tf ${x} ${y} Td (${label}) Tj ET\nBT /F1 12 Tf 72 72 Td (PDF MEMO sample) Tj ET`;
}

const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>',
  stream(pageText('Page 1 - Letter portrait', 72, 700)),
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Rotate 90 /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>',
  stream(pageText('Page 2 - rotated 90', 72, 700)),
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>',
  stream(pageText('Page 3 - A4', 72, 750)),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];

let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
const offsets = [];
objects.forEach((obj, i) => {
  offsets.push(Buffer.byteLength(body, 'latin1'));
  body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
});
const xrefOffset = Buffer.byteLength(body, 'latin1');
let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
body += `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

writeFileSync(out, Buffer.from(body, 'latin1'));
console.log(`wrote ${out} (${Buffer.byteLength(body, 'latin1')} bytes, ${objects.length} objects)`);
