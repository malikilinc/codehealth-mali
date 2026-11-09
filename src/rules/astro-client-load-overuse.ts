import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { detectComponent, getCodeSnippet } from '../component-detector';
import { traverse } from '../traverse';
import type { Diagnostic, Rule } from './types';

const rule: Rule = {
  id: 'astro-client-load-overuse',
  severity: 'warning',
  category: 'performance',
  frameworks: ['astro'],

  check(ast, filePath, sourceLines): Diagnostic[] {
    if (!filePath.endsWith('.astro')) return [];
    const diagnostics: Diagnostic[] = [];

    traverse(ast, (node) => {
      if (node.type !== 'JSXOpeningElement') return;
      if (node.name.type !== 'JSXIdentifier') return;

      const tagName = node.name.name;
      // Only check PascalCase components (HTML elements are handled by astro-client-directive-on-html)
      if (!/^[A-Z]/.test(tagName)) return;

      for (const attr of node.attributes) {
        if (
          attr.type === 'JSXAttribute' &&
          attr.name.type === 'JSXNamespacedName' &&
          attr.name.namespace.name === 'client' &&
          attr.name.name.name === 'load'
        ) {
          const line = attr.loc?.start.line ?? node.loc!.start.line;
          const column = attr.loc?.start.column ?? node.loc!.start.column;
          const component = detectComponent(node);

          diagnostics.push({
            ruleId: 'astro-client-load-overuse',
            severity: 'warning',
            category: 'performance',
            confidence: 0.75,
            message: `client:load on <${tagName}> hydrates immediately and blocks main thread — prefer client:visible or client:idle`,
            component,
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `<!-- For below-the-fold components (hydrates when scrolled into view): -->
<${tagName} client:visible />

<!-- For non-critical interactive UI (hydrates during browser idle time): -->
<${tagName} client:idle />`,
            suggestions: [
              'Reserve client:load strictly for above-the-fold controls that must respond within the first millisecond',
              'Switching to client:visible or client:idle improves Total Blocking Time (TBT) and LCP',
            ],
          });
        }
      }
    });

    return diagnostics;
  },
};

export default rule;

