import { parse, AST_NODE_TYPES } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

interface AstroZones {
  frontmatterSource: string | null;
  frontmatterStartLine: number;
  frontmatterEndLine: number;
  scriptBlocks: { source: string; startLine: number }[];
  templateSource: string;
}

/**
 * Replaces characters in a slice with spaces while preserving all newline characters (`\n`),
 * ensuring line numbers and column offsets after the slice remain 100% identical.
 */
function maskPreservingNewlines(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

/**
 * Self-closes HTML void elements (<img ...>, <input ...>, <meta ...>, etc.)
 * while respecting JSX expressions `{...}` and quoted strings so `>` inside expressions is untouched.
 */
function normalizeVoidTagsAndShorthands(template: string): string {
  const voidTagRegex = /<([a-zA-Z][a-zA-Z0-9:-]*)\b/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = voidTagRegex.exec(template)) !== null) {
    const tagStart = match.index;
    const tagName = match[1].toLowerCase();

    // Find the end of this opening tag, respecting quotes and { ... } brace depth
    let i = tagStart + match[0].length;
    let braceDepth = 0;
    let quote: string | null = null;
    let tagEnd = -1;

    while (i < template.length) {
      const ch = template[i];
      if (quote) {
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
      } else {
        if (ch === '"' || ch === "'" || ch === '`') {
          quote = ch;
        } else if (ch === '{') {
          braceDepth++;
        } else if (ch === '}') {
          if (braceDepth > 0) braceDepth--;
        } else if (ch === '>' && braceDepth === 0) {
          tagEnd = i;
          break;
        }
      }
      i++;
    }

    if (tagEnd === -1) continue;

    result += template.slice(lastIndex, tagStart);
    let rawTag = template.slice(tagStart, tagEnd + 1);

    // Convert Astro attribute shorthand `{id}` -> `id={id}` (only top-level attribute shorthands)
    rawTag = rawTag.replace(
      /(\s)\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}(?=[\s/>])/g,
      '$1$2={$2}'
    );

    if (VOID_TAGS.has(tagName) && !rawTag.endsWith('/>')) {
      rawTag = rawTag.slice(0, -1) + '/>';
    }

    result += rawTag;
    lastIndex = tagEnd + 1;
    voidTagRegex.lastIndex = lastIndex;
  }

  result += template.slice(lastIndex);
  return result;
}

/**
 * Splits an `.astro` file into:
 * 1) Frontmatter TypeScript zone (line-aligned)
 * 2) Client `<script>` TypeScript zones (line-aligned)
 * 3) Template JSX/HTML zone (line-aligned)
 */
function extractAstroZones(source: string): AstroZones {
  const lines = source.split('\n');
  let frontmatterStartLine = -1;
  let frontmatterEndLine = -1;

  // Check if file starts with frontmatter fence `---` (allowing leading empty lines/BOM)
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].replace(/^\uFEFF/, '').trim();
    if (trimmed === '') continue;
    if (/^---+$/.test(trimmed)) {
      frontmatterStartLine = i;
    }
    break;
  }

  if (frontmatterStartLine !== -1) {
    for (let i = frontmatterStartLine + 1; i < lines.length; i++) {
      if (/^---+\s*$/.test(lines[i])) {
        frontmatterEndLine = i;
        break;
      }
    }
  }

  let frontmatterSource: string | null = null;
  if (frontmatterStartLine !== -1 && frontmatterEndLine !== -1) {
    const fmLines = lines.map((line, idx) => {
      if (idx > frontmatterStartLine && idx < frontmatterEndLine) {
        return line;
      }
      return '';
    });
    frontmatterSource = fmLines.join('\n');
  }

  // Build template string with frontmatter masked out
  const templateLines = lines.map((line, idx) => {
    if (
      frontmatterStartLine !== -1 &&
      frontmatterEndLine !== -1 &&
      idx <= frontmatterEndLine
    ) {
      return '';
    }
    return line;
  });

  let templateRaw = templateLines.join('\n');
  const scriptBlocks: { source: string; startLine: number }[] = [];

  // Mask `<style ...>...</style>` inner content while keeping `<style ...></style>` tags
  templateRaw = templateRaw.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_full, openTag: string, content: string, closeTag: string) => {
      return openTag + maskPreservingNewlines(content) + closeTag;
    }
  );

  // Extract `<script ...>...</script>` inner content for TS AST parsing, and mask inner content in template
  templateRaw = templateRaw.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (fullMatch, openTag: string, content: string, closeTag: string, offset: number) => {
      const isJsonScript =
        /\btype\s*=\s*["'](?:application\/(?:ld\+)?json|importmap)["']/i.test(openTag);

      if (!isJsonScript && content.trim().length > 0) {
        const prefix = templateRaw.slice(0, offset + openTag.length);
        const lineOffset = prefix.split('\n').length;
        const lastNewlineIdx = prefix.lastIndexOf('\n');
        const colOffset =
          lastNewlineIdx === -1 ? prefix.length : prefix.length - lastNewlineIdx - 1;

        const alignedScript =
          '\n'.repeat(Math.max(0, lineOffset - 1)) +
          ' '.repeat(Math.max(0, colOffset)) +
          content;

        scriptBlocks.push({
          source: alignedScript,
          startLine: lineOffset,
        });
      }

      void fullMatch;
      return openTag + maskPreservingNewlines(content) + closeTag;
    }
  );

  // Mask `<!DOCTYPE ...>` and `<!-- ... -->` comments preserving newlines
  templateRaw = templateRaw.replace(/<!DOCTYPE[^>]*>/gi, (m) => maskPreservingNewlines(m));
  templateRaw = templateRaw.replace(/<!--[\s\S]*?-->/g, (m) => maskPreservingNewlines(m));

  const templateSource = normalizeVoidTagsAndShorthands(templateRaw);

  return {
    frontmatterSource,
    frontmatterStartLine,
    frontmatterEndLine,
    scriptBlocks,
    templateSource,
  };
}

