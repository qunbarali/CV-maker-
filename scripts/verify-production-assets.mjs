import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const dist=path.join(root,"dist");
const required=["index.html","assets","tesseract/worker.min.js","tesseract/tesseract-core-simd-lstm.wasm.js","tesseract/tesseract-core-simd-lstm.wasm","tessdata/eng.traineddata","pdfjs/pdf.worker.min.mjs"];
const missing=required.filter(p=>!fs.existsSync(path.join(dist,p)));
if(missing.length){console.error("[production-assets] MISSING:",missing.join(", "));process.exit(1)}
const html=fs.readFileSync(path.join(dist,"index.html"),"utf8");
if(/(?:src|href)=["']\/(?!\/)/.test(html)){console.error("[production-assets] FATAL: root-absolute src/href remains in dist/index.html");process.exit(1)}
if(!/<script[^>]+src=["'][^"']+assets\/[^"']+\.js/.test(html)){console.error("[production-assets] FATAL: compiled JS entry is missing from dist/index.html");process.exit(1)}
if(!/<link[^>]+href=["'][^"']+assets\/[^"']+\.css/.test(html)){console.error("[production-assets] FATAL: compiled CSS entry is missing from dist/index.html");process.exit(1)}
console.log("[production-assets] OK · Vite entry, CSS/JS, OCR, PDF worker and bundled runtime assets are present and relative.");