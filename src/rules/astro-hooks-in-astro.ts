import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { detectComponent, getCodeSnippet } from '../component-detector';
import { traverse } from '../traverse';
import type { Diagnostic, Rule } from './types';

const REACT_HOOKS = new Set([
  'useState',
  'useEffect',
  'useReducer',
  'useCallback',
  'useMemo',
  'useRef',
  'useContext',
  'useLayoutEffect',
  'useTransition',
  'useDeferredValue',
  'useId',
]);

function getCalledHookName(node: TSESTree.CallExpression): string | null {
  if (node.callee.type === 'Identifier' && REACT_HOOKS.has(node.callee.name)) {
    return node.callee.name;
  }
  if (
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'React' &&
    node.callee.property.type === 'Identifier' &&
    REACT_HOOKS.has(node.callee.property.name)
  ) {
    return node.callee.property.name;
  }
  return null;
}

const rule: Rule = {
  id: 'astro-hooks-in-astro',
  severity: 'error',
  category: 'correctness',
  frameworks: ['astro'],

  check(ast, filePath, sourceLines): Diagnostic[] {
    if (!filePath.endsWith('.astro')) return [];
    const diagnostics: Diagnostic[] = [];

    traverse(ast, (node) => {
      if (node.type !== 'CallExpression') return;
      const hookName = getCalledHookName(node);
      if (!hookName) return;

      const line = node.loc!.start.line;
      const column = node.loc!.start.column;
      const component = detectComponent(node);

      diagnostics.push({
        ruleId: 'astro-hooks-in-astro',
        severity: 'error',
        category: 'correctness',
        confidence: 0.98,
        message: `${hookName}() cannot be called inside an .astro file — Astro components run only once on the server`,
        component,
        filePath,
        line,
        column,
        codeSnippet: getCodeSnippet(sourceLines, line),
        fix: `// 1. Move stateful hook logic into a React island (e.g. src/components/Counter.tsx):
import { ${hookName} } from 'react';
export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// 2. Render and hydrate the island inside your .astro file:
---
import Counter from '../components/Counter.tsx';
---
<Counter client:visible />`,
        suggestions: [
          '.astro frontmatter runs at build/SSR time and never hydrates on the client',
          'Extract interactive React hooks into a .tsx component and mount it with client:visible or client:idle',
        ],
      });
    });

    return diagnostics;
  },
};

export default rule;

