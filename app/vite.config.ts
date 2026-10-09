import { defineConfig } from 'vite';

// GitHub Pages serves the game from a project subpath; `--mode pages` builds
// and previews it there. Every other build stays at the site root.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/wanderblade/' : '/',
}));
