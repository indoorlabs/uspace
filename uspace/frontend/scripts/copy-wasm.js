/**
 * copy-wasm.js
 * web-ifc의 WASM 바이너리를 public/ifc 폴더로 복사
 * 실행: node scripts/copy-wasm.js
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'web-ifc');
const dest = path.join(__dirname, '..', 'public', 'ifc');

if (!fs.existsSync(dest)) {
  fs.mkdirSync(dest, { recursive: true });
}

const wasmFiles = ['web-ifc.wasm', 'web-ifc-mt.wasm'];
let copied = 0;

for (const file of wasmFiles) {
  const srcFile = path.join(src, file);
  const destFile = path.join(dest, file);
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, destFile);
    console.log(`✅ 복사 완료: ${file} → public/ifc/${file}`);
    copied++;
  } else {
    console.warn(`⚠️  파일 없음 (설치 필요): ${srcFile}`);
  }
}

if (copied === 0) {
  console.error('❌ WASM 파일을 찾을 수 없습니다. 먼저 npm install web-ifc web-ifc-three 를 실행하세요.');
} else {
  console.log(`\n✅ ${copied}개 파일 복사 완료 → public/ifc/`);
}
