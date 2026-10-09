import { defineConfig } from 'vite';

// GitHub Pages serves the game from a project subpath; `--mode pages` builds
// and previews it there, in its own outDir so a root build in dist/ survives.
export default defineConfig(({ mode }) =>
  mode === 'pages' ? { base: '/wanderblade/', build: { outDir: 'dist-pages' } } : {},
);
