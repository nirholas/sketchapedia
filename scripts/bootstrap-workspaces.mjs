#!/usr/bin/env node
/**
 * Bootstraps the Sketchapedia monorepo workspaces.
 *
 * Generates boilerplate for every package under packages/ and every app under apps/,
 * plus the tests-e2e, infra, and benchmarks root directories.
 *
 * This script is idempotent: re-running it does not clobber existing src/**
 * implementation files beyond the templated boilerplate. It is part of prompt 01's
 * scaffold and is not expected to be run after packages start accumulating real code.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Package manifest. Each entry describes:
 *  - name: workspace folder name
 *  - scope: 'packages' | 'apps'
 *  - kind: 'lib' | 'app-vite' | 'app-docs' | 'app-worker' | 'app-bun' | 'e2e'
 *  - prompt: which prompt populates this package
 *  - description: short one-line README description
 *  - deps: internal @sketchapedia/* deps (workspace protocol)
 *  - references: TS composite project references (derived from deps if omitted)
 *  - extraDeps: additional external runtime deps
 *  - extraDevDeps: additional dev deps
 */
const PACKAGES = [
  {
    name: 'protocol',
    scope: 'packages',
    kind: 'lib',
    prompt: '02',
    description: 'Shared wire-protocol types and message schemas for Sketchapedia.',
    deps: [],
  },
  {
    name: 'cache-keys',
    scope: 'packages',
    kind: 'lib',
    prompt: '03',
    description: 'Content-addressed cache-key derivation shared by client and server.',
    deps: ['protocol'],
  },
  {
    name: 'client-core',
    scope: 'packages',
    kind: 'lib',
    prompt: '04-09, 11-13',
    description:
      'Framework-agnostic Sketchapedia client SDK — canvas renderer, overlay, transport, cache.',
    deps: ['protocol', 'cache-keys'],
  },
  {
    name: 'client-react',
    scope: 'packages',
    kind: 'lib',
    prompt: '10',
    description: 'React 19 bindings for @sketchapedia/client-core.',
    deps: ['client-core', 'protocol'],
    extraDevDeps: {
      '@types/react': '^19.0.2',
      react: '^19.0.0',
      jsdom: '^26.0.0',
    },
    peerDeps: { react: '>=18' },
  },
  {
    name: 'server-gateway',
    scope: 'packages',
    kind: 'lib',
    prompt: '14',
    description:
      'WebSocket entry gateway (Bun + Hono) — terminates client transport, authenticates, fans out to orchestrator.',
    deps: ['protocol'],
  },
  {
    name: 'server-orchestrator',
    scope: 'packages',
    kind: 'lib',
    prompt: '15',
    description: 'Scene generation pipeline — LLM → image → video → vision grounding → cache.',
    deps: ['protocol', 'cache-keys'],
  },
  {
    name: 'model-llm',
    scope: 'packages',
    kind: 'lib',
    prompt: '16',
    description: 'Layout + hitmap generator — Anthropic Claude structured tool use, pluggable.',
    deps: ['protocol'],
    extraDeps: {
      '@anthropic-ai/sdk': '^0.90.0',
      zod: '^4.3.6',
      'zod-to-json-schema': '^3.25.2',
    },
    extraDevDeps: {
      '@google/genai': '^1.50.1',
      openai: '^6.34.0',
    },
    peerDeps: {
      '@google/genai': '^1.50.1',
      openai: '^6.34.0',
    },
    peerDepsMeta: {
      '@google/genai': { optional: true },
      openai: { optional: true },
    },
  },
  {
    name: 'model-image',
    scope: 'packages',
    kind: 'lib',
    prompt: '17',
    description:
      'Image model runtime — FLUX.1-dev with IP-Adapter + ControlNet reference conditioning.',
    deps: ['protocol'],
  },
  {
    name: 'model-video',
    scope: 'packages',
    kind: 'lib',
    prompt: '18',
    description: 'Video model runtime — LTX-Video transition clips between keyframes.',
    deps: ['protocol'],
  },
  {
    name: 'model-vision',
    scope: 'packages',
    kind: 'lib',
    prompt: '19',
    description: 'Hitmap-to-pixel correction via Florence-2 / Grounding DINO.',
    deps: ['protocol'],
  },
  {
    name: 'cache-server',
    scope: 'packages',
    kind: 'lib',
    prompt: '20',
    description: 'Server-side cache — Redis for metadata, S3/R2 for artifacts.',
    deps: ['protocol', 'cache-keys'],
  },
  {
    name: 'edge-worker',
    scope: 'packages',
    kind: 'app-worker',
    prompt: '21',
    description: 'Cloudflare Worker — edge cache + CDN layer for scene artifacts.',
    deps: ['protocol', 'cache-keys'],
    extraDevDeps: {
      '@cloudflare/workers-types': '^4.20250101.0',
      wrangler: '^3.99.0',
    },
  },
  {
    name: 'gpu-dispatcher',
    scope: 'packages',
    kind: 'lib',
    prompt: '22',
    description: 'GPU dispatch — Modal (primary) + RunPod adapter for model runtimes.',
    deps: ['protocol'],
  },
  {
    name: 'devtools',
    scope: 'packages',
    kind: 'lib',
    prompt: '23',
    description:
      'Sketchapedia inspector — overlay introspection, hitmap visualization, trace viewer.',
    deps: ['protocol', 'client-core'],
  },
  {
    name: 'observability',
    scope: 'packages',
    kind: 'lib',
    prompt: '24',
    description: 'OpenTelemetry helpers — traces, metrics, logs — shared by client and server.',
    deps: ['protocol'],
  },
  {
    name: 'security',
    scope: 'packages',
    kind: 'lib',
    prompt: '26',
    description: 'Auth, CSP, prompt-injection defense, tenant isolation primitives.',
    deps: ['protocol'],
  },
  {
    name: 'cli',
    scope: 'packages',
    kind: 'lib',
    prompt: '27',
    description:
      '`sketchapedia` command-line tool — project scaffolding, scene inspection, local dev server.',
    deps: ['protocol', 'client-core', 'cache-keys'],
    bin: { sketchapedia: './dist/cli.js' },
  },

  // Apps
  {
    name: 'docs',
    scope: 'apps',
    kind: 'app-docs',
    prompt: '28',
    description: 'Sketchapedia documentation site.',
    deps: [],
  },
  {
    name: 'examples-eiffel',
    scope: 'apps',
    kind: 'app-vite',
    prompt: '29',
    description:
      'Reference app: Essential Guide to Paris — hand-drawn map → Eiffel cross-section → Le Jules Verne booking.',
    deps: ['client-core', 'client-react', 'protocol'],
  },
  {
    name: 'examples-ice-water',
    scope: 'apps',
    kind: 'app-vite',
    prompt: '30',
    description:
      'Reference app: Why Does Ice Float — molecular diagrams morphing into photorealistic water footage.',
    deps: ['client-core', 'client-react', 'protocol'],
  },
  {
    name: 'examples-times-square',
    scope: 'apps',
    kind: 'app-vite',
    prompt: '31',
    description:
      'Reference app: Evolution of Times Square — isometric scrubbable architectural timeline.',
    deps: ['client-core', 'client-react', 'protocol'],
  },
  {
    name: 'examples-dashboard',
    scope: 'apps',
    kind: 'app-vite',
    prompt: '32',
    description:
      'Reference app: Project Dashboard — comic-book-style software engineering dashboard with schema diagrams.',
    deps: ['client-core', 'client-react', 'protocol'],
  },
];

