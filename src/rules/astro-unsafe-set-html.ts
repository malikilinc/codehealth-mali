import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { detectComponent, getCodeSnippet } from '../component-detector';
import { traverse } from '../traverse';
import type { Diagnostic, Rule } from './types';

const SAFE_DATA_SCRIPT_TYPES = new Set([
  'application/ld+json',
  'application/json',
  'importmap',
  'speculationrules',
]);

function isJsonStringifyExpression(expr: TSESTree.Expression | TSESTree.JSXEmptyExpression): boolean {
  if (expr.type !== 'CallExpression') return false;
  const { callee } = expr;

  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'JSON' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'stringify'
  ) {
    return true;
  }

  // Also allow JSON.stringify(...).replace(...)
  if (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'replace' &&
    callee.object.type === 'CallExpression'
  ) {
    return isJsonStringifyExpression(callee.object);
  }

  return false;
}

function isSafeSetHtmlAttribute(
  attr: TSESTree.JSXAttribute,
  node: TSESTree.JSXOpeningElement
): boolean {
  if (!attr.value) return true;
  if (attr.value.type === 'Literal' && typeof attr.value.value === 'string') {
    return true;
  }
  if (attr.value.type === 'JSXExpressionContainer') {
    const expr = attr.value.expression;
    if (expr.type === 'Literal' && typeof expr.value === 'string') {
      return true;
    }
    if (expr.type === 'TemplateLiteral' && expr.expressions.length === 0) {
      return true;
    }
    if (isJsonStringifyExpression(expr)) {
      return true;
    }
  }

  // Exempt <script type="application/ld+json" set:html={...} />
  if (node.name.type === 'JSXIdentifier' && node.name.name === 'script') {
    for (const a of node.attributes) {
      if (
        a.type === 'JSXAttribute' &&
        a.name.type === 'JSXIdentifier' &&
        a.name.name === 'type'
      ) {
        let typeVal: string | null = null;
        if (a.value?.type === 'Literal' && typeof a.value.value === 'string') {
          typeVal = a.value.value.trim().toLowerCase();
        } else if (
          a.value?.type === 'JSXExpressionContainer' &&
          a.value.expression.type === 'Literal' &&
          typeof a.value.expression.value === 'string'
        ) {
          typeVal = a.value.expression.value.trim().toLowerCase();
        }
        if (typeVal && SAFE_DATA_SCRIPT_TYPES.has(typeVal)) {
          return true;
        }
      }
    }
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
          if (isSafeSetHtmlAttribute(attr, node)) continue;

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

