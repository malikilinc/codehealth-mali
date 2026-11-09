import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { detectComponent, getCodeSnippet } from '../component-detector';
import { traverse } from '../traverse';
import type { Diagnostic, Rule } from './types';

const rule: Rule = {
  id: 'a11y-autofocus',
  severity: 'warning',
  category: 'accessibility',
  frameworks: ['react', 'next', 'astro'],

  check(ast, filePath, sourceLines): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const isAstro = filePath.endsWith('.astro');

    traverse(ast, (node) => {
      if (
        node.type !== 'JSXAttribute' ||
        node.name.type !== 'JSXIdentifier' ||
        (node.name.name !== 'autoFocus' && node.name.name !== 'autofocus')
      ) return;

      if (
        node.value?.type === 'JSXExpressionContainer' &&
        node.value.expression.type === 'Literal' &&
        node.value.expression.value === false
      ) return;

      const line = node.loc!.start.line;
      const column = node.loc!.start.column;
      const component = detectComponent(node);

      diagnostics.push({
        ruleId: 'a11y-autofocus',
        severity: 'warning',
        category: 'accessibility',
        confidence: 0.85,
        message: `${node.name.name} disrupts screen readers and keyboard navigation`,
        component,
        filePath,
        line,
        column,
        codeSnippet: getCodeSnippet(sourceLines, line),
        fix: isAstro
          ? `<!-- Remove autofocus from initial HTML, or focus only when a dialog opens: -->
<dialog id="my-dialog">
  <input id="dialog-input" type="text" />
</dialog>

<script>
  const dialog = document.getElementById('my-dialog');
  dialog?.addEventListener('toggle', () => {
    document.getElementById('dialog-input')?.focus();
  });
</script>`
          : `// Remove autoFocus, or focus programmatically after user action:
const inputRef = useRef<HTMLInputElement>(null);

useEffect(() => {
  // Only focus when modal/dialog opens, not on initial page load
  if (isOpen) inputRef.current?.focus();
}, [isOpen]);

<input ref={inputRef} />`,
        suggestions: [
          'If focusing inside a modal, use the dialog role and manage focus after user interaction',
          'WCAG 2.4.3: Focus order must be logical and predictable',
        ],
      });
    });

    return diagnostics;
  },
};

export default rule;