const E2E = {
  name: 'tests-e2e',
  scope: 'root',
  kind: 'e2e',
  prompt: '25',
  description: 'Playwright end-to-end suite exercising the client SDK against reference apps.',
  deps: ['client-core', 'client-react', 'protocol'],
};

function writeIfMissing(path, contents) {
  if (existsSync(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return true;
}

function writeAlways(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return true;
}

function internalDeps(pkg) {
  const deps = {};
  for (const d of pkg.deps) deps[`@sketchapedia/${d}`] = 'workspace:*';
  return deps;
}

function tsReferences(pkg) {
  const prefix =
    pkg.scope === 'packages' ? '..' : pkg.scope === 'apps' ? '../../packages' : '../packages';
  return pkg.deps.map((d) => ({ path: `${prefix}/${d}` }));
}

function camelIdent(name) {
  return name
    .split(/[-_]/)
    .map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join('');
}

function renderPackageJson(pkg) {
  const base = {
    name: `@sketchapedia/${pkg.name}`,
    version: '0.0.0',
    description: pkg.description,
    type: 'module',
    license: 'Apache-2.0',
    author: 'Sketchapedia contributors',
    homepage: `https://github.com/nirholas/sketchapedia/tree/main/${pkg.scope}/${pkg.name}`,
    repository: {
      type: 'git',
      url: 'https://github.com/nirholas/sketchapedia.git',
      directory: `${pkg.scope}/${pkg.name}`,
    },
    publishConfig: { access: 'public' },
  };

  if (pkg.kind === 'lib') {
    Object.assign(base, {
      main: './dist/index.js',
      module: './dist/index.js',
      types: './dist/index.d.ts',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          import: './dist/index.js',
          default: './dist/index.js',
        },
      },
      files: ['dist', 'README.md', 'CHANGELOG.md'],
      sideEffects: false,
    });
  }

  if (pkg.bin) base.bin = pkg.bin;

  const scripts = {};
  if (pkg.kind === 'lib') {
    scripts.build = 'tsup';
    scripts.dev = 'tsup --watch';
    scripts.test = 'vitest run --coverage';
    scripts['test:watch'] = 'vitest';
    scripts.lint = 'biome check src';
    scripts.typecheck = 'tsc --noEmit';
    scripts.clean = 'rimraf dist .turbo .typecheck coverage *.tsbuildinfo';
  } else if (pkg.kind === 'app-vite') {
    scripts.build = 'vite build';
    scripts.dev = 'vite';
    scripts.preview = 'vite preview';
    scripts.test = 'vitest run --coverage';
    scripts.lint = 'biome check src';
    scripts.typecheck = 'tsc --noEmit';
    scripts.clean = 'rimraf dist .turbo .typecheck coverage *.tsbuildinfo';
  } else if (pkg.kind === 'app-worker') {
    scripts.build = 'tsup';
    scripts.dev = 'wrangler dev';
    scripts.deploy = 'wrangler deploy';
    scripts.test = 'vitest run --coverage';
    scripts.lint = 'biome check src';
    scripts.typecheck = 'tsc --noEmit';
    scripts.clean = 'rimraf dist .turbo .typecheck coverage .wrangler *.tsbuildinfo';
  } else if (pkg.kind === 'app-docs') {
    scripts.build = 'vite build';
    scripts.dev = 'vite';
    scripts.preview = 'vite preview';
    scripts.test = 'vitest run --coverage';
    scripts.lint = 'biome check src';
    scripts.typecheck = 'tsc --noEmit';
    scripts.clean = 'rimraf dist .turbo .typecheck coverage *.tsbuildinfo';
  } else if (pkg.kind === 'e2e') {
    // Scaffold: `test` = Vitest (node env, covers scaffold smoke).
    // Real Playwright browser suite runs via `test:e2e` once prompt 25 lands;
    // it requires browsers that are not part of the prompt-01 smoke pipeline.
    scripts.test = 'vitest run --coverage';
    scripts['test:e2e'] = 'playwright test';
    scripts.build = 'tsc --noEmit';
    scripts.lint = 'biome check src';
    scripts.typecheck = 'tsc --noEmit';
    scripts.clean =
      'rimraf dist .turbo .typecheck coverage playwright-report test-results *.tsbuildinfo';
  }

  base.scripts = scripts;

  const devDependencies = {
    typescript: 'catalog:',
    vitest: 'catalog:',
    '@vitest/coverage-v8': 'catalog:',
    '@biomejs/biome': 'catalog:',
    rimraf: 'catalog:',
    '@types/node': 'catalog:',
  };
  if (pkg.kind === 'lib' || pkg.kind === 'app-worker') devDependencies.tsup = 'catalog:';
  if (pkg.kind === 'app-vite' || pkg.kind === 'app-docs') {
    devDependencies.vite = '^6.0.7';
    devDependencies['@vitejs/plugin-react'] = '^4.3.4';
    devDependencies['@types/react'] = '^19.0.2';
    devDependencies['@types/react-dom'] = '^19.0.2';
    devDependencies.jsdom = '^26.0.0';
  }
  if (pkg.kind === 'e2e') {
    devDependencies['@playwright/test'] = '^1.49.1';
  }

  Object.assign(devDependencies, pkg.extraDevDeps || {});

  const dependencies = internalDeps(pkg);
  Object.assign(dependencies, pkg.extraDeps || {});
  if (pkg.kind === 'app-vite' || pkg.kind === 'app-docs') {
    dependencies.react = '^19.0.0';
    dependencies['react-dom'] = '^19.0.0';
  }

  if (Object.keys(dependencies).length) base.dependencies = dependencies;
  if (pkg.peerDeps) base.peerDependencies = pkg.peerDeps;
  if (pkg.peerDepsMeta) base.peerDependenciesMeta = pkg.peerDepsMeta;
  base.devDependencies = devDependencies;

  return `${JSON.stringify(base, null, 2)}\n`;
}

