import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { detectComponent, getCodeSnippet } from '../component-detector';
import { traverse } from '../traverse';
import type { Diagnostic, Rule } from './types';

function hasSrcAttr(node: TSESTree.JSXOpeningElement): boolean {
  return node.attributes.some(
    (a) =>
      a.type === 'JSXAttribute' &&
      a.name.type === 'JSXIdentifier' &&
      a.name.name === 'src'
  );
}

const rule: Rule = {
  id: 'img-not-optimized',
  severity: 'warning',
  category: 'performance',
  frameworks: ['next', 'astro'],

  check(ast, filePath, sourceLines, context): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const isAstro = context?.framework === 'astro' || filePath.endsWith('.astro');

    traverse(ast, (node) => {
      if (
        node.type === 'JSXOpeningElement' &&
        node.name.type === 'JSXIdentifier' &&
        node.name.name === 'img'
      ) {
        if (!hasSrcAttr(node)) return;

        const line = node.loc!.start.line;
        const column = node.loc!.start.column;
        const component = detectComponent(node);

        if (isAstro) {
          diagnostics.push({
            ruleId: 'img-not-optimized',
            severity: 'warning',
            category: 'performance',
            confidence: 0.85,
            message: '<img> tag used — use Astro <Image /> from astro:assets for automatic optimization',
            component,
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `---
import { Image } from 'astro:assets';
import myImage from '../assets/my-image.png';
---

<!-- Local asset (width/height inferred automatically): -->
<Image src={myImage} alt="Descriptive alt text" />

<!-- Remote or public/ image (explicit dimensions required): -->
<Image
  src="/your-image.png"
  alt="Descriptive alt text"
  width={800}
  height={600}
/>`,
            suggestions: [
              'Astro <Image /> from astro:assets optimizes formats (AVIF/WebP), resizes, and prevents CLS',
              'Inside React (.tsx) islands, pass optimized image metadata from Astro frontmatter via getImage()',
            ],
          });
        } else {
          diagnostics.push({
            ruleId: 'img-not-optimized',
            severity: 'warning',
            category: 'performance',
            confidence: 0.85,
            message: '<img> tag used — use Next.js <Image> for automatic optimization',
            component,
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `import Image from 'next/image';

// Replace <img> with <Image>:
<Image
  src="/your-image.png"
  alt="Descriptive alt text"
  width={800}
  height={600}
/>

// For images with unknown dimensions, use fill:
<div style={{ position: 'relative', width: '100%', height: 300 }}>
  <Image src="/your-image.png" alt="..." fill style={{ objectFit: 'cover' }} />
</div>`,
            suggestions: [
              'Next.js <Image> provides automatic WebP conversion, lazy loading, and size optimization',
              'Add width and height to prevent layout shift (CLS)',
            ],
          });
        }
      }
    });

    return diagnostics;
  },
};

export default rule;