function parseTypeScriptZone(
  code: string,
  allowTopLevelReturn: boolean
): TSESTree.Program | null {
  try {
    return parse(code, {
      jsx: true,
      loc: true,
      range: true,
      comment: false,
      tokens: false,
    });
  } catch (err: unknown) {
    if (allowTopLevelReturn) {
      // Astro frontmatter allows top-level `return Astro.redirect(...)`.
      // Wrap in an async function without shifting line numbers!
      try {
        const wrapped = `async function __astro_fm__() {${code}\n}`;
        return parse(wrapped, {
          jsx: true,
          loc: true,
          range: true,
          comment: false,
          tokens: false,
        });
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Fallback parser for templates with non-JSX HTML quirks (like unclosed `<p>` or `<li>` tags).
 * Extracts every opening tag `<Tag ...>` and `{expression}` with exact line numbers so
 * AST rules still inspect every element and expression without emitting a false parse-error.
 */
function parseTemplateElementsFallback(templateSource: string): TSESTree.Statement[] {
  const statements: TSESTree.Statement[] = [];
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9:._-]*)\b/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(templateSource)) !== null) {
    const startIdx = match.index;
    const tagName = match[1];
    let i = startIdx + match[0].length;
    let braceDepth = 0;
    let quote: string | null = null;
    let endIdx = -1;

    while (i < templateSource.length) {
      const ch = templateSource[i];
      if (quote) {
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
      } else {
        if (ch === '"' || ch === "'" || ch === '`') quote = ch;
        else if (ch === '{') braceDepth++;
        else if (ch === '}') {
          if (braceDepth > 0) braceDepth--;
        } else if (ch === '>' && braceDepth === 0) {
          endIdx = i;
          break;
        }
      }
      i++;
    }

    if (endIdx === -1) continue;

    const prefix = templateSource.slice(0, startIdx);
    const lineNum = prefix.split('\n').length;
    const lastNl = prefix.lastIndexOf('\n');
    const colNum = lastNl === -1 ? prefix.length : prefix.length - lastNl - 1;

    let rawOpening = templateSource.slice(startIdx, endIdx + 1);
    if (!rawOpening.endsWith('/>')) {
      rawOpening = rawOpening.slice(0, -1) + '/>';
    } else if (tagName.includes(':')) {
      // keep as self-closing
    }

    const padded =
      '\n'.repeat(Math.max(0, lineNum - 1)) +
      ' '.repeat(Math.max(0, colNum)) +
      rawOpening;

    try {
      const ast = parse(padded, {
        jsx: true,
        loc: true,
        range: true,
        comment: false,
        tokens: false,
      });
      statements.push(...ast.body);
    } catch {
      // ignore individual malformed tag
    }

    tagRegex.lastIndex = endIdx + 1;
  }

  return statements;
}

export function parseAstroSource(source: string): TSESTree.Program {
  const sourceLines = source.split('\n');
  const {
    frontmatterSource,
    scriptBlocks,
    templateSource,
  } = extractAstroZones(source);

  const combinedBody: TSESTree.ProgramStatement[] = [];

  // 1. Parse Frontmatter Zone
  if (frontmatterSource && frontmatterSource.trim().length > 0) {
    const fmAst = parseTypeScriptZone(frontmatterSource, true);
    if (fmAst) {
      combinedBody.push(...fmAst.body);
    }
  }

  // 2. Parse Template Zone (wrapped in a JSX fragment on the same line offsets)
  if (templateSource.trim().length > 0) {
    const wrappedTemplate = `<>` + templateSource + `</>`;
    try {
      const tplAst = parse(wrappedTemplate, {
        jsx: true,
        loc: true,
        range: true,
        comment: false,
        tokens: false,
      });
      combinedBody.push(...tplAst.body);
    } catch {
      // Fallback: parse individual tags/directives at exact line offsets
      const fallbackStmts = parseTemplateElementsFallback(templateSource);
      combinedBody.push(...fallbackStmts);
    }
  }

  // 3. Parse Client `<script>` Zones
  for (const block of scriptBlocks) {
    const scriptAst = parseTypeScriptZone(block.source, false);
    if (scriptAst) {
      combinedBody.push(...scriptAst.body);
    }
  }

  return {
    type: AST_NODE_TYPES.Program,
    body: combinedBody,
    sourceType: 'module',
    range: [0, source.length],
    loc: {
      start: { line: 1, column: 0 },
      end: {
        line: sourceLines.length,
        column: sourceLines[sourceLines.length - 1]?.length ?? 0,
      },
    },
  };
}
