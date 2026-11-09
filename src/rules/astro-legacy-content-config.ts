import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { getCodeSnippet } from '../component-detector';
import { traverse } from '../traverse';
import type { Diagnostic, Rule } from './types';

function isLegacyContentConfigPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.endsWith('/src/content/config.ts') || normalized.endsWith('/src/content/config.js');
}

function isModernContentConfigPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.endsWith('/src/content.config.ts') || normalized.endsWith('/src/content.config.mjs');
}

const rule: Rule = {
  id: 'astro-legacy-content-config',
  severity: 'warning',
  category: 'best-practice',
  frameworks: ['astro'],

  check(ast, filePath, sourceLines, context): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const astroVersion = context?.astroVersion ?? 7;

    const isLegacyPath = isLegacyContentConfigPath(filePath);
    const isModernPath = isModernContentConfigPath(filePath);

    if (!isLegacyPath && !isModernPath) return diagnostics;

    if (isLegacyPath) {
      const severity = astroVersion >= 6 ? 'error' : 'warning';
      diagnostics.push({
        ruleId: 'astro-legacy-content-config',
        severity,
        category: 'best-practice',
        confidence: 0.95,
        message:
          astroVersion >= 6
            ? `Legacy src/content/config.ts path detected — Astro ${astroVersion} requires src/content.config.ts with Content Layer loaders`
            : 'Legacy src/content/config.ts detected — migrate to src/content.config.ts (Content Layer API)',
        component: 'content-config',
        filePath,
        line: 1,
        column: 0,
        codeSnippet: getCodeSnippet(sourceLines, 1),
        fix: `// 1. Move file from src/content/config.ts -> src/content.config.ts
// 2. Add an explicit loader from 'astro/loaders':
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
  }),
});

export const collections = { blog };`,
        suggestions: [
          'Content Layer API replaces legacy content collections in Astro 6 and Astro 7',
          'Explicit glob() or file() loaders enable up to 5x faster builds and Astro 7 Rust Markdown processing',
        ],
      });
    }

    // Also check if defineCollection({ ... }) is missing `loader` property
    traverse(ast, (node) => {
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'defineCollection' &&
        node.arguments.length > 0 &&
        node.arguments[0].type === 'ObjectExpression'
      ) {
        const obj = node.arguments[0];
        const hasLoader = obj.properties.some(
          (p) =>
            p.type === 'Property' &&
            p.key.type === 'Identifier' &&
            p.key.name === 'loader'
        );

        if (!hasLoader) {
          const line = node.loc!.start.line;
          const column = node.loc!.start.column;
          const severity = astroVersion >= 6 ? 'error' : 'warning';

          diagnostics.push({
            ruleId: 'astro-legacy-content-config',
            severity,
            category: 'best-practice',
            confidence: 0.90,
            message: 'defineCollection() is missing a "loader" — Content Layer API requires glob() or file() loader',
            component: 'content-config',
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const collection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({ /* ... */ }),
});`,
            suggestions: [
              'Import glob or file from "astro/loaders" and specify the loader property',
            ],
          });
        }
      }
    });

    return diagnostics;
  },
};

export default rule;

