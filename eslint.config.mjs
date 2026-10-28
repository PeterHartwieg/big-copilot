// ESLint for the page scripts and the Node tooling (docs/contributing.md,
// "Linting"). `npm run lint` runs it with Ruff through tools/verify.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Required rather than imported, so NODE_PATH pointing at another checkout's
// node_modules works in a worktree without one, as it does for ESLint itself.
const require = createRequire(import.meta.url);
const js = require('@eslint/js');
const globals = require('globals');

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const listed = (folder, suffix) => fs.readdirSync(path.join(ROOT, folder)).filter(name => name.endsWith(suffix)).sort().map(name => `${folder}/${name}`);

// ---------------------------------------------------------- the shared scope
// The classic scripts of a page share one global scope, so a name one of them
// declares at the top is defined in all the others. This reads their column-0
// declarations the way tests/global_names.test.cjs does (which also holds each
// name to one declaration across the files) and gives every file the names the
// other files declare. A file's own names stay out of its globals: no-redeclare
// would read them as redeclared built-ins.
const DECL = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^class\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+(.*)$/;

// The names one `const`/`let`/`var` line declares: the first, and each further
// `, name =` or `, name;` at bracket depth 0, with string contents skipped.
function declarators(rest) {
  const names = [];
  let depth = 0, start = 0, quote = null;
  const take = segment => { const m = /^\s*([A-Za-z_$][\w$]*)\s*(?:=(?![=>])|;|$)/.exec(segment); if (m) names.push(m[1]); };
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '/' && rest[i + 1] === '/') { rest = rest.slice(0, i); break; }
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { take(rest.slice(start, i)); start = i + 1; }
  }
  take(rest.slice(start));
  return names;
}

const topLevelNames = text => text.split('\n').flatMap(line => {
  const m = DECL.exec(line);
  return !m ? [] : m[3] !== undefined ? declarators(m[3]) : [m[1] || m[2]];
});

// The names a script puts on the page's global object (`window.name = ...`),
// which other code then reads bare.
const assigned = text => [...text.matchAll(/\b(?:window|globalThis|self)\.([A-Za-z_$][\w$]*)\s*=(?![=>])/g)].map(m => m[1]);

