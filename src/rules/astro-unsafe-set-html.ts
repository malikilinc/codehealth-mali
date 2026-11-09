import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { detectComponent, getCodeSnippet } from '../component-detector';
import { traverse } from '../traverse';
import type { Diagnostic, Rule } from './types';

function isStaticStringExpression(attr: TSESTree.JSXAttribute): boolean {
  if (!attr.value) return true;
  if (attr.value.type === 'Literal' && typeof attr.value.value === 'string') {
    return true;
  }
  if (
    attr.value.type === 'JSXExpressionContainer' &&
    attr.value.expression.type === 'Literal' &&
    typeof attr.value.expression.value === 'string'
  ) {
    return true;
  }
  return false;
}

const rule: Rule = {
  id: 'astro-unsafe-set-html',
  severity: 'warning',
  category: 'best-practice',
  frameworks: ['astro'],

  check(ast, filePath, sourceLines): Diagnostic[] {
    if (!filePath.endsWith('.astro')) return [];
    const diagnostics: Diagnostic[] = [];

    traverse(ast, (node) => {
      if (node.type !== 'JSXOpeningElement') return;

      for (const attr of node.attributes) {
        if (
          attr.type === 'JSXAttribute' &&
          attr.name.type === 'JSXNamespacedName' &&
          attr.name.namespace.name === 'set' &&
          attr.name.name.name === 'html'
        ) {
          if (isStaticStringExpression(attr)) continue;

          const line = attr.loc?.start.line ?? node.loc!.start.line;
          const column = attr.loc?.start.column ?? node.loc!.start.column;
          const component = detectComponent(node);

          diagnostics.push({
            ruleId: 'astro-unsafe-set-html',
            severity: 'warning',
            category: 'best-practice',
            confidence: 0.80,
            message: 'set:html used with a dynamic expression — ensure HTML is sanitized to prevent XSS',
            component,
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `---
import sanitizeHtml from 'sanitize-html';
const safeHtml = sanitizeHtml(rawHtml);
---
<div set:html={safeHtml} />

<!-- Or for plain text content, use standard JSX expression or set:text: -->
<div set:text={plainText} />`,
            suggestions: [
              'Astro does not automatically sanitize expressions passed to set:html',
              'For Markdown content from Content Collections, prefer the <Content /> component returned by render(entry)',
            ],
          });
        }
      }
    });

    return diagnostics;
  },
};

export default rule;

