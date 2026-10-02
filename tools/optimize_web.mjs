// The deployment-only transform of the Python-assembled page. Source files and
// standalone dashboard exports stay readable; only ignored web/index.html changes.
import {readFileSync, writeFileSync, realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
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
  const optimized = optimizePage(html); // Finish every transform before writing.
  writeFileSync(file, optimized, 'utf8');
  console.log(`optimized web/index.html: ${Buffer.byteLength(html)} → ${Buffer.byteLength(optimized)} bytes`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  optimizeWeb(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
}
