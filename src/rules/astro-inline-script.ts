import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { detectComponent, getCodeSnippet } from '../component-detector';
import { traverse } from '../traverse';
import type { Diagnostic, Rule } from './types';

function hasDefineVarsOrExternalSrc(
  attrs: (TSESTree.JSXAttribute | TSESTree.JSXSpreadAttribute)[]
): boolean {
  return attrs.some((a) => {
    if (a.type !== 'JSXAttribute') return false;
    if (
      a.name.type === 'JSXNamespacedName' &&
      a.name.namespace.name === 'define' &&
      a.name.name.name === 'vars'
    ) {
      return true;
    }
    if (a.name.type === 'JSXIdentifier' && a.name.name === 'src') {
      return true;
    }
    return false;
  });
}

const rule: Rule = {
  id: 'astro-inline-script',
  severity: 'warning',
  category: 'performance',
  frameworks: ['astro'],

  check(ast, filePath, sourceLines): Diagnostic[] {
    if (!filePath.endsWith('.astro')) return [];
    const diagnostics: Diagnostic[] = [];

    traverse(ast, (node) => {
      if (node.type !== 'JSXOpeningElement') return;
      if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'script') return;

      if (hasDefineVarsOrExternalSrc(node.attributes)) return;

      for (const attr of node.attributes) {
        if (
          attr.type === 'JSXAttribute' &&
          attr.name.type === 'JSXNamespacedName' &&
          attr.name.namespace.name === 'is' &&
          attr.name.name.name === 'inline'
        ) {
          const line = attr.loc?.start.line ?? node.loc!.start.line;
          const column = attr.loc?.start.column ?? node.loc!.start.column;
          const component = detectComponent(node);

          diagnostics.push({
            ruleId: 'astro-inline-script',
            severity: 'warning',
            category: 'performance',
            confidence: 0.75,
            message: '<script is:inline> disables Astro bundling, minification, and script deduplication',
            component,
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `<!-- Remove is:inline so Astro bundles, tree-shakes, and deduplicates the script: -->
<script>
  // Runs once per page as a bundled ES module (even if component renders multiple times)
</script>

<!-- If you need frontmatter variables on the client, pass them via data-* attributes: -->
<div id="widget" data-api-url={apiUrl}></div>
<script>
  const url = document.getElementById('widget')?.dataset.apiUrl;
</script>`,
            suggestions: [
              'Standard <script> tags in Astro are automatically bundled, minified, and executed as deferred ES modules',
              'Use is:inline only when a script must execute synchronously in <head> before first paint (e.g. dark mode theme flash prevention)',
            ],
          });
        }
      }
    });

    return diagnostics;
  },
};

export default rule;

