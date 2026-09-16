// build.js
// Moves every readable .js file into src/ (mirroring the original tree)
// and writes an obfuscated, fully-working copy back to its original path.
// Only run this AFTER src/ already holds the readable originals — use
// `npm run build` going forward; never hand-edit the obfuscated output.
//
// Files intentionally left alone (not obfuscated): package.json,
// package-lock.json, Procfile, Dockerfile, app.json, heroku.yml, .env*,
// lib/database/database.db, and non-JS assets. lib/pair.html gets its
// inline <script> block obfuscated in place, same as before.

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');

const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'src', 'pair_temp', 'pair_auth_temp']);
const EXCLUDE_FILES = new Set(['build.js']);

const OBFUSCATE_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.6,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 10,
  numbersToExpressions: true,
  simplify: true,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
};

// A lighter profile specifically for the HTML inline <script>. The full
// profile's selfDefending + splitStrings combination corrupts output when
// applied to a browser-context inline script (verified: it can inject
// stray fragments mid-string), even though it's fine for the Node.js files
// below. Browser code doesn't need Node-style anti-tamper defenses anyway.
const HTML_OBFUSCATE_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.6,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  splitStrings: false,
  numbersToExpressions: true,
  simplify: true,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
};

function walkJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js') && !EXCLUDE_FILES.has(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function obfuscateJsFile(originalPath) {
  const rel = path.relative(ROOT, originalPath);
  const srcCopy = path.join(SRC, rel);

  // First run: originals live at their real path, so back them up into src/.
  // Subsequent runs: src/ already holds the source of truth, so read from there.
  let code;
  if (fs.existsSync(srcCopy)) {
    code = fs.readFileSync(srcCopy, 'utf8');
  } else {
    code = fs.readFileSync(originalPath, 'utf8');
    fs.mkdirSync(path.dirname(srcCopy), { recursive: true });
    fs.writeFileSync(srcCopy, code, 'utf8');
  }

  const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATE_OPTIONS).getObfuscatedCode();
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  fs.writeFileSync(originalPath, result, 'utf8');
  return rel;
}

function obfuscateHtmlInlineScript(originalPath) {
  const rel = path.relative(ROOT, originalPath);
  const srcCopy = path.join(SRC, rel);

  let html;
  if (fs.existsSync(srcCopy)) {
    html = fs.readFileSync(srcCopy, 'utf8');
  } else {
    html = fs.readFileSync(originalPath, 'utf8');
    fs.mkdirSync(path.dirname(srcCopy), { recursive: true });
    fs.writeFileSync(srcCopy, html, 'utf8');
  }

  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    fs.writeFileSync(originalPath, html, 'utf8');
    return rel;
  }
  const obfuscated = JavaScriptObfuscator.obfuscate(scriptMatch[1], HTML_OBFUSCATE_OPTIONS).getObfuscatedCode();
  const newHtml = html.replace(scriptMatch[0], `<script>${obfuscated}</script>`);
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  fs.writeFileSync(originalPath, newHtml, 'utf8');
  return rel;
}

const jsFiles = walkJsFiles(ROOT);
let count = 0;
for (const file of jsFiles) {
  const rel = obfuscateJsFile(file);
  count++;
  console.log(`✔ [${count}/${jsFiles.length}] ${rel}`);
}

const pairHtml = path.join(ROOT, 'lib', 'pair.html');
if (fs.existsSync(pairHtml)) {
  obfuscateHtmlInlineScript(pairHtml);
  console.log('✔ lib/pair.html (inline script obfuscated)');
}

console.log(`\nBuild complete: ${count} JS files obfuscated. Only commit the generated files — src/ is gitignored.`);
