import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, 'src-tauri/tauri.conf.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const icons = config?.bundle?.icon;
if (!Array.isArray(icons) || icons.length === 0) {
  throw new Error('src-tauri/tauri.conf.json must explicitly list bundle.icon assets.');
}

const normalized = icons.map((icon) => String(icon).replaceAll('\\', '/'));
for (const required of ['icons/icon.ico', 'icons/icon.icns', 'icons/32x32.png', 'icons/128x128.png', 'icons/128x128@2x.png']) {
  if (!normalized.includes(required)) throw new Error(`Tauri bundle icon configuration is missing: ${required}`);
}

for (const relative of normalized) {
  if (isAbsolute(relative) || relative.split('/').includes('..')) throw new Error(`Unsafe icon path in Tauri config: ${relative}`);
  const path = resolve(root, 'src-tauri', relative);
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size < 100) {
    throw new Error(`Configured Tauri icon is missing or empty: src-tauri/${relative}`);
  }
  const bytes = readFileSync(path);
  if (relative.endsWith('.ico') && !(bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0)) {
    throw new Error(`Invalid Windows ICO header: src-tauri/${relative}`);
  }
  if (relative.endsWith('.icns') && bytes.toString('ascii', 0, 4) !== 'icns') {
    throw new Error(`Invalid macOS ICNS header: src-tauri/${relative}`);
  }
  if (relative.endsWith('.png')) {
    const validPng = bytes.length >= 24 && bytes.toString('hex', 0, 8) === '89504e470d0a1a0a';
    if (!validPng) throw new Error(`Invalid PNG icon: src-tauri/${relative}`);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width < 16 || height < 16 || width !== height) throw new Error(`PNG icon must be square and at least 16×16: src-tauri/${relative}`);
  }
  console.log(`OK ${relative}`);
}
console.log(`Validated ${normalized.length} configured Tauri icon assets.`);
