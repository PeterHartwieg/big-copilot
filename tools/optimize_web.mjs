// The deployment-only transform of the Python-assembled page. Source files and
// standalone dashboard exports stay readable; only ignored web/ artifacts change.
import {readFileSync, writeFileSync, realpathSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const {transformSync} = createRequire(import.meta.url)('esbuild');

export function optimizePage(html) {
  // render() emits plain classic script blocks. Leave external scripts and
  // other script types alone. Do not wrap blocks or rename identifiers: they
  // share the board's global scope and call each other's functions by name.
  return html.replace(/<script>([\s\S]*?)<\/script>/g, (_tag, code) => {
    const result = transformSync(code, {
      loader: 'js', platform: 'browser', target: 'es2022', charset: 'utf8',
      minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false,
      supported: {'inline-script': true},
    });
    // HTML's script tokenizer treats <!-- followed by <script specially.
    // Minification can decode the source's escaped '<' in strings. Retain
    // that block's original escaping rather than introduce parser states.
    if (result.code.includes('<!--')) return _tag;
    return `<script>${result.code.trimEnd()}</script>`;
  });
}

export function optimizeWeb(root) {
  const file = path.join(root, 'web', 'index.html');
  const html = readFileSync(file, 'utf8');
  const output = hostedPage(html); // Finish every transform before writing.
  for (const [url, bytes] of output.assets) {
    const target = path.join(root, 'web', url);
    mkdirSync(path.dirname(target), {recursive: true});
    writeFileSync(target, bytes);
  }
  writeFileSync(file, output.html, 'utf8');
  console.log(`optimized web/index.html: ${Buffer.byteLength(html)} → ${Buffer.byteLength(output.html)} bytes; ${output.assets.size} hosted assets`);
  return output;
}

// Only the largest board/model/map/wiki script and stylesheet leave the shell.
// This runs after the existing optimizer, so names hash exact shipped bytes.
// The classic script stays synchronous at the same position and global scope;
// standalone render() and raw assembly remain embedded. The lower bound keeps
// small test pages and future boot/release declarations in the shell.
export function hostedPage(raw) {
  let html = optimizePage(raw);
  const assets = new Map();
  for (const [tag, extension] of [['script', 'js'], ['style', 'css']]) {
    const blocks = [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))];
    const largest = blocks.reduce((best, block) => !best || block[1].length > best[1].length ? block : best, null);
    if (!largest || Buffer.byteLength(largest[1]) < 65536) continue;
    const bytes = Buffer.from(largest[1], 'utf8');
    const digest = createHash('sha256').update(bytes).digest();
    const url = `assets/board-${digest.toString('hex')}.${extension}`;
    const integrity = `sha256-${digest.toString('base64')}`;
    assets.set(url, bytes);
    const replacement = tag === 'script'
      ? `<script src="${url}" integrity="${integrity}" data-board-asset></script>`
      : `<link rel="stylesheet" href="${url}" integrity="${integrity}">`;
    html = html.slice(0, largest.index) + replacement + html.slice(largest.index + largest[0].length);
  }
  return {html, assets};
}

export function checkOptimized(root, raw) {
  const expected = hostedPage(raw);
  const stale = [];
  const differs = (relative, bytes) => {
    try { return !readFileSync(path.join(root, 'web', relative)).equals(Buffer.from(bytes)); }
    catch (err) { if (err.code === 'ENOENT') return true; throw err; }
  };
  if (differs('index.html', expected.html)) stale.push('web/index.html');
  for (const [url, bytes] of expected.assets) if (differs(url, bytes)) stale.push('web/' + url);
  const embedded = /window\.LEDGER_ASSETS = (\{[^\n]+\});<\/script>/.exec(raw);
  if (embedded) {
    const manifest = JSON.parse(embedded[1]);
    const bytes = Buffer.from(JSON.stringify(manifest) + '\n');
    const url = `assets/manifest-${createHash('sha256').update(bytes).digest('hex')}.json`;
    if (differs(url, bytes)) stale.push('web/' + url);
    for (const entry of [manifest.worker, ...Object.values(manifest.files)]) {
      try {
        if (createHash('sha256').update(readFileSync(path.join(root, 'web', entry.url))).digest('hex') === entry.sha256) continue;
      } catch (err) { if (err.code !== 'ENOENT') throw err; }
      stale.push('web/' + entry.url);
    }
  }
  return stale;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  if (process.argv[2] === '--check') {
    const result = spawnSync(process.env.PYTHON || 'python', ['-c',
      'import sys, build_web; sys.stdout.buffer.write(build_web.page_html(build_web.release_info()).encode("utf-8"))'],
    {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
    const stale = checkOptimized(root, result.stdout);
    for (const name of stale) console.error(`stale optimized asset: ${name}`);
    process.exitCode = stale.length ? 1 : 0;
  } else optimizeWeb(root);
}