function renderTsconfig(pkg) {
  const depthToRoot = pkg.scope === 'packages' || pkg.scope === 'apps' ? '../..' : '..';
  const tsconfig = {
    extends: `${depthToRoot}/tsconfig.base.json`,
    // No rootDir: path-resolved workspace deps import from sibling src/
    // directories, which TS would otherwise reject as outside rootDir when
    // declaration emit is enabled. tsup's own tsconfig.build.json controls the
    // actual emit surface, so this only affects `tsc --noEmit` typecheck.
    compilerOptions: {
      outDir: 'dist',
      tsBuildInfoFile: './dist/.tsbuildinfo',
    },
    include: ['src/**/*'],
    exclude: ['dist', 'node_modules', 'coverage', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
  };

  if (pkg.kind === 'app-vite' || pkg.kind === 'app-docs' || pkg.kind === 'e2e') {
    tsconfig.compilerOptions.lib = ['ES2022', 'DOM', 'DOM.Iterable'];
    tsconfig.compilerOptions.jsx = 'react-jsx';
  }
  if (
    pkg.kind === 'client-core' ||
    pkg.name === 'client-core' ||
    pkg.name === 'client-react' ||
    pkg.name === 'devtools'
  ) {
    tsconfig.compilerOptions.lib = ['ES2022', 'DOM', 'DOM.Iterable'];
  }
  if (pkg.name === 'client-react') {
    tsconfig.compilerOptions.jsx = 'react-jsx';
  }
  if (pkg.kind === 'app-worker') {
    tsconfig.compilerOptions.types = ['@cloudflare/workers-types'];
  }

  // Composite-project references AND tsconfig paths both resolve workspace deps
  // for TypeScript, but they conflict: references imply the dep's dist/ must be
  // built fresh, while paths want source resolution. We use paths only —
  // `tsc --noEmit` then catches a type error introduced in any dep's src/
  // without needing a prior build, which is the acceptance criterion for
  // prompt 01. The "composite: true" setting from the base tsconfig remains so
  // that `tsc --build` still works when tooling prefers the reference graph.
  if (pkg.deps.length) {
    const prefix =
      pkg.scope === 'packages' ? '..' : pkg.scope === 'apps' ? '../../packages' : '../packages';
    tsconfig.compilerOptions.baseUrl = '.';
    tsconfig.compilerOptions.paths = {};
    for (const d of pkg.deps) {
      tsconfig.compilerOptions.paths[`@sketchapedia/${d}`] = [`${prefix}/${d}/src/index.ts`];
    }
  }

  return `${JSON.stringify(tsconfig, null, 2)}\n`;
}

function renderTsupConfig(pkg) {
  const entry = pkg.bin ? `['src/index.ts', 'src/cli.ts']` : `['src/index.ts']`;
  return `import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ${entry},
  format: ['esm'],
  platform: 'neutral',
  target: 'es2022',
  // tsup's DTS bundler (rollup-plugin-dts) does not interoperate with composite
  // project references; point it at an override tsconfig that turns composite off.
  // The top-level tsconfig.json keeps composite: true so \`pnpm typecheck\` still
  // honours project references across the workspace.
  dts: { resolve: true },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  minify: false,
});
`;
}

function renderTsconfigBuild() {
  return `${JSON.stringify(
    {
      extends: './tsconfig.json',
      compilerOptions: {
        composite: false,
        declaration: false,
        declarationMap: false,
        incremental: false,
        tsBuildInfoFile: null,
      },
      references: [],
    },
    null,
    2,
  )}\n`;
}

function renderViteConfig(pkg) {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: 'dist',
  },
});
`;
}

function renderVitestConfig(pkg) {
  const aliasPrefix =
    pkg.scope === 'packages' ? '..' : pkg.scope === 'apps' ? '../../packages' : '../packages';
  const alias = pkg.deps
    .map(
      (d) =>
        `      '@sketchapedia/${d}': new URL('${aliasPrefix}/${d}/src/index.ts', import.meta.url).pathname,`,
    )
    .join('\n');
  const environment =
    pkg.kind === 'app-worker'
      ? `'node'`
      : pkg.name === 'client-core' ||
          pkg.name === 'client-react' ||
          pkg.name === 'devtools' ||
          pkg.kind === 'app-vite' ||
          pkg.kind === 'app-docs'
        ? `'jsdom'`
        : `'node'`;

  const devDepNote =
    environment === `'jsdom'` ? '// jsdom environment used by browser-facing packages\n' : '';
  const resolve = alias ? `  resolve: {\n    alias: {\n${alias}\n    },\n  },\n` : '';

  return `import { defineConfig } from 'vitest/config';

