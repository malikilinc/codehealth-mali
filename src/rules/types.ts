import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { AstroVersion } from '../project-detector';

export type Framework = 'react' | 'next' | 'react-native' | 'expo' | 'astro';

export type Category = 'correctness' | 'performance' | 'best-practice' | 'accessibility';

export interface RuleContext {
  framework?: Framework;
  astroVersion?: AstroVersion;
}

export interface Diagnostic {
  ruleId: string;
  severity: 'error' | 'warning';
  category: Category;
  confidence: number;
  message: string;
  component: string;
  filePath: string;
  line: number;
  column: number;
  codeSnippet: string[];
  fix: string;
  suggestions: string[];
}

export interface Rule {
  id: string;
  severity: 'error' | 'warning';
  category: Category;
  frameworks: Framework[];
  check(
    ast: TSESTree.Program,
    filePath: string,
    sourceLines: string[],
    context?: RuleContext
  ): Diagnostic[];
}
