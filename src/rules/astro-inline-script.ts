import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { detectComponent, getCodeSnippet } from '../component-detector';
import { traverse } from '../traverse';
import type { Diagnostic, Rule } from './types';

const JS_SCRIPT_TYPES = new Set([
  '',
  'module',
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
  'text/partytown',
]);

function getStringAttrValue(attr: TSESTree.JSXAttribute): string | null {
  if (!attr.value) return null;
  if (attr.value.type === 'Literal' && typeof attr.value.value === 'string') {
    return attr.value.value.trim().toLowerCase();
  }
  if (
    attr.value.type === 'JSXExpressionContainer' &&
    attr.value.expression.type === 'Literal' &&
    typeof attr.value.expression.value === 'string'
  ) {
    return attr.value.expression.value.trim().toLowerCase();
  }
  return null;
}

function isExemptInlineScript(
  attrs: (TSESTree.JSXAttribute | TSESTree.JSXSpreadAttribute)[]
): boolean {
  return attrs.some((a) => {
    if (a.type !== 'JSXAttribute') return false;

    // <script define:vars={{ ... }}> requires inline behavior in Astro
    if (
      a.name.type === 'JSXNamespacedName' &&
      a.name.namespace.name === 'define' &&
      a.name.name.name === 'vars'
    ) {
      return true;
    }

    // <script is:inline set:html={...}> or set:text={...} requires is:inline in Astro (e.g. JSON-LD)
    if (
      a.name.type === 'JSXNamespacedName' &&
      a.name.namespace.name === 'set' &&
      (a.name.name.name === 'html' || a.name.name.name === 'text')
    ) {
      return true;
    }

    // External scripts <script is:inline src="..."> cannot be bundled locally
    if (a.name.type === 'JSXIdentifier' && a.name.name === 'src') {
      return true;
    }

    // Non-JS data blocks such as type="application/ld+json", "application/json", "importmap"
    if (a.name.type === 'JSXIdentifier' && a.name.name === 'type') {
      const typeValue = getStringAttrValue(a);
      if (typeValue !== null && !JS_SCRIPT_TYPES.has(typeValue)) {
        return true;
      }
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

      if (isExemptInlineScript(node.attributes)) return;

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