${devDepNote}export default defineConfig({
${resolve}  test: {
    environment: ${environment},
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      // Prompt 01 scaffold coverage surface is limited to the canonical
      // entry points (and the bin stub for packages that declare one); each
      // downstream prompt expands this include list once it lands real code.
      include: ['src/index.ts'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/main.{ts,tsx}',
        'src/app.{ts,tsx}',
        'src/cli.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
`;
}

function renderIndexTs(pkg) {
  const ident = camelIdent(pkg.name);
  const Ident = ident[0].toUpperCase() + ident.slice(1);
  // Import one symbol from each @sketchapedia/* dep so composite project
  // references are actually exercised — a type error introduced in a dep's
  // public surface must propagate to this package's typecheck.
  const sortedDeps = [...pkg.deps].sort();
  const depImports = sortedDeps
    .map((d) => {
      const depIdent = camelIdent(d);
      const DepIdent = depIdent[0].toUpperCase() + depIdent.slice(1);
      return `import { ${depIdent}PackageName } from '@sketchapedia/${d}';
import type { ${DepIdent}PackageName } from '@sketchapedia/${d}';`;
    })
    .join('\n');
  const depWiring = sortedDeps
    .map((d) => {
      const depIdent = camelIdent(d);
      const DepIdent = depIdent[0].toUpperCase() + depIdent.slice(1);
      return `  { name: ${depIdent}PackageName satisfies ${DepIdent}PackageName }`;
    })
    .join(',\n');
  const depsBlock = sortedDeps.length
    ? `${depImports}\n\n/**
 * Compile-time attestation that this package can resolve the public surface of
 * every @sketchapedia/* dep it declares — tripped by any type error in a dep.
 * Prompt 01 uses this to prove composite project references are wired.
 */
export const ${ident}Deps = [
${depWiring},
] as const;\n\n`
    : '';
  return `/**
 * @sketchapedia/${pkg.name}
 *
 * ${pkg.description}
 *
 * Populated by prompt ${pkg.prompt}. This file is the scaffold stub produced by
 * prompt 01; it exports a canonical identifier plus a tiny branching helper so
 * that declaration emission, project references, and coverage thresholds can
 * all be exercised before the real module lands.
 */

${depsBlock}export const ${ident}PackageName = '@sketchapedia/${pkg.name}' as const;

export type ${Ident}PackageName = typeof ${ident}PackageName;

/**
 * Returns the canonical package name if \`alias\` is empty or undefined, otherwise
 * returns the alias unchanged. Trivial branching helper — its sole purpose is to
 * give the scaffold a reachable branch for coverage and a stable symbol for
 * cross-package smoke tests until prompt ${pkg.prompt} lands.
 */
export function resolve${Ident}Name(alias?: string | null): string {
  if (alias !== null && alias !== undefined && alias.length > 0) {
    return alias;
  }
  return ${ident}PackageName;
}
`;
}

function renderIndexTestTs(pkg) {
  const ident = camelIdent(pkg.name);
  const Ident = ident[0].toUpperCase() + ident.slice(1);
  const resolver = `resolve${Ident}Name`;
  const constant = `${ident}PackageName`;
  // Biome's organizeImports sorts destructured members alphabetically
  // (case-insensitive ASCII). Emit in the sorted order so lint passes.
  const [a, b] = [resolver, constant].sort((x, y) =>
    x.toLowerCase().localeCompare(y.toLowerCase()),
  );
  return `import { describe, expect, it } from 'vitest';

import { ${a}, ${b} } from './index.js';
import type { ${Ident}PackageName } from './index.js';

describe('@sketchapedia/${pkg.name} scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(${ident}PackageName).toBe('@sketchapedia/${pkg.name}');
  });

  it('preserves the literal package name as a type', () => {
    const name: ${Ident}PackageName = ${ident}PackageName;
    expect(name).toHaveLength('@sketchapedia/${pkg.name}'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolve${Ident}Name()).toBe(${ident}PackageName);
    expect(resolve${Ident}Name(null)).toBe(${ident}PackageName);
    expect(resolve${Ident}Name('')).toBe(${ident}PackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolve${Ident}Name('custom-alias')).toBe('custom-alias');
  });
});
`;
}

function renderReadme(pkg) {
  return `# @sketchapedia/${pkg.name}

${pkg.description}

**Populated by prompt ${pkg.prompt}.** This package is part of the Sketchapedia [monorepo](../../README.md); the canonical build spec lives at [\`prompts/${pkg.prompt.includes('-') ? pkg.prompt.split('-')[0].padStart(2, '0') : pkg.prompt.padStart(2, '0')}-*.md\`](../../prompts/).

## Usage

This package is currently the prompt-01 scaffold stub. It exports a single canonical constant so that declaration emission, composite project references, and smoke tests can be verified before the real module lands.

\`\`\`ts
import { ${camelIdent(pkg.name)}PackageName } from '@sketchapedia/${pkg.name}';
\`\`\`

## Scripts

- \`pnpm build\` — compile with tsup / vite (dual ESM + .d.ts for libraries).
- \`pnpm test\` — Vitest with v8 coverage (thresholds: 80% statements/branches/functions/lines).
- \`pnpm lint\` — Biome.
- \`pnpm typecheck\` — \`tsc --noEmit\`.

See [\`CONTRIBUTING.md\`](../../CONTRIBUTING.md) for workflow details.
`;
}

function renderVitePackageExtras(pkg) {
  return {
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${pkg.name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    'src/main.tsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app.js';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
    'src/app.tsx': `export function App() {
  return <main>${pkg.name} — prompt ${pkg.prompt} scaffold.</main>;
}
`,
  };
}

function writePackage(pkg) {
  const pkgDir = pkg.scope === 'root' ? join(ROOT, pkg.name) : join(ROOT, pkg.scope, pkg.name);

  writeAlways(join(pkgDir, 'package.json'), renderPackageJson(pkg));
  writeAlways(join(pkgDir, 'tsconfig.json'), renderTsconfig(pkg));
  writeAlways(join(pkgDir, 'vitest.config.ts'), renderVitestConfig(pkg));
  writeAlways(join(pkgDir, 'README.md'), renderReadme(pkg));

  if (pkg.kind === 'lib' || pkg.kind === 'app-worker') {
    writeAlways(join(pkgDir, 'tsup.config.ts'), renderTsupConfig(pkg));
    writeAlways(join(pkgDir, 'tsconfig.build.json'), renderTsconfigBuild());
  }
  if (pkg.kind === 'app-vite' || pkg.kind === 'app-docs') {
    writeAlways(join(pkgDir, 'vite.config.ts'), renderViteConfig(pkg));
    const extras = renderVitePackageExtras(pkg);
    for (const [rel, contents] of Object.entries(extras)) {
      writeIfMissing(join(pkgDir, rel), contents);
    }
  }

  writeAlways(join(pkgDir, 'src/index.ts'), renderIndexTs(pkg));
  writeAlways(join(pkgDir, 'src/index.test.ts'), renderIndexTestTs(pkg));

  if (pkg.bin) {
    writeIfMissing(
      join(pkgDir, 'src/cli.ts'),
      `#!/usr/bin/env node
/**
 * @sketchapedia/${pkg.name} CLI entry.
 * Populated by prompt ${pkg.prompt}. Scaffold prints the package banner.
 */
import { ${camelIdent(pkg.name)}PackageName } from './index.js';

function main(): void {
  process.stdout.write(\`\${${camelIdent(pkg.name)}PackageName} scaffold — run by prompt ${pkg.prompt}\\n\`);
}

main();
`,
    );
  }

  if (pkg.kind === 'app-worker') {
    writeIfMissing(
      join(pkgDir, 'wrangler.toml'),
      `name = "sketchapedia-edge"
main = "dist/index.js"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]
`,
    );
  }

  if (pkg.kind === 'e2e') {
    writeIfMissing(
      join(pkgDir, 'playwright.config.ts'),
      `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  testMatch: /.*\\.e2e\\.ts$/,
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
`,
    );
    writeIfMissing(
      join(pkgDir, 'src/smoke.e2e.ts'),
      `import { expect, test } from '@playwright/test';

test('sketchapedia scaffold placeholder @smoke', async () => {
  // Real suite lands in prompt 25; this stub exists so the e2e project is discoverable.
  expect(1 + 1).toBe(2);
});
`,
    );
  }
}

for (const pkg of PACKAGES) writePackage(pkg);
writePackage(E2E);

// Root placeholder packages — infra, benchmarks — non-publishable, minimal.
function writeScaffoldDir(dir, label) {
  const target = join(ROOT, dir);
  mkdirSync(target, { recursive: true });
  writeIfMissing(
    join(target, 'README.md'),
    `# ${dir}\n\n${label}\n\nPopulated by a later prompt. Intentionally empty at scaffold time.\n`,
  );
  writeIfMissing(join(target, '.gitkeep'), '');
}
writeScaffoldDir('infra', 'Pulumi IaC — deploy topology for Sketchapedia. Populated by prompt 33.');
writeScaffoldDir('benchmarks', 'Latency and cost benchmarking harness. Populated by prompt 34.');

// Run Biome over the generated sources so the scaffold is always emitted in
// the formatter's preferred layout — avoids line-length boundary flakiness
// between short and long package names in the `${pkg}Deps` array literal.
import { spawnSync } from 'node:child_process';
const fmt = spawnSync(
  'pnpm',
  ['exec', 'biome', 'format', '--write', 'packages', 'apps', 'tests-e2e'],
  { cwd: ROOT, stdio: 'ignore' },
);
if (fmt.status !== 0 && fmt.status !== null) {
  process.stderr.write(`biome format exited with status ${fmt.status}\n`);
}

console.log('Workspace scaffold written.');