// The JavaScript inline scripts of an HTML template, joined.
function inlineScripts(rel) {
  return [...read(rel).matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter(([, attrs = '']) => {
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/.exec(attrs);
    return !/\bsrc\s*=/.test(attrs) && (!type || /^(text|application)\/javascript$/i.test(type[1]));
  }).map(m => m[2]).join('\n');
}

// The words a file uses outside comments, less the names it declares anywhere
// itself, which are its own locals (a second top-level one is the duplicate
// the test catches). Rough by design: a stray mention only hides a finding.
function mentions(rel) {
  const text = read(rel).replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(^|[^:\\'"`\w])\/\/.*$/gm, '$1');
  const local = new Set([...text.matchAll(/\b(?:const|let|var|class|function\s*\*?)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
  return new Set((text.match(/[A-Za-z_$][\w$]*/g) || []).filter(word => !local.has(word)));
}

const SUITES = listed('tests', '.cjs');
const writable = names => Object.fromEntries([...names].map(name => [name, 'writable']));

// The top-level names of each page script that another file of its page, or a
// suite, uses, by path. No per-file linter sees those uses, so the
// page/shared-scope rule below marks the names used for no-unused-vars.
const USED_ELSEWHERE = new Map();

// One page's sources: a config per script with the names its page's other
// sources declare, and every name, for the suites. An HTML template is not
// linted; it lends its inline scripts' names and its markup's uses.
function pageScope(sources) {
  const texts = new Map(sources.map(rel => [rel, rel.endsWith('.html') ? inlineScripts(rel) : read(rel)]));
  const declared = new Map([...texts].map(([rel, text]) => [rel, topLevelNames(text)]));
  const onWindow = [...texts.values()].flatMap(assigned);
  const readers = new Map([...sources, ...SUITES].map(rel => [rel, mentions(rel)]));
  return {
    all: writable(new Set([...declared.values()].flat().concat(onWindow))),
    configs: sources.filter(rel => rel.endsWith('.js')).map(rel => {
      const own = new Set(declared.get(rel));
      const others = [...readers.keys()].filter(other => other !== rel);
      const used = [...own].filter(name => others.some(other => readers.get(other).has(name)));
      USED_ELSEWHERE.set(rel, [...new Set([...(USED_ELSEWHERE.get(rel) || []), ...used])]);
      const shared = sources.filter(other => other !== rel).flatMap(other => declared.get(other)).concat(onWindow);
      return { files: [rel], languageOptions: { globals: writable(shared.filter(name => !own.has(name))) } };
    }),
  };
}

const page = {
  rules: {
    'shared-scope': {
      meta: { type: 'problem', docs: { description: 'Marks the top-level names another script of the page uses' }, schema: [] },
      create(context) {
        const names = USED_ELSEWHERE.get(path.relative(ROOT, context.filename).split(path.sep).join('/')) || [];
        return { Program(node) { for (const name of names) context.sourceCode.markVariableAsUsed(name, node); } };
      },
    },
  },
};

// The board and the hosted shell: web/i18n.js in the head, board.html's inline
// scripts, the calculation cores and board.js (with map.js and wiki.js spliced
// in), and the site's update.js, app.js, community.js and report.js.
const BOARD = pageScope(['web/i18n.js', 'template/board.html', ...listed('template', '.js'),
  'web/map.js', 'web/wiki.js', 'web/update.js', 'web/app.js', 'web/community.js', 'web/report.js']);
// The translation page: web/i18n.js, translate.html's inline scripts and translate.js.
const TRANSLATE = pageScope(['web/i18n.js', 'template/translate.html', 'web/translate.js']);

// Unused names, not unused parameters or caught errors; `const {a, ...rest} = o`
// drops `a` from rest on purpose.
const UNUSED = { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true };

// Findings in files this change does not own, each fixed in a follow-up. A rule
// in `off` is off in that one file only; no-unused-vars stays on there for every
// name but the ones `unused` lists; `directives` stops reporting a stale
// eslint-disable comment.
const FOLLOW_UP = {
  'template/board.js': { // 9 no-unused-vars, 2 no-useless-assignment, 2 no-prototype-builtins: fixed in a follow-up
    unused: ['smaller', 'each', 't', 'ofWholesale', 'ofKit', 'ofIngredientsUncontracted', 'sfSpotWord'],
    off: ['no-useless-assignment', 'no-prototype-builtins'] },
  'template/mod-demand-model.js': { off: ['no-useless-assignment'] }, // 1, fixed in a follow-up
  'template/open-factory-model.js': { unused: ['g'] }, // 1, fixed in a follow-up
  'template/open-store-model.js': { off: ['no-useless-assignment'] }, // 2, fixed in a follow-up
  'web/app.js': { off: ['no-useless-assignment'] }, // 1, fixed in a follow-up
  'web/community.js': { off: ['no-useless-assignment'] }, // 1, fixed in a follow-up
  'web/map.js': { off: ['preserve-caught-error'] }, // 1, fixed in a follow-up
  'web/report.js': { off: ['no-useless-assignment'] }, // 2, fixed in a follow-up
  'tests/businesses_expansion.test.cjs': { unused: ['GIFTS', 'SPIRITS'] }, // 2, fixed in a follow-up
  'tests/chart_hover.test.cjs': { unused: ['en'] }, // 1, fixed in a follow-up
  'tests/community-browser.test.cjs': { off: ['no-useless-escape'] }, // 1, fixed in a follow-up
  'tests/findability.test.cjs': { unused: ['path', 'fs'] }, // 2, fixed in a follow-up
  'tests/finder.test.cjs': { unused: ['plan'] }, // 1, fixed in a follow-up
  'tests/finder_layout.test.cjs': { unused: ['path', 'at', 'facts', 'saved'] }, // 4, fixed in a follow-up
  'tests/finder_saved.test.cjs': { unused: ['chip', 'pick'] }, // 2, fixed in a follow-up
  'tests/fold_views.test.cjs': { unused: ['path', 'fs'] }, // 2, fixed in a follow-up
  'tests/game_link_write_approval.test.cjs': { unused: ['until'], off: ['no-useless-escape'] }, // 1 each, fixed in a follow-up
  'tests/game_link_write_imports.test.cjs': { unused: ['kept', 'corner'] }, // 2, fixed in a follow-up
  'tests/game_link_write_schedule.test.cjs': { unused: ['button', 'pair', 'kept'] }, // 3, fixed in a follow-up
  'tests/game_names.test.cjs': { unused: ['enRe'] }, // 1, fixed in a follow-up
  'tests/i18n_layout.test.cjs': { off: ['no-useless-escape'] }, // 1, fixed in a follow-up
  'tests/import_routes.test.cjs': { unused: ['redraw'] }, // 1, fixed in a follow-up
  'tests/import_setto.test.cjs': { unused: ['fs'] }, // 1, fixed in a follow-up
  'tests/job_demands.test.cjs': { unused: ['enRe', 'path', 'fs'] }, // 3, fixed in a follow-up
  'tests/layout.test.cjs': { unused: ['en', 'path', 'fs'] }, // 3, fixed in a follow-up
  'tests/office_site.test.cjs': { unused: ['fs'] }, // 1, fixed in a follow-up
  'tests/open_store.test.cjs': { unused: ['rows', 'until', 'line'] }, // 3, fixed in a follow-up
  'tests/open_store_checklist.test.cjs': { unused: ['path', 'steps', 'money', 'line', 'traded'] }, // 5, fixed in a follow-up
  'tests/open_store_opened.test.cjs': { unused: ['running', 'rows', 'until', 'line'] }, // 4, fixed in a follow-up
  'tests/plan_extra.test.cjs': { unused: ['fs'] }, // 1, fixed in a follow-up
  'tests/roster.test.cjs': { unused: ['tile'], directives: true }, // 1 no-unused-vars, 1 stale directive, fixed in a follow-up
  'tests/site_panel.test.cjs': { unused: ['fs'] }, // 1, fixed in a follow-up
  'tests/street_food_model.test.cjs': { unused: ['fs'] }, // 1, fixed in a follow-up
  'tests/supply_sort.test.cjs': { unused: ['fs', 'root'] }, // 2, fixed in a follow-up
  'tests/translation_ui.test.cjs': { off: ['no-constant-condition'] }, // 1, fixed in a follow-up
};

export default [
  {
    ignores: ['.claude/', 'node_modules/', 'tests/fixtures/', 'web/py/', 'web/assets/', 'web/pyodide/', 'web/wiki/',
      'web/translate/', 'docs/', 'mockup/', 'research/', 'build/', 'dist/', '.wrangler/'],
  },
  js.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // In eslint:recommended already; named so that a change there cannot drop them.
      ...Object.fromEntries(['no-undef', 'no-redeclare', 'no-dupe-keys', 'no-unreachable', 'no-dupe-else-if',
        'no-self-assign'].map(rule => [rule, 'error'])),
      'no-unused-vars': ['error', UNUSED],
      // Storage and parsing that may throw sit in an empty catch on purpose.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // The page and the API strip control characters from text on purpose.
      'no-control-regex': 'off',
    },
  },

  // ------------------------------------------------------------ environments
  {
    files: ['template/**/*.js', 'web/**/*.js'],
    ignores: ['web/worker.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  ...BOARD.configs,
  ...TRANSLATE.configs,
  {
    files: [...USED_ELSEWHERE.keys()],
    plugins: { page },
    rules: { 'page/shared-scope': 'error' },
  },
  // The calculation cores also load under Node, for their arithmetic tests.
  {
    files: ['template/*-model.js'],
    languageOptions: { globals: globals.commonjs },
  },
  {
    files: ['web/worker.js'],
    languageOptions: { sourceType: 'script', globals: globals.worker },
  },
  {
    files: ['**/*.mjs'],
    ignores: ['server/**'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  // The community API runs on Cloudflare Workers: Web APIs, no Node.
  {
    files: ['server/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.serviceworker },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  // The suites hand functions to page.evaluate() and run the board script in
  // a VM, so their code also sees the browser's and the pages' globals, and
  // the names a suite itself puts on the page's window.
  {
    files: ['tests/**/*.cjs'],
    languageOptions: { globals: { ...globals.browser, ...BOARD.all, ...TRANSLATE.all } },
  },
  ...SUITES.map(rel => ({ files: [rel], languageOptions: { globals: writable(assigned(read(rel))) } })),
  // Renders the workshop art in a browser: page.evaluate() code included.
  {
    files: ['mod/workshop/render.cjs'],
    languageOptions: { globals: globals.browser },
  },

  // --------------------------------------------------------------- exceptions
  // `lookRun` holds the latest link check's promise for tests/game_link.test.cjs,
  // which awaits it inside the shell; no code of the page reads it.
  // BigCopilotShell.scope lets the tests stand in for the file's functions: its
  // setters assign to the function declarations on purpose.
  {
    files: ['web/app.js'],
    rules: { 'no-unused-vars': ['error', { ...UNUSED, varsIgnorePattern: '^lookRun$' }], 'no-func-assign': 'off' },
  },
  ...Object.entries(FOLLOW_UP).map(([rel, { unused = [], off = [], directives }]) => ({
    files: [rel],
    ...(directives ? { linterOptions: { reportUnusedDisableDirectives: 'off' } } : {}),
    rules: {
      ...(unused.length ? { 'no-unused-vars': ['error', { ...UNUSED, varsIgnorePattern: `^(?:${unused.join('|')})$` }] } : {}),
      ...Object.fromEntries(off.map(rule => [rule, 'off'])),
    },
  })),
];
