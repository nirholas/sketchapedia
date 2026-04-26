import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  platform: 'neutral',
  target: 'es2022',
  // tsup's DTS bundler (rollup-plugin-dts) does not interoperate with composite
  // project references; point it at an override tsconfig that turns composite off.
  // The top-level tsconfig.json keeps composite: true so `pnpm typecheck` still
  // honours project references across the workspace.
  dts: { resolve: true },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  minify: false,
});
