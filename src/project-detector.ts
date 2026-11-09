import * as fs from 'fs';
import * as path from 'path';
import type { Framework } from './rules/types';

export type AstroVersion = 5 | 6 | 7;

export interface ProjectContext {
  detectedFramework?: Framework;
  astroVersion: AstroVersion;
  astroVersionDetected: boolean;
  projectRoot: string;
}

const ASTRO_CONFIG_FILES = [
  'astro.config.mjs',
  'astro.config.ts',
  'astro.config.mts',
  'astro.config.js',
  'astro.config.cjs',
];

function findProjectRoot(startPath: string): string {
  let current = path.resolve(startPath);
  try {
    const stat = fs.statSync(current);
    if (!stat.isDirectory()) {
      current = path.dirname(current);
    }
  } catch {
    // ignore stat errors
  }

  let dir = current;
  for (let i = 0; i < 5; i++) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) ||
      ASTRO_CONFIG_FILES.some((cfg) => fs.existsSync(path.join(dir, cfg)))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return current;
}

export function parseAstroVersion(raw: string | number | undefined): AstroVersion | undefined {
  if (raw === undefined || raw === null) return undefined;
  const str = String(raw).trim();
  const match = str.match(/(\d+)/);
  if (!match) return undefined;
  const major = parseInt(match[1], 10);
  if (major <= 5) return 5;
  if (major === 6) return 6;
  return 7;
}

export function detectProjectContext(
  targetPath: string,
  astroVersionOverride?: AstroVersion
): ProjectContext {
  const projectRoot = findProjectRoot(targetPath);
  const pkgPath = path.join(projectRoot, 'package.json');

  let detectedFramework: Framework | undefined;
  let astroVersion: AstroVersion = astroVersionOverride ?? 7;
  let astroVersionDetected = Boolean(astroVersionOverride);

  const hasAstroConfig = ASTRO_CONFIG_FILES.some((cfg) =>
    fs.existsSync(path.join(projectRoot, cfg))
  );

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps: Record<string, string> = {
        ...(pkg.devDependencies ?? {}),
        ...(pkg.dependencies ?? {}),
      };

      if ('astro' in deps || hasAstroConfig) {
        detectedFramework = 'astro';
        if (!astroVersionOverride && deps.astro) {
          const parsed = parseAstroVersion(deps.astro);
          if (parsed) {
            astroVersion = parsed;
            astroVersionDetected = true;
          }
        }
      } else if ('expo' in deps) {
        detectedFramework = 'expo';
      } else if ('react-native' in deps) {
        detectedFramework = 'react-native';
      } else if ('next' in deps) {
        detectedFramework = 'next';
      } else if ('react' in deps) {
        detectedFramework = 'react';
      }
    } catch {
      if (hasAstroConfig) {
        detectedFramework = 'astro';
      }
    }
  } else if (hasAstroConfig) {
    detectedFramework = 'astro';
  }

  return {
    detectedFramework,
    astroVersion,
    astroVersionDetected,
    projectRoot,
  };
}

