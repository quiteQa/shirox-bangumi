const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'bangumi.json'), 'utf8'));
const base = process.argv[2];
if (!base) {
  console.error('Usage: node tools/package.cjs https://your-host.example/path/');
  process.exit(1);
}
const url = new URL(base);
if (url.protocol !== 'https:') throw Error('Use an HTTPS hosting directory');
if (!url.pathname.endsWith('/') || url.search || url.hash || url.username || url.password) {
  throw Error('Pass a directory URL ending in /, without credentials, query or fragment');
}
manifest.scriptUrl = new URL('bangumi.js', url).href;
const output = path.join(root, 'dist');
const script = fs.readFileSync(path.join(root, 'bangumi.js'), 'utf8');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(script, context, { timeout: 1000 });
if (context.BGM_CONFIG.accessToken || context.BGM_CONFIG.username) {
  throw Error('Refusing to package account credentials: use a clean script for public hosting');
}
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'bangumi.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'bangumi.js'), script);
console.log('Upload dist/bangumi.json and dist/bangumi.js to ' + url.href);
console.log('Import URL: ' + new URL('bangumi.json', url).href);
