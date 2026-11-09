import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { detectComponent, getCodeSnippet } from '../component-detector';
import { traverse } from '../traverse';
import type { Diagnostic, Rule } from './types';

const CLIENT_DIRECTIVES = new Set(['load', 'idle', 'visible', 'media', 'only']);

function getClientDirectiveName(attr: TSESTree.JSXAttribute | TSESTree.JSXSpreadAttribute): string | null {
  if (attr.type !== 'JSXAttribute') return null;
  if (
    attr.name.type === 'JSXNamespacedName' &&
    attr.name.namespace.name === 'client' &&
    CLIENT_DIRECTIVES.has(attr.name.name.name)
  ) {
    return `client:${attr.name.name.name}`;
  }
  return null;
}

const rule: Rule = {
  id: 'astro-client-directive-on-html',
  severity: 'error',
  category: 'correctness',
  frameworks: ['astro'],

  check(ast, filePath, sourceLines): Diagnostic[] {
    if (!filePath.endsWith('.astro')) return [];
    const diagnostics: Diagnostic[] = [];

    traverse(ast, (node) => {
      if (node.type !== 'JSXOpeningElement') return;
      if (node.name.type !== 'JSXIdentifier') return;

      const tagName = node.name.name;
      // Lowercase first letter = native HTML element
      if (!/^[a-z]/.test(tagName)) return;

      for (const attr of node.attributes) {
        const directive = getClientDirectiveName(attr);
        if (!directive) continue;

        const line = attr.loc?.start.line ?? node.loc!.start.line;
        const column = attr.loc?.start.column ?? node.loc!.start.column;
        const component = detectComponent(node);

        diagnostics.push({
          ruleId: 'astro-client-directive-on-html',
          severity: 'error',
          category: 'correctness',
          confidence: 1.0,
          message: `"${directive}" cannot be used on native HTML element <${tagName}> — client directives only work on UI framework components`,
          component,
          filePath,
          line,
          column,
          codeSnippet: getCodeSnippet(sourceLines, line),
          fix: `<!-- Option 1: Use client:* on an imported React/UI component (PascalCase): -->
<InteractiveButton ${directive} />

<!-- Option 2: For native HTML interactivity in .astro, use a standard <script> tag: -->
<${tagName} id="my-element">...</${tagName}>
<script>
  document.getElementById('my-element')?.addEventListener('click', () => {
    // client-side logic
  });
</script>`,
          suggestions: [
            'Astro throws a compiler error when client:* directives are placed on native HTML tags',
            'Move interactive UI into a PascalCase component (.tsx/.jsx) or attach listeners via <script>',
          ],
        });
      }
    });

    return diagnostics;
  },
};

export default rule;

