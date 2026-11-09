import { TSESTree } from '@typescript-eslint/typescript-estree';

type AstroVersion = 5 | 6 | 7;
interface ProjectContext {
    detectedFramework?: Framework;
    astroVersion: AstroVersion;
    astroVersionDetected: boolean;
    projectRoot: string;
}
declare function parseAstroVersion(raw: string | number | undefined): AstroVersion | undefined;
declare function detectProjectContext(targetPath: string, astroVersionOverride?: AstroVersion): ProjectContext;

type Framework = 'react' | 'next' | 'react-native' | 'expo' | 'astro';
type Category = 'correctness' | 'performance' | 'best-practice' | 'accessibility';
interface RuleContext {
    framework?: Framework;
    astroVersion?: AstroVersion;
}
interface Diagnostic {
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
interface Rule {
    id: string;
    severity: 'error' | 'warning';
    category: Category;
    frameworks: Framework[];
    check(ast: TSESTree.Program, filePath: string, sourceLines: string[], context?: RuleContext): Diagnostic[];
}

interface ScanOptions {
    targetPath: string;
    framework?: Framework;
    astroVersion?: AstroVersion;
    ruleId?: string;
    ignore?: string[];
}
interface ScanResult {
    diagnostics: Diagnostic[];
    totalFiles: number;
    scannedFiles: string[];
    astroVersion?: AstroVersion;
}
declare function scan(options: ScanOptions): Promise<ScanResult>;
declare function scanFile(filePath: string, framework?: Framework, ruleId?: string, astroVersion?: AstroVersion): Promise<Diagnostic[]>;

interface ScoreResult {
    score: number;
    label: string;
    errors: number;
    warnings: number;
    affectedFiles: number;
    totalFiles: number;
    byCategory: Record<Category, number>;
}
declare function computeScore(diagnostics: Diagnostic[], totalFiles: number): ScoreResult;

declare const allRules: Rule[];
declare const ruleMap: Map<string, Rule>;

declare const FRAMEWORK_LABELS: Record<Framework, string>;
declare const FRAMEWORK_DESCRIPTIONS: Record<Framework, string>;
declare function getRulesForFramework(framework: Framework | undefined): Rule[];

export { type AstroVersion, type Category, type Diagnostic, FRAMEWORK_DESCRIPTIONS, FRAMEWORK_LABELS, type Framework, type ProjectContext, type Rule, type RuleContext, type ScanOptions, type ScanResult, type ScoreResult, allRules, computeScore, detectProjectContext, getRulesForFramework, parseAstroVersion, ruleMap, scan, scanFile };
