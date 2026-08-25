// Lint exists here to guard the two invariants tsc cannot express: the purity
// of packages/core and the determinism contract (docs/DECISIONS.md #6).
// Style is not policed — the type checker and review cover that.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Non-deterministic sources banned anywhere the seeded engine can reach. */
const DETERMINISM_GUARD = [
  'error',
  {
    object: 'Math',
    property: 'random',
    message: 'Determinism: randomness must flow through createRng, keyed to kill index (DECISIONS.md #6).',
  },
  {
    object: 'Date',
    property: 'now',
    message: 'Determinism: read the clock from GameState.timeSec, never wall time (DECISIONS.md #6).',
  },
  {
    object: 'performance',
    property: 'now',
    message: 'Determinism: read the clock from GameState.timeSec, never wall time (DECISIONS.md #6).',
  },
];

const NO_DEEP_CORE_IMPORT = [
  'error',
  {
    patterns: [
      {
        group: ['@wanderblade/core/*'],
        message: 'Import from the @wanderblade/core public index only — src/ layout is internal.',
      },
    ],
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      // A git worktree is a second checkout of this repo: linting it double-
      // reports every finding and makes one agent's WIP fail another's gate.
      '.worktrees/**',
      '.gauntlet/**',
      '.codex/**',
      '.omc/**',
      '.omx/**',
      '.playwright-mcp/**',
      'sim/out/**',
      'app/public/**',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The GameEvent union grows; every switch over it must grow with it —
      // unless it opts out with an explicit default.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      // Forward-declared bindings that closures capture before assignment
      // cannot be const; that pattern is deliberate, not an oversight.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
    },
  },

  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-properties': DETERMINISM_GUARD,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', '@wanderblade/*'],
              message: 'packages/core is platform-free and depends on nothing (DECISIONS.md #6).',
            },
          ],
        },
      ],
    },
  },

  {
    // The bot must reproduce a client run exactly, so it obeys the same clock rule.
    files: ['sim/src/**/*.ts'],
    rules: {
      'no-restricted-properties': DETERMINISM_GUARD,
      'no-restricted-imports': NO_DEEP_CORE_IMPORT,
    },
  },

  {
    files: ['app/src/**/*.ts'],
    rules: { 'no-restricted-imports': NO_DEEP_CORE_IMPORT },
  },

  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
