import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { detectComponent, getCodeSnippet } from '../component-detector';
import { traverse } from '../traverse';
import type { Diagnostic, Rule } from './types';

const REMOVED_V7_EXPERIMENTAL_FLAGS = new Set([
  'rustCompiler',
  'queuedRendering',
  'advancedRouting',
  'logger',
]);

const REMOVED_TRANSITION_EXPORTS = new Set([
  'ViewTransitions',
  'TRANSITION_BEFORE_PREPARATION',
  'TRANSITION_AFTER_PREPARATION',
  'TRANSITION_BEFORE_SWAP',
  'TRANSITION_AFTER_SWAP',
  'TRANSITION_PAGE_LOAD',
  'isTransitionBeforePreparationEvent',
  'isTransitionBeforeSwapEvent',
  'createAnimationScope',
]);

const rule: Rule = {
  id: 'astro-v7-breaking',
  severity: 'error',
  category: 'correctness',
  frameworks: ['astro'],

  check(ast, filePath, sourceLines, context): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const astroVersion = context?.astroVersion ?? 7;
    const isAstroConfig = /astro\.config\.(mjs|ts|mts|js|cjs)$/.test(filePath);

    traverse(ast, (node) => {
      // 1. Astro.glob(...) usage
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Astro' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'glob'
      ) {
        const line = node.loc!.start.line;
        const column = node.loc!.start.column;
        const severity = astroVersion >= 6 ? 'error' : 'warning';

        diagnostics.push({
          ruleId: 'astro-v7-breaking',
          severity,
          category: 'correctness',
          confidence: 0.98,
          message:
            astroVersion >= 6
              ? `Astro.glob() was removed in Astro 6 (project target: Astro ${astroVersion}) — use getCollection() or import.meta.glob()`
              : 'Astro.glob() is deprecated in Astro 5 and removed in Astro 6+ — migrate to getCollection() or import.meta.glob()',
          component: detectComponent(node),
          filePath,
          line,
          column,
          codeSnippet: getCodeSnippet(sourceLines, line),
          fix: `// Option 1: Content Layer API (recommended for Markdown/MDX/JSON):
import { getCollection } from 'astro:content';
const posts = await getCollection('blog');

// Option 2: Vite import.meta.glob (for raw component/file imports):
const pages = Object.values(import.meta.glob('./posts/*.md', { eager: true }));`,
          suggestions: [
            'Astro 6+ completely removed Astro.glob() in favor of the Content Layer API',
            'Use import.meta.glob(..., { eager: true }) for non-collection local files',
          ],
        });
      }

      // 2. Imports from 'astro:transitions' (ViewTransitions & removed v7 transition internals)
      if (
        node.type === 'ImportDeclaration' &&
        node.source.value === 'astro:transitions'
      ) {
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier' && spec.imported.type === 'Identifier') {
            const importedName = spec.imported.name;
            if (REMOVED_TRANSITION_EXPORTS.has(importedName)) {
              const line = spec.loc!.start.line;
              const column = spec.loc!.start.column;
              const isViewTransitions = importedName === 'ViewTransitions';
              const severity = astroVersion >= 6 ? 'error' : 'warning';

              diagnostics.push({
                ruleId: 'astro-v7-breaking',
                severity,
                category: 'correctness',
                confidence: 0.95,
                message: isViewTransitions
                  ? `<ViewTransitions /> was replaced by <ClientRouter /> in Astro 6+ (project target: Astro ${astroVersion})`
                  : `"${importedName}" from astro:transitions was removed in Astro 7 — use standard lifecycle event names`,
                component: detectComponent(node),
                filePath,
                line,
                column,
                codeSnippet: getCodeSnippet(sourceLines, line),
                fix: isViewTransitions
                  ? `---
import { ClientRouter } from 'astro:transitions';
---
<head>
  <ClientRouter />
</head>`
                  : `// Use standard lifecycle event strings directly:
document.addEventListener('astro:before-swap', (event) => {
  // handle swap
});`,
                suggestions: [
                  'Rename <ViewTransitions /> to <ClientRouter /> in your layout <head>',
                  'Astro 7 removed low-level transition constants in favor of standard event listeners',
                ],
              });
            }
          }
        }
      }

      // 3. `astro:db` or `@astrojs/db` imports (removed in Astro 7)
      if (
        node.type === 'ImportDeclaration' &&
        (node.source.value === 'astro:db' || node.source.value === '@astrojs/db')
      ) {
        if (astroVersion >= 6) {
          const line = node.loc!.start.line;
          const column = node.loc!.start.column;
          const severity = astroVersion >= 7 ? 'error' : 'warning';

          diagnostics.push({
            ruleId: 'astro-v7-breaking',
            severity,
            category: 'correctness',
            confidence: 0.95,
            message:
              astroVersion >= 7
                ? `${node.source.value} (@astrojs/db) was removed in Astro 7 — migrate to Drizzle ORM or node:sqlite`
                : `${node.source.value} (@astrojs/db) is deprecated in Astro 6 and removed in Astro 7`,
            component: detectComponent(node),
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `// Migrate from astro:db to Drizzle ORM + libSQL / node:sqlite:
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const client = createClient({ url: import.meta.env.DATABASE_URL });
export const db = drizzle(client);`,
            suggestions: [
              'Astro 7 removed @astrojs/db and astro db CLI commands',
              'Since Astro 6+ requires Node 22+, you can also use built-in node:sqlite or Drizzle ORM directly',
            ],
          });
        }
      }

      // 4. Obsolete `experimental.*` and `legacy.collections` flags in `astro.config.*`
      if (
        isAstroConfig &&
        node.type === 'Property' &&
        node.key.type === 'Identifier'
      ) {
        if (
          node.key.name === 'experimental' &&
          node.value.type === 'ObjectExpression' &&
          astroVersion >= 6
        ) {
          for (const prop of node.value.properties) {
            if (
              prop.type === 'Property' &&
              prop.key.type === 'Identifier' &&
              REMOVED_V7_EXPERIMENTAL_FLAGS.has(prop.key.name)
            ) {
              const flagName = prop.key.name;
              const line = prop.loc!.start.line;
              const column = prop.loc!.start.column;
              const severity = astroVersion >= 7 ? 'error' : 'warning';

              diagnostics.push({
                ruleId: 'astro-v7-breaking',
                severity,
                category: 'correctness',
                confidence: 0.95,
                message:
                  astroVersion >= 7
                    ? `experimental.${flagName} was promoted/removed in Astro 7 — remove it from astro.config`
                    : `experimental.${flagName} becomes a stable default in Astro 7`,
                component: 'astro.config',
                filePath,
                line,
                column,
                codeSnippet: getCodeSnippet(sourceLines, line),
                fix:
                  flagName === 'logger'
                    ? `// Move logger to the top-level defineConfig({ ... }):
export default defineConfig({
  logger: { /* ... */ },
});`
                    : `// Remove experimental.${flagName} — it is enabled by default in Astro 7:
export default defineConfig({
  // experimental.${flagName} is now the default behavior
});`,
                suggestions: [
                  'Astro 7 uses the Rust compiler, queued rendering, and advanced routing by default',
                  'Keeping promoted experimental flags in astro.config causes validation errors in Astro 7',
                ],
              });
            }
          }
        }

        if (
          node.key.name === 'legacy' &&
          node.value.type === 'ObjectExpression'
        ) {
          for (const prop of node.value.properties) {
            if (
              prop.type === 'Property' &&
              prop.key.type === 'Identifier' &&
              prop.key.name === 'collections'
            ) {
              const line = prop.loc!.start.line;
              const column = prop.loc!.start.column;
              const severity = astroVersion >= 6 ? 'error' : 'warning';

              diagnostics.push({
                ruleId: 'astro-v7-breaking',
                severity,
                category: 'correctness',
                confidence: 0.95,
                message:
                  astroVersion >= 6
                    ? 'legacy.collections was removed in Astro 6+ — migrate to the Content Layer API'
                    : 'legacy.collections is deprecated in Astro 5 and removed in Astro 6+',
                component: 'astro.config',
                filePath,
                line,
                column,
                codeSnippet: getCodeSnippet(sourceLines, line),
                fix: `// Move your config to src/content.config.ts and use a loader:
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/data/blog' }),
  schema: z.object({ title: z.string() }),
});

export const collections = { blog };`,
                suggestions: [
                  'Remove legacy: { collections: true } from astro.config',
                  'Use src/content.config.ts with glob() or file() loaders from astro/loaders',
                ],
              });
            }
          }
        }
      }
    });

    return diagnostics;
  },
};

export default rule;

