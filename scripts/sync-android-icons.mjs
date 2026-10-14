import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedIcons = resolve(root, 'src-tauri/icons/android');
const androidResources = resolve(root, 'src-tauri/gen/android/app/src/main/res');

if (!existsSync(generatedIcons)) {
  throw new Error(
    'Android launcher icons were not generated at src-tauri/icons/android. Run "npm run icons:generate" and inspect the Tauri CLI output.'
  );
}

const pngOrXml = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const source = join(dir, entry.name);
  if (entry.isDirectory()) return pngOrXml(source);
  return /\.(png|xml)$/i.test(entry.name) ? [source] : [];
});

const files = pngOrXml(generatedIcons);
if (!files.length) throw new Error('No Android PNG/XML icon assets were generated.');

if (!existsSync(androidResources)) {
  console.log('Android project is not initialized yet; Tauri will use the generated icon assets when it is initialized.');
  console.log(`Found ${files.length} generated Android icon assets.`);
  process.exit(0);
}

for (const source of files) {
  const relativePath = relative(generatedIcons, source);
  if (relativePath.split(sep).includes('..')) throw new Error('Unsafe generated icon path.');
  const destination = resolve(androidResources, relativePath);
  if (!destination.startsWith(androidResources + sep)) throw new Error('Generated icon path escapes Android resources.');
  const parent = dirname(destination);
  const { mkdirSync } = await import('node:fs');
  mkdirSync(parent, { recursive: true });
  cpSync(source, destination);
}
console.log(`Synced ${files.length} branded Android launcher icon assets into src-tauri/gen/android/app/src/main/res.`);
