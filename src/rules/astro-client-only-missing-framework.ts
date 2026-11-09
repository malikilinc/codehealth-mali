import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { detectComponent, getCodeSnippet } from '../component-detector';
import { traverse } from '../traverse';
import type { Diagnostic, Rule } from './types';

function hasNonEmptyFrameworkValue(attr: TSESTree.JSXAttribute): boolean {
  if (!attr.value) return false;
  if (attr.value.type === 'Literal' && typeof attr.value.value === 'string') {
    return attr.value.value.trim().length > 0;
  }
  if (
    attr.value.type === 'JSXExpressionContainer' &&
    attr.value.expression.type === 'Literal' &&
    typeof attr.value.expression.value === 'string'
  ) {
    return attr.value.expression.value.trim().length > 0;
  }
  return false;
}

const rule: Rule = {
  id: 'astro-client-only-missing-framework',
  severity: 'error',
  category: 'correctness',
  frameworks: ['astro'],

  check(ast, filePath, sourceLines): Diagnostic[] {
    if (!filePath.endsWith('.astro')) return [];
    const diagnostics: Diagnostic[] = [];

    traverse(ast, (node) => {
      if (node.type !== 'JSXOpeningElement') return;

      const tagName =
        node.name.type === 'JSXIdentifier' ? node.name.name : 'Component';

      for (const attr of node.attributes) {
        if (
          attr.type === 'JSXAttribute' &&
          attr.name.type === 'JSXNamespacedName' &&
          attr.name.namespace.name === 'client' &&
          attr.name.name.name === 'only'
        ) {
          if (hasNonEmptyFrameworkValue(attr)) continue;

          const line = attr.loc?.start.line ?? node.loc!.start.line;
          const column = attr.loc?.start.column ?? node.loc!.start.column;
          const component = detectComponent(node);

          diagnostics.push({
            ruleId: 'astro-client-only-missing-framework',
            severity: 'error',
            category: 'correctness',
            confidence: 1.0,
            message: `client:only on <${tagName}> requires an explicit framework name (e.g. client:only="react")`,
            component,
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `<!-- Pass the UI framework name to client:only: -->
<${tagName} client:only="react" />

<!-- Supported values: "react" | "preact" | "solid-js" | "svelte" | "vue" -->`,
            suggestions: [
              'Because client:only skips server rendering, Astro cannot auto-detect which UI renderer to bundle without the framework hint',
            ],
          });
        }
      }
    });

    return diagnostics;
  },
};

export default rule;

