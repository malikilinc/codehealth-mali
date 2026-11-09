#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/cli.ts
var import_commander = require("commander");
var path5 = __toESM(require("path"));

// src/scanner.ts
var import_fast_glob = __toESM(require("fast-glob"));
var path3 = __toESM(require("path"));

// src/parser.ts
var import_typescript_estree2 = require("@typescript-eslint/typescript-estree");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));

// src/astro-parser.ts
var import_typescript_estree = require("@typescript-eslint/typescript-estree");
var VOID_TAGS = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
function maskPreservingNewlines(text) {
  return text.replace(/[^\n]/g, " ");
}
function normalizeVoidTagsAndShorthands(template) {
  const voidTagRegex = /<([a-zA-Z][a-zA-Z0-9:-]*)\b/g;
  let result = "";
  let lastIndex = 0;
  let match;
  while ((match = voidTagRegex.exec(template)) !== null) {
    const tagStart = match.index;
    const tagName = match[1].toLowerCase();
    let i = tagStart + match[0].length;
    let braceDepth = 0;
    let quote = null;
    let tagEnd = -1;
    while (i < template.length) {
      const ch = template[i];
      if (quote) {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
      } else {
        if (ch === '"' || ch === "'" || ch === "`") {
          quote = ch;
        } else if (ch === "{") {
          braceDepth++;
        } else if (ch === "}") {
          if (braceDepth > 0) braceDepth--;
        } else if (ch === ">" && braceDepth === 0) {
          tagEnd = i;
          break;
        }
      }
      i++;
    }
    if (tagEnd === -1) continue;
    result += template.slice(lastIndex, tagStart);
    let rawTag = template.slice(tagStart, tagEnd + 1);
    rawTag = rawTag.replace(
      /(\s)\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}(?=[\s/>])/g,
      "$1$2={$2}"
    );
    if (VOID_TAGS.has(tagName) && !rawTag.endsWith("/>")) {
      rawTag = rawTag.slice(0, -1) + "/>";
    }
    result += rawTag;
    lastIndex = tagEnd + 1;
    voidTagRegex.lastIndex = lastIndex;
  }
  result += template.slice(lastIndex);
  return result;
}
function extractAstroZones(source) {
  const lines = source.split("\n");
  let frontmatterStartLine = -1;
  let frontmatterEndLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].replace(/^\uFEFF/, "").trim();
    if (trimmed === "") continue;
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
  let frontmatterSource = null;
  if (frontmatterStartLine !== -1 && frontmatterEndLine !== -1) {
    const fmLines = lines.map((line, idx) => {
      if (idx > frontmatterStartLine && idx < frontmatterEndLine) {
        return line;
      }
      return "";
    });
    frontmatterSource = fmLines.join("\n");
  }
  const templateLines = lines.map((line, idx) => {
    if (frontmatterStartLine !== -1 && frontmatterEndLine !== -1 && idx <= frontmatterEndLine) {
      return "";
    }
    return line;
  });
  let templateRaw = templateLines.join("\n");
  const scriptBlocks = [];
  templateRaw = templateRaw.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_full, openTag, content, closeTag) => {
      return openTag + maskPreservingNewlines(content) + closeTag;
    }
  );
  templateRaw = templateRaw.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (fullMatch, openTag, content, closeTag, offset) => {
      const isJsonScript = /\btype\s*=\s*["'](?:application\/(?:ld\+)?json|importmap)["']/i.test(openTag);
      if (!isJsonScript && content.trim().length > 0) {
        const prefix = templateRaw.slice(0, offset + openTag.length);
        const lineOffset = prefix.split("\n").length;
        const lastNewlineIdx = prefix.lastIndexOf("\n");
        const colOffset = lastNewlineIdx === -1 ? prefix.length : prefix.length - lastNewlineIdx - 1;
        const alignedScript = "\n".repeat(Math.max(0, lineOffset - 1)) + " ".repeat(Math.max(0, colOffset)) + content;
        scriptBlocks.push({
          source: alignedScript,
          startLine: lineOffset
        });
      }
      void fullMatch;
      return openTag + maskPreservingNewlines(content) + closeTag;
    }
  );
  templateRaw = templateRaw.replace(/<!DOCTYPE[^>]*>/gi, (m) => maskPreservingNewlines(m));
  templateRaw = templateRaw.replace(/<!--[\s\S]*?-->/g, (m) => maskPreservingNewlines(m));
  const templateSource = normalizeVoidTagsAndShorthands(templateRaw);
  return {
    frontmatterSource,
    frontmatterStartLine,
    frontmatterEndLine,
    scriptBlocks,
    templateSource
  };
}
function parseTypeScriptZone(code, allowTopLevelReturn) {
  try {
    return (0, import_typescript_estree.parse)(code, {
      jsx: true,
      loc: true,
      range: true,
      comment: false,
      tokens: false
    });
  } catch (err) {
    if (allowTopLevelReturn) {
      try {
        const wrapped = `async function __astro_fm__() {${code}
}`;
        return (0, import_typescript_estree.parse)(wrapped, {
          jsx: true,
          loc: true,
          range: true,
          comment: false,
          tokens: false
        });
      } catch {
        return null;
      }
    }
    return null;
  }
}
function parseTemplateElementsFallback(templateSource) {
  const statements = [];
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9:._-]*)\b/g;
  let match;
  while ((match = tagRegex.exec(templateSource)) !== null) {
    const startIdx = match.index;
    const tagName = match[1];
    let i = startIdx + match[0].length;
    let braceDepth = 0;
    let quote = null;
    let endIdx = -1;
    while (i < templateSource.length) {
      const ch = templateSource[i];
      if (quote) {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
      } else {
        if (ch === '"' || ch === "'" || ch === "`") quote = ch;
        else if (ch === "{") braceDepth++;
        else if (ch === "}") {
          if (braceDepth > 0) braceDepth--;
        } else if (ch === ">" && braceDepth === 0) {
          endIdx = i;
          break;
        }
      }
      i++;
    }
    if (endIdx === -1) continue;
    const prefix = templateSource.slice(0, startIdx);
    const lineNum = prefix.split("\n").length;
    const lastNl = prefix.lastIndexOf("\n");
    const colNum = lastNl === -1 ? prefix.length : prefix.length - lastNl - 1;
    let rawOpening = templateSource.slice(startIdx, endIdx + 1);
    if (!rawOpening.endsWith("/>")) {
      rawOpening = rawOpening.slice(0, -1) + "/>";
    } else if (tagName.includes(":")) {
    }
    const padded = "\n".repeat(Math.max(0, lineNum - 1)) + " ".repeat(Math.max(0, colNum)) + rawOpening;
    try {
      const ast = (0, import_typescript_estree.parse)(padded, {
        jsx: true,
        loc: true,
        range: true,
        comment: false,
        tokens: false
      });
      statements.push(...ast.body);
    } catch {
    }
    tagRegex.lastIndex = endIdx + 1;
  }
  return statements;
}
function parseAstroSource(source) {
  const sourceLines = source.split("\n");
  const {
    frontmatterSource,
    scriptBlocks,
    templateSource
  } = extractAstroZones(source);
  const combinedBody = [];
  if (frontmatterSource && frontmatterSource.trim().length > 0) {
    const fmAst = parseTypeScriptZone(frontmatterSource, true);
    if (fmAst) {
      combinedBody.push(...fmAst.body);
    }
  }
  if (templateSource.trim().length > 0) {
    const wrappedTemplate = `<>` + templateSource + `</>`;
    try {
      const tplAst = (0, import_typescript_estree.parse)(wrappedTemplate, {
        jsx: true,
        loc: true,
        range: true,
        comment: false,
        tokens: false
      });
      combinedBody.push(...tplAst.body);
    } catch {
      const fallbackStmts = parseTemplateElementsFallback(templateSource);
      combinedBody.push(...fallbackStmts);
    }
  }
  for (const block of scriptBlocks) {
    const scriptAst = parseTypeScriptZone(block.source, false);
    if (scriptAst) {
      combinedBody.push(...scriptAst.body);
    }
  }
  return {
    type: import_typescript_estree.AST_NODE_TYPES.Program,
    body: combinedBody,
    sourceType: "module",
    range: [0, source.length],
    loc: {
      start: { line: 1, column: 0 },
      end: {
        line: sourceLines.length,
        column: sourceLines[sourceLines.length - 1]?.length ?? 0
      }
    }
  };
}

// src/parser.ts
function isParseFailure(result) {
  return result !== null && "parseError" in result;
}
function parseFile(filePath) {
  try {
    const source = fs.readFileSync(filePath, "utf-8");
    const sourceLines = source.split("\n");
    let ast;
    if (filePath.endsWith(".astro")) {
      ast = parseAstroSource(source);
      const base = path.basename(filePath, ".astro");
      ast.__componentName = base ? `${base}.astro` : "AstroComponent";
    } else {
      ast = (0, import_typescript_estree2.parse)(source, {
        jsx: true,
        loc: true,
        range: true,
        comment: false,
        tokens: false
      });
    }
    addParentRefs(ast);
    return { ast, sourceLines };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lineMatch = msg.match(/\((\d+):/);
    const line = lineMatch ? parseInt(lineMatch[1], 10) : 1;
    return { parseError: { filePath, message: msg, line } };
  }
}
function addParentRefs(ast) {
  (0, import_typescript_estree2.simpleTraverse)(ast, {
    enter(node, parent) {
      if (parent) {
        node.parent = parent;
      }
    }
  });
}

// src/component-detector.ts
function isPascalCase(name) {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}
function getNameFromPattern(pattern) {
  if (pattern.type === "Identifier") {
    return pattern.name;
  }
  return null;
}
function detectComponent(node) {
  let current = node;
  while (current) {
    if (current.type === "FunctionDeclaration" && current.id) {
      const name = current.id.name;
      if (isPascalCase(name)) return name;
    }
    if (current.type === "VariableDeclarator") {
      const name = getNameFromPattern(current.id);
      if (name && isPascalCase(name)) {
        const init = current.init;
        if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
          return name;
        }
      }
    }
    if (current.type === "ExportDefaultDeclaration") {
      const decl = current.declaration;
      if (decl.type === "FunctionDeclaration" || decl.type === "ArrowFunctionExpression" || decl.type === "FunctionExpression") {
        if (decl.type === "FunctionDeclaration" && decl.id) {
          return decl.id.name;
        }
        return "DefaultExport";
      }
    }
    if (current.type === "Program") {
      const astroName = current.__componentName;
      if (astroName) return astroName;
    }
    current = current.parent;
  }
  return "unknown";
}
function getCodeSnippet(sourceLines, line) {
  const start = Math.max(0, line - 3);
  const end = Math.min(sourceLines.length - 1, line + 1);
  const snippet = [];
  for (let i = start; i <= end; i++) {
    const lineNum = i + 1;
    const prefix = lineNum === line ? "\u25B6" : " ";
    snippet.push(`${prefix} ${String(lineNum).padStart(3)} \u2502  ${sourceLines[i]}`);
  }
  return snippet;
}

// src/traverse.ts
var SKIP_KEYS = /* @__PURE__ */ new Set(["parent", "loc", "range", "tokens", "comments"]);
function traverse(node, visitor) {
  visitor(node);
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c && typeof c === "object" && "type" in c) {
          traverse(c, visitor);
        }
      }
    } else if (child && typeof child === "object" && "type" in child) {
      traverse(child, visitor);
    }
  }
}

// src/rules/fetch-in-effect.ts
function isUseEffectCall(node) {
  return node.callee.type === "Identifier" && node.callee.name === "useEffect";
}
var rule = {
  id: "fetch-in-effect",
  severity: "error",
  category: "correctness",
  frameworks: ["react", "next", "react-native", "expo", "astro"],
  check(ast, filePath, sourceLines) {
    if (filePath.endsWith(".astro")) return [];
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type === "CallExpression" && isUseEffectCall(node)) {
        const callback = node.arguments[0];
        if (!callback) return;
        traverse(callback, (child) => {
          if (child.type !== "CallExpression") return;
          const callee = child.callee;
          const isBareCall = callee.type === "Identifier" && callee.name === "fetch";
          const isQualifiedCall = callee.type === "MemberExpression" && callee.object.type === "Identifier" && (callee.object.name === "window" || callee.object.name === "globalThis") && callee.property.type === "Identifier" && callee.property.name === "fetch";
          if (isBareCall || isQualifiedCall) {
            const line = child.loc.start.line;
            const column = child.loc.start.column;
            const component = detectComponent(child);
            diagnostics.push({
              ruleId: "fetch-in-effect",
              severity: "error",
              category: "correctness",
              confidence: 0.95,
              message: "fetch() inside useEffect \u2014 use a data fetching library instead",
              component,
              filePath,
              line,
              column,
              codeSnippet: getCodeSnippet(sourceLines, line),
              fix: `const { data, isLoading } = useQuery({
  queryKey: ['your-key'],
  queryFn: () => fetch('/api/endpoint').then(r => r.json())
});`,
              suggestions: [
                "TanStack Query (react-query) handles caching, deduplication, and background refetching",
                "SWR is a lighter alternative: const { data } = useSWR(key, fetcher)",
                "Race conditions in useEffect fetches are hard to handle \u2014 libraries do this for you"
              ]
            });
          }
        });
      }
    });
    return diagnostics;
  }
};
var fetch_in_effect_default = rule;

// src/rules/multiple-usestate.ts
var THRESHOLD = 5;
var FORM_NAME_RE = /Form|Dialog|Modal|Sheet|Drawer/;
function isUseStateCall(node) {
  if (node.callee.type === "Identifier" && node.callee.name === "useState") return true;
  if (node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier" && node.callee.object.name === "React" && node.callee.property.type === "Identifier" && node.callee.property.name === "useState") return true;
  return false;
}
function isFunctionNode(node) {
  return node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
}
var rule2 = {
  id: "multiple-usestate",
  severity: "warning",
  category: "best-practice",
  frameworks: ["react", "next", "react-native", "expo", "astro"],
  check(ast, filePath, sourceLines) {
    if (filePath.endsWith(".astro")) return [];
    const diagnostics = [];
    const visited = /* @__PURE__ */ new Set();
    traverse(ast, (node) => {
      if (!isFunctionNode(node) || visited.has(node)) return;
      visited.add(node);
      const useStateCalls = [];
      function collectDirect(n, isRoot) {
        if (!isRoot && isFunctionNode(n)) return;
        if (n.type === "CallExpression" && isUseStateCall(n)) {
          useStateCalls.push(n);
        }
        for (const key of Object.keys(n)) {
          if (key === "parent" || key === "loc" || key === "range") continue;
          const child = n[key];
          if (Array.isArray(child)) {
            for (const c of child) {
              if (c && typeof c === "object" && "type" in c) collectDirect(c, false);
            }
          } else if (child && typeof child === "object" && "type" in child) {
            collectDirect(child, false);
          }
        }
      }
      collectDirect(node, true);
      if (useStateCalls.length <= THRESHOLD) return;
      const firstCall = useStateCalls[0];
      const line = firstCall.loc.start.line;
      const column = firstCall.loc.start.column;
      const component = detectComponent(firstCall);
      const isFormComponent = FORM_NAME_RE.test(component);
      const confidence = isFormComponent ? 0.55 : 0.7;
      diagnostics.push({
        ruleId: "multiple-usestate",
        severity: "warning",
        category: "best-practice",
        confidence,
        message: `${useStateCalls.length} useState calls in ${component} \u2014 consider useReducer or a state object`,
        component,
        filePath,
        line,
        column,
        codeSnippet: getCodeSnippet(sourceLines, line),
        fix: `const [state, dispatch] = useReducer(reducer, initialState);
// Or group related state:
const [formState, setFormState] = useState({
  field1: '',
  field2: '',
  // ...
});`,
        suggestions: [
          "Consider if all state fields relate to the same concern",
          "Alternatives: zustand, jotai for complex state management",
          "Extract custom hook: use" + component + "State()"
        ]
      });
    });
    return diagnostics;
  }
};
var multiple_usestate_default = rule2;

// src/rules/large-component.ts
var LOC_THRESHOLD = 300;
var HOOK_THRESHOLD = 6;
var JSX_THRESHOLD = 30;
function isPascalCase2(name) {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}
function isFunctionNode2(node) {
  return node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
}
function getFunctionName(node) {
  if (node.type === "FunctionDeclaration" && node.id) return node.id.name;
  if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
    const parent = node.parent;
    if (parent?.type === "VariableDeclarator" && parent.id.type === "Identifier") {
      return parent.id.name;
    }
  }
  return null;
}
function countHooks(fnNode) {
  let count = 0;
  traverse(fnNode, (node) => {
    if (node !== fnNode && isFunctionNode2(node)) return;
    if (node.type === "CallExpression" && node.callee.type === "Identifier" && /^use[A-Z]/.test(node.callee.name)) {
      count++;
    }
  });
  return count;
}
function countJSXNodes(fnNode) {
  let count = 0;
  traverse(fnNode, (node) => {
    if (node.type === "JSXElement") count++;
  });
  return count;
}
var rule3 = {
  id: "large-component",
  severity: "warning",
  category: "performance",
  frameworks: ["react", "next", "react-native", "expo", "astro"],
  check(ast, filePath, sourceLines) {
    const diagnostics = [];
    const visited = /* @__PURE__ */ new Set();
    traverse(ast, (node) => {
      if (!isFunctionNode2(node) || visited.has(node)) return;
      visited.add(node);
      if (!node.loc) return;
      const name = getFunctionName(node);
      if (!name || !isPascalCase2(name)) return;
      const lineCount = node.loc.end.line - node.loc.start.line + 1;
      if (lineCount <= LOC_THRESHOLD) return;
      const hookCount = countHooks(node);
      const jsxCount = countJSXNodes(node);
      const isHighComplexity = hookCount > HOOK_THRESHOLD || jsxCount > JSX_THRESHOLD;
      const confidence = isHighComplexity ? 0.85 : 0.55;
      const line = node.loc.start.line;
      const column = node.loc.start.column;
      const component = detectComponent(node);
      diagnostics.push({
        ruleId: "large-component",
        severity: "warning",
        category: "performance",
        confidence,
        message: `Component is ${lineCount} lines (${hookCount} hooks, ${jsxCount} JSX nodes) \u2014 consider splitting`,
        component,
        filePath,
        line,
        column,
        codeSnippet: getCodeSnippet(sourceLines, line),
        fix: `// Extract logical sections into smaller components:
function ${name}Header() { /* ... */ }
function ${name}Body() { /* ... */ }
function ${name}Footer() { /* ... */ }

// Use custom hooks for complex logic:
function use${name}Logic() { /* state + effects */ }`,
        suggestions: [
          "Extract custom hook for state + effect logic",
          "Break JSX into sub-components",
          `Aim for < ${LOC_THRESHOLD} lines, < ${HOOK_THRESHOLD} hooks, < ${JSX_THRESHOLD} JSX nodes`
        ]
      });
    });
    return diagnostics;
  }
};
var large_component_default = rule3;

// src/rules/effect-set-state.ts
var THRESHOLD2 = 5;
function isUseEffectCall2(node) {
  return node.callee.type === "Identifier" && node.callee.name === "useEffect";
}
function buildSetterNames(ast) {
  const setters = /* @__PURE__ */ new Set();
  traverse(ast, (node) => {
    if (node.type !== "VariableDeclarator" || node.id.type !== "ArrayPattern" || !node.init || node.init.type !== "CallExpression") return;
    const init = node.init;
    const isUseState = init.callee.type === "Identifier" && init.callee.name === "useState" || init.callee.type === "MemberExpression" && init.callee.object.type === "Identifier" && init.callee.object.name === "React" && init.callee.property.type === "Identifier" && init.callee.property.name === "useState";
    if (!isUseState) return;
    const elements = node.id.elements;
    if (elements.length >= 2) {
      const setter = elements[1];
      if (setter && setter.type === "Identifier") {
        setters.add(setter.name);
      }
    }
  });
  return setters;
}
var rule4 = {
  id: "effect-set-state",
  severity: "warning",
  category: "best-practice",
  frameworks: ["react", "next", "react-native", "expo", "astro"],
  check(ast, filePath, sourceLines) {
    if (filePath.endsWith(".astro")) return [];
    const diagnostics = [];
    const setterNames = buildSetterNames(ast);
    function isSetterCall(node) {
      if (node.callee.type !== "Identifier") return false;
      const name = node.callee.name;
      if (setterNames.size > 0) return setterNames.has(name);
      return /^set[A-Z]/.test(name);
    }
    traverse(ast, (node) => {
      if (node.type !== "CallExpression" || !isUseEffectCall2(node)) return;
      const callback = node.arguments[0];
      if (!callback) return;
      const setStateCalls = [];
      traverse(callback, (child) => {
        if (child.type === "CallExpression" && isSetterCall(child)) {
          setStateCalls.push(child);
        }
      });
      if (setStateCalls.length < THRESHOLD2) return;
      const line = node.loc.start.line;
      const column = node.loc.start.column;
      const component = detectComponent(node);
      diagnostics.push({
        ruleId: "effect-set-state",
        severity: "warning",
        category: "best-practice",
        confidence: 0.8,
        message: `${setStateCalls.length} setState calls inside useEffect \u2014 consider useReducer to batch updates`,
        component,
        filePath,
        line,
        column,
        codeSnippet: getCodeSnippet(sourceLines, line),
        fix: `const [state, dispatch] = useReducer((state, action) => {
  switch (action.type) {
    case 'LOADED': return { ...state, ...action.payload };
    default: return state;
  }
}, initialState);

useEffect(() => {
  dispatch({ type: 'LOADED', payload: { /* ... */ } });
}, [deps]);`,
        suggestions: [
          "Consider if all these state updates can be derived from a single source of truth",
          "Group related state fields into one object to reduce setter count"
        ]
      });
    });
    return diagnostics;
  }
};
var effect_set_state_default = rule4;

// src/rules/effect-as-handler.ts
var EVENT_FLAG_PATTERNS = [
  /^(is|was|has)(Clicked|Submitted|Pressed|Triggered|Fired|Called)/i,
  /^(on|handle)[A-Z]/,
  /^(clicked|submitted|toggled|triggered|fired)$/i
];
function looksLikeEventFlag(name) {
  return EVENT_FLAG_PATTERNS.some((p) => p.test(name));
}
function isUseEffectCall3(node) {
  return node.callee.type === "Identifier" && node.callee.name === "useEffect";
}
var rule5 = {
  id: "effect-as-handler",
  severity: "warning",
  category: "best-practice",
  frameworks: ["react", "next", "react-native", "expo", "astro"],
  check(ast, filePath, sourceLines) {
    if (filePath.endsWith(".astro")) return [];
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "CallExpression" || !isUseEffectCall3(node)) return;
      const depsArg = node.arguments[1];
      if (!depsArg || depsArg.type !== "ArrayExpression") return;
      const deps = depsArg.elements;
      if (deps.length !== 1) return;
      const dep = deps[0];
      if (!dep || dep.type !== "Identifier" || !looksLikeEventFlag(dep.name)) return;
      const line = node.loc.start.line;
      const column = node.loc.start.column;
      const component = detectComponent(node);
      const flagName = dep.name;
      const capitalized = flagName.charAt(0).toUpperCase() + flagName.slice(1);
      diagnostics.push({
        ruleId: "effect-as-handler",
        severity: "warning",
        category: "best-practice",
        confidence: 0.7,
        message: `useEffect([${flagName}]) looks like an event handler \u2014 move logic directly into the event handler`,
        component,
        filePath,
        line,
        column,
        codeSnippet: getCodeSnippet(sourceLines, line),
        fix: `// Instead of:
const [${flagName}, set${capitalized}] = useState(false);
useEffect(() => { /* side effect */ }, [${flagName}]);

// Do this \u2014 run the effect directly in the handler:
function handleEvent() {
  // put the side effect logic here directly
}`,
        suggestions: [
          "useEffect should synchronize with external systems, not react to user events",
          "Event handlers can be async \u2014 no need for the effect pattern"
        ]
      });
    });
    return diagnostics;
  }
};
var effect_as_handler_default = rule5;

// src/rules/index-as-key.ts
var rule6 = {
  id: "index-as-key",
  severity: "warning",
  category: "best-practice",
  frameworks: ["react", "next", "react-native", "expo", "astro"],
  check(ast, filePath, sourceLines) {
    if (filePath.endsWith(".astro")) return [];
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression" || node.callee.property.type !== "Identifier" || node.callee.property.name !== "map") return;
      const callback = node.arguments[0];
      if (!callback || callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression") return;
      const params = callback.params;
      if (params.length < 2 || params[1].type !== "Identifier") return;
      const indexParamName = params[1].name;
      traverse(callback, (child) => {
        if (child.type === "JSXAttribute" && child.name.type === "JSXIdentifier" && child.name.name === "key" && child.value?.type === "JSXExpressionContainer" && child.value.expression.type === "Identifier" && child.value.expression.name === indexParamName) {
          const line = child.loc.start.line;
          const column = child.loc.start.column;
          const component = detectComponent(child);
          diagnostics.push({
            ruleId: "index-as-key",
            severity: "warning",
            category: "best-practice",
            confidence: 0.9,
            message: `key={${indexParamName}} (array index) \u2014 use a stable unique ID instead`,
            component,
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `// Use a stable unique identifier from the data:
items.map((item) => (
  <Component key={item.id} {...item} />
))

// If items have no ID, add one when creating the array:
const itemsWithIds = rawItems.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() }));`,
            suggestions: [
              "Index keys cause incorrect reconciliation when items are reordered or filtered",
              "If data has no natural ID, generate stable IDs at the data-fetching layer"
            ]
          });
        }
      });
    });
    return diagnostics;
  }
};
var index_as_key_default = rule6;

// src/rules/a11y-autofocus.ts
var rule7 = {
  id: "a11y-autofocus",
  severity: "warning",
  category: "accessibility",
  frameworks: ["react", "next", "astro"],
  check(ast, filePath, sourceLines) {
    const diagnostics = [];
    const isAstro = filePath.endsWith(".astro");
    traverse(ast, (node) => {
      if (node.type !== "JSXAttribute" || node.name.type !== "JSXIdentifier" || node.name.name !== "autoFocus" && node.name.name !== "autofocus") return;
      if (node.value?.type === "JSXExpressionContainer" && node.value.expression.type === "Literal" && node.value.expression.value === false) return;
      const line = node.loc.start.line;
      const column = node.loc.start.column;
      const component = detectComponent(node);
      diagnostics.push({
        ruleId: "a11y-autofocus",
        severity: "warning",
        category: "accessibility",
        confidence: 0.85,
        message: `${node.name.name} disrupts screen readers and keyboard navigation`,
        component,
        filePath,
        line,
        column,
        codeSnippet: getCodeSnippet(sourceLines, line),
        fix: isAstro ? `<!-- Remove autofocus from initial HTML, or focus only when a dialog opens: -->
<dialog id="my-dialog">
  <input id="dialog-input" type="text" />
</dialog>

<script>
  const dialog = document.getElementById('my-dialog');
  dialog?.addEventListener('toggle', () => {
    document.getElementById('dialog-input')?.focus();
  });
</script>` : `// Remove autoFocus, or focus programmatically after user action:
const inputRef = useRef<HTMLInputElement>(null);

useEffect(() => {
  // Only focus when modal/dialog opens, not on initial page load
  if (isOpen) inputRef.current?.focus();
}, [isOpen]);

<input ref={inputRef} />`,
        suggestions: [
          "If focusing inside a modal, use the dialog role and manage focus after user interaction",
          "WCAG 2.4.3: Focus order must be logical and predictable"
        ]
      });
    });
    return diagnostics;
  }
};
var a11y_autofocus_default = rule7;

// src/rules/a11y-label.ts
var FORM_ELEMENTS = /* @__PURE__ */ new Set(["input", "select", "textarea"]);
function getAttributeValue(attrs, name) {
  for (const attr of attrs) {
    if (attr.type === "JSXAttribute" && attr.name.type === "JSXIdentifier" && attr.name.name === name) {
      if (attr.value?.type === "Literal") return String(attr.value.value);
      if (attr.value?.type === "JSXExpressionContainer" && attr.value.expression.type === "Literal") {
        return String(attr.value.expression.value);
      }
      return "__dynamic__";
    }
  }
  return null;
}
function hasAttr(attrs, name) {
  return getAttributeValue(attrs, name) !== null;
}
var rule8 = {
  id: "a11y-label",
  severity: "warning",
  category: "accessibility",
  frameworks: ["react", "next", "astro"],
  check(ast, filePath, sourceLines) {
    const diagnostics = [];
    const isAstro = filePath.endsWith(".astro");
    const forAttr = isAstro ? "for" : "htmlFor";
    traverse(ast, (node) => {
      if (node.type !== "JSXOpeningElement") return;
      if (node.name.type !== "JSXIdentifier") return;
      const name = node.name.name;
      if (!FORM_ELEMENTS.has(name)) return;
      const attrs = node.attributes;
      const typeValue = getAttributeValue(attrs, "type");
      if (typeValue === "hidden") return;
      if (!hasAttr(attrs, "aria-label") && !hasAttr(attrs, "aria-labelledby")) {
        const line = node.loc.start.line;
        const column = node.loc.start.column;
        const component = detectComponent(node);
        diagnostics.push({
          ruleId: "a11y-label",
          severity: "warning",
          category: "accessibility",
          confidence: 0.75,
          message: `<${name}> has no accessible label \u2014 add aria-label, aria-labelledby, or an associated <label>`,
          component,
          filePath,
          line,
          column,
          codeSnippet: getCodeSnippet(sourceLines, line),
          fix: `// Option 1: Use aria-label
<${name} aria-label="Descriptive label" />

// Option 2: Associate with a <label> element
<label ${forAttr}="my-${name}">Label text</label>
<${name} id="my-${name}" />

// Option 3: Use aria-labelledby
<span id="my-label">Label text</span>
<${name} aria-labelledby="my-label" />`,
          suggestions: [
            "WCAG 1.3.1: Form elements must have programmatic labels",
            "Placeholder text is not a substitute for a label",
            `If using id, ensure a <label ${forAttr}="..."> element is also present`
          ]
        });
      }
    });
    return diagnostics;
  }
};
var a11y_label_default = rule8;

// src/rules/a11y-interactive.ts
var INTERACTIVE_HANDLERS = /* @__PURE__ */ new Set(["onClick", "onDoubleClick", "onContextMenu"]);
var KEYBOARD_HANDLERS = /* @__PURE__ */ new Set(["onKeyDown", "onKeyUp", "onKeyPress"]);
var NON_INTERACTIVE_ELEMENTS = /* @__PURE__ */ new Set([
  "div",
  "span",
  "p",
  "li",
  "td",
  "th",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "nav"
]);
function hasAttr2(attrs, nameSet) {
  return attrs.some(
    (a) => a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && nameSet.has(a.name.name)
  );
}
var rule9 = {
  id: "a11y-interactive",
  severity: "warning",
  category: "accessibility",
  frameworks: ["react", "next", "astro"],
  check(ast, filePath, sourceLines) {
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "JSXOpeningElement") return;
      if (node.name.type !== "JSXIdentifier") return;
      const name = node.name.name;
      if (!NON_INTERACTIVE_ELEMENTS.has(name)) return;
      const attrs = node.attributes;
      const hasMouseHandler = hasAttr2(attrs, INTERACTIVE_HANDLERS);
      const hasKeyboardHandler = hasAttr2(attrs, KEYBOARD_HANDLERS);
      if (hasMouseHandler && !hasKeyboardHandler) {
        const line = node.loc.start.line;
        const column = node.loc.start.column;
        const component = detectComponent(node);
        diagnostics.push({
          ruleId: "a11y-interactive",
          severity: "warning",
          category: "accessibility",
          confidence: 0.7,
          message: `<${name}> has mouse handler but no keyboard handler \u2014 keyboard-only users cannot interact`,
          component,
          filePath,
          line,
          column,
          codeSnippet: getCodeSnippet(sourceLines, line),
          fix: `// Add keyboard support and proper role:
<${name}
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick(e)}
>

// Or better \u2014 use a <button> which is keyboard-accessible by default:
<button onClick={handleClick}>...</button>`,
          suggestions: [
            "WCAG 2.1.1: All functionality must be operable via keyboard",
            "Consider replacing with the semantic HTML element (<button>, <a>, etc.)"
          ]
        });
      }
    });
    return diagnostics;
  }
};
var a11y_interactive_default = rule9;

// src/rules/a11y-role.ts
var EVENT_HANDLERS = /* @__PURE__ */ new Set([
  "onClick",
  "onDoubleClick",
  "onContextMenu",
  "onMouseDown",
  "onMouseUp",
  "onMouseEnter",
  "onMouseLeave",
  "onFocus",
  "onBlur"
]);
var ELEMENTS_NEEDING_ROLE = /* @__PURE__ */ new Set([
  "div",
  "span",
  "p",
  "li",
  "td",
  "th",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "nav",
  "ul",
  "ol"
]);
function hasAttr3(attrs, nameOrSet) {
  const check = typeof nameOrSet === "string" ? (n) => n === nameOrSet : (n) => nameOrSet.has(n);
  return attrs.some(
    (a) => a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && check(a.name.name)
  );
}
var rule10 = {
  id: "a11y-role",
  severity: "warning",
  category: "accessibility",
  frameworks: ["react", "next", "astro"],
  check(ast, filePath, sourceLines) {
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "JSXOpeningElement") return;
      if (node.name.type !== "JSXIdentifier") return;
      const name = node.name.name;
      if (!ELEMENTS_NEEDING_ROLE.has(name)) return;
      const attrs = node.attributes;
      const hasEventHandler = hasAttr3(attrs, EVENT_HANDLERS);
      const hasRole = hasAttr3(attrs, "role");
      if (hasEventHandler && !hasRole) {
        const line = node.loc.start.line;
        const column = node.loc.start.column;
        const component = detectComponent(node);
        diagnostics.push({
          ruleId: "a11y-role",
          severity: "warning",
          category: "accessibility",
          confidence: 0.7,
          message: `<${name}> has event handler but no role \u2014 assistive technologies won't announce it correctly`,
          component,
          filePath,
          line,
          column,
          codeSnippet: getCodeSnippet(sourceLines, line),
          fix: `// Add the appropriate ARIA role:
<${name} role="button" tabIndex={0} onClick={handler}>

// Common roles: button, link, checkbox, menuitem, tab, listitem, dialog
// Or replace with the semantic HTML element:
// div[role=button] \u2192 <button>
// div[role=link]   \u2192 <a href="...">
// div[role=list]   \u2192 <ul> or <ol>`,
          suggestions: [
            "WCAG 4.1.2: UI components must have a programmatically determinable name and role",
            "Prefer semantic HTML over ARIA roles when possible"
          ]
        });
      }
    });
    return diagnostics;
  }
};
var a11y_role_default = rule10;

// src/rules/heavy-import.ts
var HEAVY_LIBS = {
  moment: "date-fns or dayjs (much smaller)",
  lodash: "lodash-es with tree shaking, or native JS",
  "@mui/material": "@mui/material with tree-shaking imports",
  "@material-ui/core": "@mui/material with tree-shaking imports",
  "react-data-grid": 'lazy load: const Grid = lazy(() => import("react-data-grid"))',
  "react-pdf": 'lazy load: const PDFViewer = lazy(() => import("react-pdf"))',
  "react-map-gl": 'lazy load: const Map = lazy(() => import("react-map-gl"))',
  "mapbox-gl": 'lazy load: const mapboxgl = lazy(() => import("mapbox-gl"))',
  "chart.js": "lazy load with react-chartjs-2 or use a lighter alternative",
  recharts: 'lazy load: const Chart = lazy(() => import("recharts"))',
  three: 'lazy load: const THREE = lazy(() => import("three"))',
  "@react-three/fiber": "lazy load the 3D component",
  xlsx: 'lazy load: const XLSX = lazy(() => import("xlsx"))',
  pdfmake: "lazy load or use a server-side solution",
  "draft-js": "lazy load the editor component",
  quill: 'lazy load: const Quill = lazy(() => import("quill"))',
  "monaco-editor": 'lazy load: const Editor = lazy(() => import("@monaco-editor/react"))',
  prismjs: "use react-syntax-highlighter with async loading",
  "highlight.js": "use react-syntax-highlighter with async loading"
};
var rule11 = {
  id: "heavy-import",
  severity: "warning",
  category: "performance",
  frameworks: ["react", "next", "astro"],
  check(ast, filePath, sourceLines, context) {
    const diagnostics = [];
    const isAstroFile = filePath.endsWith(".astro") || context?.framework === "astro";
    traverse(ast, (node) => {
      if (node.type === "ImportDeclaration") {
        if (node.importKind === "type") return;
        const hasRuntimeSpecifier = node.specifiers.length === 0 || node.specifiers.some(
          (specifier) => specifier.type === "ImportSpecifier" ? specifier.importKind !== "type" : true
        );
        if (!hasRuntimeSpecifier) return;
        const source = node.source.value;
        const suggestion = HEAVY_LIBS[source];
        if (!suggestion) return;
        const line = node.loc.start.line;
        const column = node.loc.start.column;
        let fix;
        if (source === "moment") {
          fix = `// Replace moment with date-fns:
import { format, parseISO } from 'date-fns';
const formatted = format(parseISO(dateString), 'yyyy-MM-dd');`;
        } else if (source === "lodash") {
          fix = `// Use tree-shakeable lodash-es:
import { debounce, groupBy } from 'lodash-es';`;
        } else if (isAstroFile) {
          fix = `---
// Option 1: Hydrate heavy UI only when visible in the viewport:
import HeavyIsland from '../components/HeavyIsland.tsx';
---
<HeavyIsland client:visible />

<!-- Option 2: Dynamically import inside a client <script> when needed: -->
<script>
  const module = await import('${source}');
</script>`;
        } else {
          const varName = source.split("/").pop().replace(/[-@]/g, "_");
          fix = `// Lazy load the heavy module:
const ${varName} = React.lazy(() => import('${source}'));

// Wrap usage in Suspense:
<Suspense fallback={<div>Loading...</div>}>
  <HeavyComponent />
</Suspense>`;
        }
        diagnostics.push({
          ruleId: "heavy-import",
          severity: "warning",
          category: "performance",
          confidence: 0.8,
          message: `Heavy import "${source}" \u2014 consider: ${suggestion}`,
          component: "module-level",
          filePath,
          line,
          column,
          codeSnippet: getCodeSnippet(sourceLines, line),
          fix,
          suggestions: [
            `Lazy loading defers the ${source} bundle until it is actually needed`,
            "Use bundle analysis (next build --analyze or webpack-bundle-analyzer) to measure impact"
          ]
        });
      }
    });
    return diagnostics;
  }
};
var heavy_import_default = rule11;

// src/rules/use-search-params.ts
function isComponentWrappedInSuspense(ast, componentName) {
  const usages = [];
  traverse(ast, (node) => {
    if (node.type === "JSXOpeningElement" && node.name.type === "JSXIdentifier" && node.name.name === componentName) {
      let insideSuspense = false;
      let cur = node.parent;
      while (cur) {
        if (cur.type === "JSXElement" && cur.openingElement?.name?.name === "Suspense") {
          insideSuspense = true;
          break;
        }
        cur = cur.parent;
      }
      usages.push(insideSuspense);
    }
  });
  return usages.length > 0 && usages.every(Boolean);
}
var rule12 = {
  id: "use-search-params",
  severity: "warning",
  category: "correctness",
  frameworks: ["next"],
  check(ast, filePath, sourceLines) {
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "CallExpression" || node.callee.type !== "Identifier" || node.callee.name !== "useSearchParams") return;
      const component = detectComponent(node);
      if (isComponentWrappedInSuspense(ast, component)) return;
      const line = node.loc.start.line;
      const column = node.loc.start.column;
      diagnostics.push({
        ruleId: "use-search-params",
        severity: "warning",
        category: "correctness",
        confidence: 0.85,
        message: "useSearchParams() requires a Suspense boundary \u2014 wrap the component or its parent",
        component,
        filePath,
        line,
        column,
        codeSnippet: getCodeSnippet(sourceLines, line),
        fix: `// Wrap the component with Suspense:
<Suspense fallback={<div>Loading...</div>}>
  <${component} />
</Suspense>

// Or use a separate client component with Suspense in the parent.`,
        suggestions: [
          "Next.js requires Suspense because useSearchParams reads from a dynamic data source",
          "Consider a loading skeleton as the Suspense fallback for better UX"
        ]
      });
    });
    return diagnostics;
  }
};
var use_search_params_default = rule12;

// src/rules/missing-use-client.ts
var CLIENT_HOOKS = /* @__PURE__ */ new Set([
  "useState",
  "useEffect",
  "useReducer",
  "useCallback",
  "useMemo",
  "useRef",
  "useContext",
  "useLayoutEffect",
  "useImperativeHandle",
  "useTransition",
  "useDeferredValue",
  "useId"
]);
function hasUseClientDirective(ast) {
  for (const node of ast.body) {
    if (node.type === "ExpressionStatement" && node.expression.type === "Literal" && node.expression.value === "use client") {
      return true;
    }
  }
  return false;
}
function isAppRouterFile(filePath) {
  return /[/\\]app[/\\]/.test(filePath);
}
function buildReactHookLocals(ast) {
  const locals = /* @__PURE__ */ new Set();
  for (const node of ast.body) {
    if (node.type !== "ImportDeclaration") continue;
    if (node.source.value !== "react") continue;
    for (const spec of node.specifiers) {
      if (spec.type === "ImportSpecifier") {
        const imported = spec.imported.type === "Identifier" ? spec.imported.name : String(spec.imported.value);
        if (CLIENT_HOOKS.has(imported)) {
          locals.add(spec.local.name);
        }
      }
    }
  }
  return locals;
}
var rule13 = {
  id: "missing-use-client",
  severity: "error",
  category: "correctness",
  frameworks: ["next"],
  check(ast, filePath, sourceLines) {
    const diagnostics = [];
    if (!isAppRouterFile(filePath)) return diagnostics;
    if (hasUseClientDirective(ast)) return diagnostics;
    const reactHookLocals = buildReactHookLocals(ast);
    function isClientHookCall(node) {
      if (node.callee.type === "Identifier" && reactHookLocals.has(node.callee.name)) {
        return true;
      }
      if (node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier" && node.callee.object.name === "React" && node.callee.property.type === "Identifier" && CLIENT_HOOKS.has(node.callee.property.name)) {
        return true;
      }
      return false;
    }
    const found = [];
    traverse(ast, (node) => {
      if (node.type === "CallExpression" && isClientHookCall(node)) {
        found.push(node);
      }
    });
    if (found.length === 0) return diagnostics;
    const firstHook = found[0];
    const line = firstHook.loc.start.line;
    const column = firstHook.loc.start.column;
    const callee = firstHook.callee;
    const hookName = callee.type === "Identifier" ? callee.name : callee.property.type === "Identifier" ? callee.property.name : "hook";
    const component = detectComponent(firstHook);
    diagnostics.push({
      ruleId: "missing-use-client",
      severity: "error",
      category: "correctness",
      confidence: 0.95,
      message: `${hookName}() used without "use client" directive \u2014 this will fail in Next.js App Router`,
      component,
      filePath,
      line,
      column,
      codeSnippet: getCodeSnippet(sourceLines, line),
      fix: `// Add at the very top of the file (before imports):
'use client';

import React, { ${hookName} } from 'react';
// ... rest of your component`,
      suggestions: [
        "Check if this file should be in the pages/ directory instead",
        "Server Components cannot use hooks \u2014 split into a Client Component if needed"
      ]
    });
    return diagnostics;
  }
};
var missing_use_client_default = rule13;

// src/rules/img-not-optimized.ts
function hasSrcAttr(node) {
  return node.attributes.some(
    (a) => a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && a.name.name === "src"
  );
}
var rule14 = {
  id: "img-not-optimized",
  severity: "warning",
  category: "performance",
  frameworks: ["next", "astro"],
  check(ast, filePath, sourceLines, context) {
    const diagnostics = [];
    const isAstro = context?.framework === "astro" || filePath.endsWith(".astro");
    traverse(ast, (node) => {
      if (node.type === "JSXOpeningElement" && node.name.type === "JSXIdentifier" && node.name.name === "img") {
        if (!hasSrcAttr(node)) return;
        const line = node.loc.start.line;
        const column = node.loc.start.column;
        const component = detectComponent(node);
        if (isAstro) {
          diagnostics.push({
            ruleId: "img-not-optimized",
            severity: "warning",
            category: "performance",
            confidence: 0.85,
            message: "<img> tag used \u2014 use Astro <Image /> from astro:assets for automatic optimization",
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
              "Astro <Image /> from astro:assets optimizes formats (AVIF/WebP), resizes, and prevents CLS",
              "Inside React (.tsx) islands, pass optimized image metadata from Astro frontmatter via getImage()"
            ]
          });
        } else {
          diagnostics.push({
            ruleId: "img-not-optimized",
            severity: "warning",
            category: "performance",
            confidence: 0.85,
            message: "<img> tag used \u2014 use Next.js <Image> for automatic optimization",
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
              "Next.js <Image> provides automatic WebP conversion, lazy loading, and size optimization",
              "Add width and height to prevent layout shift (CLS)"
            ]
          });
        }
      }
    });
    return diagnostics;
  }
};
var img_not_optimized_default = rule14;

// src/rules/inline-styles.ts
var rule15 = {
  id: "inline-styles",
  severity: "warning",
  category: "performance",
  frameworks: ["react-native", "expo"],
  check(ast, filePath, sourceLines) {
    const diagnostics = [];
    const reported = /* @__PURE__ */ new Set();
    traverse(ast, (node) => {
      if (node.type !== "JSXAttribute" || node.name.type !== "JSXIdentifier" || node.name.name !== "style") return;
      const val = node.value;
      if (val?.type !== "JSXExpressionContainer" || val.expression.type !== "ObjectExpression") return;
      const line = node.loc.start.line;
      if (reported.has(line)) return;
      reported.add(line);
      const column = node.loc.start.column;
      const component = detectComponent(node);
      diagnostics.push({
        ruleId: "inline-styles",
        severity: "warning",
        category: "performance",
        confidence: 0.7,
        message: "Inline style object \u2014 use StyleSheet.create() for better performance",
        component,
        filePath,
        line,
        column,
        codeSnippet: getCodeSnippet(sourceLines, line),
        fix: `import { StyleSheet } from 'react-native';

// Move styles outside the component:
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    // ... your styles
  },
});

// Use in JSX:
<View style={styles.container} />`,
        suggestions: [
          "StyleSheet.create() validates styles at dev time and sends them as IDs (not objects) to the native layer",
          "Memoize dynamic styles with useMemo to avoid recreation on every render"
        ]
      });
    });
    return diagnostics;
  }
};
var inline_styles_default = rule15;

// src/rules/no-console-log.ts
function isInsideDevGuard(node) {
  let current = node;
  while (current?.parent) {
    const parent = current.parent;
    if (parent.type === "IfStatement" && parent.test.type === "Identifier" && parent.test.name === "__DEV__") {
      return true;
    }
    current = parent;
  }
  return false;
}
var rule16 = {
  id: "no-console-log",
  severity: "warning",
  category: "best-practice",
  frameworks: ["react-native", "expo", "astro"],
  check(ast, filePath, sourceLines, context) {
    const diagnostics = [];
    const isAstro = context?.framework === "astro" || filePath.endsWith(".astro");
    traverse(ast, (node) => {
      if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression" || node.callee.object.type !== "Identifier" || node.callee.object.name !== "console" || node.callee.property.type !== "Identifier") return;
      const method = node.callee.property.name;
      if (!["log", "warn", "error", "info", "debug"].includes(method)) return;
      if (isInsideDevGuard(node)) return;
      const line = node.loc.start.line;
      const column = node.loc.start.column;
      diagnostics.push({
        ruleId: "no-console-log",
        severity: "warning",
        category: "best-practice",
        confidence: 0.85,
        message: `console.${method}() left in production code \u2014 remove or use a proper logger`,
        component: "module-level",
        filePath,
        line,
        column,
        codeSnippet: getCodeSnippet(sourceLines, line),
        fix: isAstro ? `// Option 1: Remove the console statement entirely

// Option 2: Guard with Vite/Astro import.meta.env.DEV:
if (import.meta.env.DEV) {
  console.${method}('debug info');
}` : `// Option 1: Remove the console statement entirely

// Option 2: Use __DEV__ guard (React Native built-in):
if (__DEV__) {
  console.${method}('debug info');
}

// Option 3: Use a logger library like react-native-logs:
import { logger } from './logger';
logger.${method === "log" ? "debug" : method}('message');`,
        suggestions: isAstro ? [
          "Wrap debug logs in if (import.meta.env.DEV) so Vite tree-shakes them out of production builds"
        ] : [
          "console statements are stripped in release builds by Metro, but leaving them adds noise"
        ]
      });
    });
    return diagnostics;
  }
};
var no_console_log_default = rule16;

// src/rules/flatlist-for-lists.ts
function isScrollViewElement(node) {
  return node.name.type === "JSXIdentifier" && (node.name.name === "ScrollView" || node.name.name === "SafeAreaScrollView");
}
var rule17 = {
  id: "flatlist-for-lists",
  severity: "warning",
  category: "performance",
  frameworks: ["react-native", "expo"],
  check(ast, filePath, sourceLines) {
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression" || node.callee.property.type !== "Identifier" || node.callee.property.name !== "map") return;
      let current = node;
      let insideScrollView = false;
      while (current) {
        if (current.type === "JSXElement" && current.openingElement && isScrollViewElement(current.openingElement)) {
          insideScrollView = true;
          break;
        }
        current = current.parent;
      }
      if (!insideScrollView) return;
      const line = node.loc.start.line;
      const column = node.loc.start.column;
      const component = detectComponent(node);
      diagnostics.push({
        ruleId: "flatlist-for-lists",
        severity: "warning",
        category: "performance",
        confidence: 0.8,
        message: ".map() inside ScrollView \u2014 use FlatList for virtualized rendering",
        component,
        filePath,
        line,
        column,
        codeSnippet: getCodeSnippet(sourceLines, line),
        fix: `import { FlatList } from 'react-native';

// Replace ScrollView + .map() with FlatList:
<FlatList
  data={items}
  keyExtractor={(item) => item.id.toString()}
  renderItem={({ item }) => <ItemComponent item={item} />}
  // Optional performance tweaks:
  initialNumToRender={10}
  maxToRenderPerBatch={10}
/>`,
        suggestions: [
          "FlatList only renders visible items \u2014 essential for lists with 50+ items",
          "Use SectionList for grouped data or FlashList (shopify) for even better performance"
        ]
      });
    });
    return diagnostics;
  }
};
var flatlist_for_lists_default = rule17;

// src/rules/rn-accessibility.ts
var TOUCHABLE_ELEMENTS = /* @__PURE__ */ new Set([
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "TouchableNativeFeedback",
  "Pressable"
]);
function getJSXAttrs(node) {
  const attrs = /* @__PURE__ */ new Map();
  for (const attr of node.attributes) {
    if (attr.type === "JSXAttribute" && attr.name.type === "JSXIdentifier") {
      attrs.set(attr.name.name, attr);
    }
  }
  return attrs;
}
function hasDerivableLabel(openingElement) {
  const jsxElement = openingElement.parent;
  if (!jsxElement || jsxElement.type !== "JSXElement") return false;
  for (const child of jsxElement.children) {
    if (child.type !== "JSXElement") continue;
    const childOpening = child.openingElement;
    if (childOpening.name.type === "JSXIdentifier" && childOpening.name.name === "Text") {
      for (const grandchild of child.children) {
        if (grandchild.type === "JSXText" && grandchild.value.trim().length > 0) {
          return true;
        }
        if (grandchild.type === "JSXExpressionContainer" && grandchild.expression.type === "Literal" && typeof grandchild.expression.value === "string") {
          return true;
        }
      }
    }
  }
  return false;
}
var rule18 = {
  id: "rn-accessibility",
  severity: "warning",
  category: "accessibility",
  frameworks: ["react-native", "expo"],
  check(ast, filePath, sourceLines) {
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "JSXOpeningElement" || node.name.type !== "JSXIdentifier" || !TOUCHABLE_ELEMENTS.has(node.name.name)) return;
      const attrs = getJSXAttrs(node);
      const hasLabel = attrs.has("accessibilityLabel") || attrs.has("aria-label");
      if (hasLabel) return;
      const elementName = node.name.name;
      const line = node.loc.start.line;
      const column = node.loc.start.column;
      const component = detectComponent(node);
      const derivable = hasDerivableLabel(node);
      const confidence = derivable ? 0.5 : 0.8;
      const suggestions = [
        "accessibilityLabel should describe the action, not the visual appearance",
        'Add accessibilityRole="button" alongside the label'
      ];
      if (derivable) {
        suggestions.unshift("The inner Text content may be readable by screen readers \u2014 verify before adding label");
      }
      diagnostics.push({
        ruleId: "rn-accessibility",
        severity: "warning",
        category: "accessibility",
        confidence,
        message: `<${elementName}> has no accessibilityLabel \u2014 screen readers cannot identify this element`,
        component,
        filePath,
        line,
        column,
        codeSnippet: getCodeSnippet(sourceLines, line),
        fix: `// Add accessibilityLabel to describe the action:
<${elementName}
  accessibilityLabel="Submit the form"
  accessibilityRole="button"
  onPress={handlePress}
>
  <Text>Submit</Text>
</${elementName}>`,
        suggestions
      });
    });
    return diagnostics;
  }
};
var rn_accessibility_default = rule18;

// src/rules/constants-manifest.ts
function makeError(filePath, line, column, sourceLines) {
  return {
    ruleId: "constants-manifest",
    severity: "error",
    category: "correctness",
    confidence: 0.99,
    message: "Constants.manifest is deprecated in Expo SDK 46+ \u2014 use Constants.expoConfig",
    component: "module-level",
    filePath,
    line,
    column,
    codeSnippet: getCodeSnippet(sourceLines, line),
    fix: `import Constants from 'expo-constants';

// Before (deprecated):
const appName = Constants.manifest?.name;

// After:
const appName = Constants.expoConfig?.name;

// For extra fields (app.json > extra):
const apiUrl = Constants.expoConfig?.extra?.apiUrl;`,
    suggestions: [
      "Constants.manifest was removed in Expo SDK 50 \u2014 update immediately",
      "Use Constants.expoConfig for all app.json / app.config.js fields"
    ]
  };
}
var rule19 = {
  id: "constants-manifest",
  severity: "error",
  category: "correctness",
  frameworks: ["expo"],
  check(ast, filePath, sourceLines) {
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type === "MemberExpression" && node.object.type === "Identifier" && node.object.name === "Constants" && node.property.type === "Identifier" && node.property.name === "manifest") {
        const line = node.loc.start.line;
        const column = node.loc.start.column;
        diagnostics.push(makeError(filePath, line, column, sourceLines));
        return;
      }
      if (node.type === "VariableDeclarator" && node.id.type === "ObjectPattern" && node.init?.type === "Identifier" && node.init.name === "Constants") {
        for (const prop of node.id.properties) {
          if (prop.type !== "Property") continue;
          const key = prop.key;
          if (key.type === "Identifier" && key.name === "manifest") {
            const line = node.loc.start.line;
            const column = node.loc.start.column;
            diagnostics.push(makeError(filePath, line, column, sourceLines));
            break;
          }
        }
      }
    });
    return diagnostics;
  }
};
var constants_manifest_default = rule19;

// src/rules/astro-v7-breaking.ts
var REMOVED_V7_EXPERIMENTAL_FLAGS = /* @__PURE__ */ new Set([
  "rustCompiler",
  "queuedRendering",
  "advancedRouting",
  "logger"
]);
var REMOVED_TRANSITION_EXPORTS = /* @__PURE__ */ new Set([
  "ViewTransitions",
  "TRANSITION_BEFORE_PREPARATION",
  "TRANSITION_AFTER_PREPARATION",
  "TRANSITION_BEFORE_SWAP",
  "TRANSITION_AFTER_SWAP",
  "TRANSITION_PAGE_LOAD",
  "isTransitionBeforePreparationEvent",
  "isTransitionBeforeSwapEvent",
  "createAnimationScope"
]);
var rule20 = {
  id: "astro-v7-breaking",
  severity: "error",
  category: "correctness",
  frameworks: ["astro"],
  check(ast, filePath, sourceLines, context) {
    const diagnostics = [];
    const astroVersion = context?.astroVersion ?? 7;
    const isAstroConfig = /astro\.config\.(mjs|ts|mts|js|cjs)$/.test(filePath);
    traverse(ast, (node) => {
      if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier" && node.callee.object.name === "Astro" && node.callee.property.type === "Identifier" && node.callee.property.name === "glob") {
        const line = node.loc.start.line;
        const column = node.loc.start.column;
        const severity = astroVersion >= 6 ? "error" : "warning";
        diagnostics.push({
          ruleId: "astro-v7-breaking",
          severity,
          category: "correctness",
          confidence: 0.98,
          message: astroVersion >= 6 ? `Astro.glob() was removed in Astro 6 (project target: Astro ${astroVersion}) \u2014 use getCollection() or import.meta.glob()` : "Astro.glob() is deprecated in Astro 5 and removed in Astro 6+ \u2014 migrate to getCollection() or import.meta.glob()",
          component: detectComponent(node),
          filePath,
          line,
          column,
          codeSnippet: getCodeSnippet(sourceLines, line),
          fix: `// Option 1: Content Layer API (recommended for Markdown/MDX/JSON):
import { getCollection } from 'astro:content';
const posts = await getCollection('blog');

// Option 2: Vite import.meta.glob (for raw component/file imports):
const pages = Object.values(import.meta.glob('./posts/*.md', { eager: true }));`,
          suggestions: [
            "Astro 6+ completely removed Astro.glob() in favor of the Content Layer API",
            "Use import.meta.glob(..., { eager: true }) for non-collection local files"
          ]
        });
      }
      if (node.type === "ImportDeclaration" && node.source.value === "astro:transitions") {
        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier" && spec.imported.type === "Identifier") {
            const importedName = spec.imported.name;
            if (REMOVED_TRANSITION_EXPORTS.has(importedName)) {
              const line = spec.loc.start.line;
              const column = spec.loc.start.column;
              const isViewTransitions = importedName === "ViewTransitions";
              const severity = astroVersion >= 6 ? "error" : "warning";
              diagnostics.push({
                ruleId: "astro-v7-breaking",
                severity,
                category: "correctness",
                confidence: 0.95,
                message: isViewTransitions ? `<ViewTransitions /> was replaced by <ClientRouter /> in Astro 6+ (project target: Astro ${astroVersion})` : `"${importedName}" from astro:transitions was removed in Astro 7 \u2014 use standard lifecycle event names`,
                component: detectComponent(node),
                filePath,
                line,
                column,
                codeSnippet: getCodeSnippet(sourceLines, line),
                fix: isViewTransitions ? `---
import { ClientRouter } from 'astro:transitions';
---
<head>
  <ClientRouter />
</head>` : `// Use standard lifecycle event strings directly:
document.addEventListener('astro:before-swap', (event) => {
  // handle swap
});`,
                suggestions: [
                  "Rename <ViewTransitions /> to <ClientRouter /> in your layout <head>",
                  "Astro 7 removed low-level transition constants in favor of standard event listeners"
                ]
              });
            }
          }
        }
      }
      if (node.type === "ImportDeclaration" && (node.source.value === "astro:db" || node.source.value === "@astrojs/db")) {
        if (astroVersion >= 6) {
          const line = node.loc.start.line;
          const column = node.loc.start.column;
          const severity = astroVersion >= 7 ? "error" : "warning";
          diagnostics.push({
            ruleId: "astro-v7-breaking",
            severity,
            category: "correctness",
            confidence: 0.95,
            message: astroVersion >= 7 ? `${node.source.value} (@astrojs/db) was removed in Astro 7 \u2014 migrate to Drizzle ORM or node:sqlite` : `${node.source.value} (@astrojs/db) is deprecated in Astro 6 and removed in Astro 7`,
            component: detectComponent(node),
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `// Migrate from astro:db to Drizzle ORM + libSQL / node:sqlite:
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const client = createClient({ url: import.meta.env.DATABASE_URL });
export const db = drizzle(client);`,
            suggestions: [
              "Astro 7 removed @astrojs/db and astro db CLI commands",
              "Since Astro 6+ requires Node 22+, you can also use built-in node:sqlite or Drizzle ORM directly"
            ]
          });
        }
      }
      if (isAstroConfig && node.type === "Property" && node.key.type === "Identifier") {
        if (node.key.name === "experimental" && node.value.type === "ObjectExpression" && astroVersion >= 6) {
          for (const prop of node.value.properties) {
            if (prop.type === "Property" && prop.key.type === "Identifier" && REMOVED_V7_EXPERIMENTAL_FLAGS.has(prop.key.name)) {
              const flagName = prop.key.name;
              const line = prop.loc.start.line;
              const column = prop.loc.start.column;
              const severity = astroVersion >= 7 ? "error" : "warning";
              diagnostics.push({
                ruleId: "astro-v7-breaking",
                severity,
                category: "correctness",
                confidence: 0.95,
                message: astroVersion >= 7 ? `experimental.${flagName} was promoted/removed in Astro 7 \u2014 remove it from astro.config` : `experimental.${flagName} becomes a stable default in Astro 7`,
                component: "astro.config",
                filePath,
                line,
                column,
                codeSnippet: getCodeSnippet(sourceLines, line),
                fix: flagName === "logger" ? `// Move logger to the top-level defineConfig({ ... }):
export default defineConfig({
  logger: { /* ... */ },
});` : `// Remove experimental.${flagName} \u2014 it is enabled by default in Astro 7:
export default defineConfig({
  // experimental.${flagName} is now the default behavior
});`,
                suggestions: [
                  "Astro 7 uses the Rust compiler, queued rendering, and advanced routing by default",
                  "Keeping promoted experimental flags in astro.config causes validation errors in Astro 7"
                ]
              });
            }
          }
        }
        if (node.key.name === "legacy" && node.value.type === "ObjectExpression") {
          for (const prop of node.value.properties) {
            if (prop.type === "Property" && prop.key.type === "Identifier" && prop.key.name === "collections") {
              const line = prop.loc.start.line;
              const column = prop.loc.start.column;
              const severity = astroVersion >= 6 ? "error" : "warning";
              diagnostics.push({
                ruleId: "astro-v7-breaking",
                severity,
                category: "correctness",
                confidence: 0.95,
                message: astroVersion >= 6 ? "legacy.collections was removed in Astro 6+ \u2014 migrate to the Content Layer API" : "legacy.collections is deprecated in Astro 5 and removed in Astro 6+",
                component: "astro.config",
                filePath,
                line,
                column,
                codeSnippet: getCodeSnippet(sourceLines, line),
                fix: `// Move your config to src/content.config.ts and use a loader:
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/data/blog' }),
  schema: z.object({ title: z.string() }),
});

export const collections = { blog };`,
                suggestions: [
                  "Remove legacy: { collections: true } from astro.config",
                  "Use src/content.config.ts with glob() or file() loaders from astro/loaders"
                ]
              });
            }
          }
        }
      }
    });
    return diagnostics;
  }
};
var astro_v7_breaking_default = rule20;

// src/rules/astro-legacy-content-config.ts
function isLegacyContentConfigPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.endsWith("/src/content/config.ts") || normalized.endsWith("/src/content/config.js");
}
function isModernContentConfigPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.endsWith("/src/content.config.ts") || normalized.endsWith("/src/content.config.mjs");
}
var rule21 = {
  id: "astro-legacy-content-config",
  severity: "warning",
  category: "best-practice",
  frameworks: ["astro"],
  check(ast, filePath, sourceLines, context) {
    const diagnostics = [];
    const astroVersion = context?.astroVersion ?? 7;
    const isLegacyPath = isLegacyContentConfigPath(filePath);
    const isModernPath = isModernContentConfigPath(filePath);
    if (!isLegacyPath && !isModernPath) return diagnostics;
    if (isLegacyPath) {
      const severity = astroVersion >= 6 ? "error" : "warning";
      diagnostics.push({
        ruleId: "astro-legacy-content-config",
        severity,
        category: "best-practice",
        confidence: 0.95,
        message: astroVersion >= 6 ? `Legacy src/content/config.ts path detected \u2014 Astro ${astroVersion} requires src/content.config.ts with Content Layer loaders` : "Legacy src/content/config.ts detected \u2014 migrate to src/content.config.ts (Content Layer API)",
        component: "content-config",
        filePath,
        line: 1,
        column: 0,
        codeSnippet: getCodeSnippet(sourceLines, 1),
        fix: `// 1. Move file from src/content/config.ts -> src/content.config.ts
// 2. Add an explicit loader from 'astro/loaders':
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
  }),
});

export const collections = { blog };`,
        suggestions: [
          "Content Layer API replaces legacy content collections in Astro 6 and Astro 7",
          "Explicit glob() or file() loaders enable up to 5x faster builds and Astro 7 Rust Markdown processing"
        ]
      });
    }
    traverse(ast, (node) => {
      if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "defineCollection" && node.arguments.length > 0 && node.arguments[0].type === "ObjectExpression") {
        const obj = node.arguments[0];
        const hasLoader = obj.properties.some(
          (p) => p.type === "Property" && p.key.type === "Identifier" && p.key.name === "loader"
        );
        if (!hasLoader) {
          const line = node.loc.start.line;
          const column = node.loc.start.column;
          const severity = astroVersion >= 6 ? "error" : "warning";
          diagnostics.push({
            ruleId: "astro-legacy-content-config",
            severity,
            category: "best-practice",
            confidence: 0.9,
            message: 'defineCollection() is missing a "loader" \u2014 Content Layer API requires glob() or file() loader',
            component: "content-config",
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const collection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({ /* ... */ }),
});`,
            suggestions: [
              'Import glob or file from "astro/loaders" and specify the loader property'
            ]
          });
        }
      }
    });
    return diagnostics;
  }
};
var astro_legacy_content_config_default = rule21;

// src/rules/astro-client-directive-on-html.ts
var CLIENT_DIRECTIVES = /* @__PURE__ */ new Set(["load", "idle", "visible", "media", "only"]);
function getClientDirectiveName(attr) {
  if (attr.type !== "JSXAttribute") return null;
  if (attr.name.type === "JSXNamespacedName" && attr.name.namespace.name === "client" && CLIENT_DIRECTIVES.has(attr.name.name.name)) {
    return `client:${attr.name.name.name}`;
  }
  return null;
}
var rule22 = {
  id: "astro-client-directive-on-html",
  severity: "error",
  category: "correctness",
  frameworks: ["astro"],
  check(ast, filePath, sourceLines) {
    if (!filePath.endsWith(".astro")) return [];
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "JSXOpeningElement") return;
      if (node.name.type !== "JSXIdentifier") return;
      const tagName = node.name.name;
      if (!/^[a-z]/.test(tagName)) return;
      for (const attr of node.attributes) {
        const directive = getClientDirectiveName(attr);
        if (!directive) continue;
        const line = attr.loc?.start.line ?? node.loc.start.line;
        const column = attr.loc?.start.column ?? node.loc.start.column;
        const component = detectComponent(node);
        diagnostics.push({
          ruleId: "astro-client-directive-on-html",
          severity: "error",
          category: "correctness",
          confidence: 1,
          message: `"${directive}" cannot be used on native HTML element <${tagName}> \u2014 client directives only work on UI framework components`,
          component,
          filePath,
          line,
          column,
          codeSnippet: getCodeSnippet(sourceLines, line),
          fix: `<!-- Option 1: Use client:* on an imported React/UI component (PascalCase): -->
<InteractiveButton ${directive} />

<!-- Option 2: For native HTML interactivity in .astro, use a standard <script> tag: -->
<${tagName} id="my-element">...</${tagName}>
<script>
  document.getElementById('my-element')?.addEventListener('click', () => {
    // client-side logic
  });
</script>`,
          suggestions: [
            "Astro throws a compiler error when client:* directives are placed on native HTML tags",
            "Move interactive UI into a PascalCase component (.tsx/.jsx) or attach listeners via <script>"
          ]
        });
      }
    });
    return diagnostics;
  }
};
var astro_client_directive_on_html_default = rule22;

// src/rules/astro-client-only-missing-framework.ts
function hasNonEmptyFrameworkValue(attr) {
  if (!attr.value) return false;
  if (attr.value.type === "Literal" && typeof attr.value.value === "string") {
    return attr.value.value.trim().length > 0;
  }
  if (attr.value.type === "JSXExpressionContainer" && attr.value.expression.type === "Literal" && typeof attr.value.expression.value === "string") {
    return attr.value.expression.value.trim().length > 0;
  }
  return false;
}
var rule23 = {
  id: "astro-client-only-missing-framework",
  severity: "error",
  category: "correctness",
  frameworks: ["astro"],
  check(ast, filePath, sourceLines) {
    if (!filePath.endsWith(".astro")) return [];
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "JSXOpeningElement") return;
      const tagName = node.name.type === "JSXIdentifier" ? node.name.name : "Component";
      for (const attr of node.attributes) {
        if (attr.type === "JSXAttribute" && attr.name.type === "JSXNamespacedName" && attr.name.namespace.name === "client" && attr.name.name.name === "only") {
          if (hasNonEmptyFrameworkValue(attr)) continue;
          const line = attr.loc?.start.line ?? node.loc.start.line;
          const column = attr.loc?.start.column ?? node.loc.start.column;
          const component = detectComponent(node);
          diagnostics.push({
            ruleId: "astro-client-only-missing-framework",
            severity: "error",
            category: "correctness",
            confidence: 1,
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
              "Because client:only skips server rendering, Astro cannot auto-detect which UI renderer to bundle without the framework hint"
            ]
          });
        }
      }
    });
    return diagnostics;
  }
};
var astro_client_only_missing_framework_default = rule23;

// src/rules/astro-hooks-in-astro.ts
var REACT_HOOKS = /* @__PURE__ */ new Set([
  "useState",
  "useEffect",
  "useReducer",
  "useCallback",
  "useMemo",
  "useRef",
  "useContext",
  "useLayoutEffect",
  "useTransition",
  "useDeferredValue",
  "useId"
]);
function getCalledHookName(node) {
  if (node.callee.type === "Identifier" && REACT_HOOKS.has(node.callee.name)) {
    return node.callee.name;
  }
  if (node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier" && node.callee.object.name === "React" && node.callee.property.type === "Identifier" && REACT_HOOKS.has(node.callee.property.name)) {
    return node.callee.property.name;
  }
  return null;
}
var rule24 = {
  id: "astro-hooks-in-astro",
  severity: "error",
  category: "correctness",
  frameworks: ["astro"],
  check(ast, filePath, sourceLines) {
    if (!filePath.endsWith(".astro")) return [];
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "CallExpression") return;
      const hookName = getCalledHookName(node);
      if (!hookName) return;
      const line = node.loc.start.line;
      const column = node.loc.start.column;
      const component = detectComponent(node);
      diagnostics.push({
        ruleId: "astro-hooks-in-astro",
        severity: "error",
        category: "correctness",
        confidence: 0.98,
        message: `${hookName}() cannot be called inside an .astro file \u2014 Astro components run only once on the server`,
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
          ".astro frontmatter runs at build/SSR time and never hydrates on the client",
          "Extract interactive React hooks into a .tsx component and mount it with client:visible or client:idle"
        ]
      });
    });
    return diagnostics;
  }
};
var astro_hooks_in_astro_default = rule24;

// src/rules/astro-client-load-overuse.ts
var rule25 = {
  id: "astro-client-load-overuse",
  severity: "warning",
  category: "performance",
  frameworks: ["astro"],
  check(ast, filePath, sourceLines) {
    if (!filePath.endsWith(".astro")) return [];
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "JSXOpeningElement") return;
      if (node.name.type !== "JSXIdentifier") return;
      const tagName = node.name.name;
      if (!/^[A-Z]/.test(tagName)) return;
      for (const attr of node.attributes) {
        if (attr.type === "JSXAttribute" && attr.name.type === "JSXNamespacedName" && attr.name.namespace.name === "client" && attr.name.name.name === "load") {
          const line = attr.loc?.start.line ?? node.loc.start.line;
          const column = attr.loc?.start.column ?? node.loc.start.column;
          const component = detectComponent(node);
          diagnostics.push({
            ruleId: "astro-client-load-overuse",
            severity: "warning",
            category: "performance",
            confidence: 0.75,
            message: `client:load on <${tagName}> hydrates immediately and blocks main thread \u2014 prefer client:visible or client:idle`,
            component,
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `<!-- For below-the-fold components (hydrates when scrolled into view): -->
<${tagName} client:visible />

<!-- For non-critical interactive UI (hydrates during browser idle time): -->
<${tagName} client:idle />`,
            suggestions: [
              "Reserve client:load strictly for above-the-fold controls that must respond within the first millisecond",
              "Switching to client:visible or client:idle improves Total Blocking Time (TBT) and LCP"
            ]
          });
        }
      }
    });
    return diagnostics;
  }
};
var astro_client_load_overuse_default = rule25;

// src/rules/astro-unsafe-set-html.ts
function isStaticStringExpression(attr) {
  if (!attr.value) return true;
  if (attr.value.type === "Literal" && typeof attr.value.value === "string") {
    return true;
  }
  if (attr.value.type === "JSXExpressionContainer" && attr.value.expression.type === "Literal" && typeof attr.value.expression.value === "string") {
    return true;
  }
  return false;
}
var rule26 = {
  id: "astro-unsafe-set-html",
  severity: "warning",
  category: "best-practice",
  frameworks: ["astro"],
  check(ast, filePath, sourceLines) {
    if (!filePath.endsWith(".astro")) return [];
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "JSXOpeningElement") return;
      for (const attr of node.attributes) {
        if (attr.type === "JSXAttribute" && attr.name.type === "JSXNamespacedName" && attr.name.namespace.name === "set" && attr.name.name.name === "html") {
          if (isStaticStringExpression(attr)) continue;
          const line = attr.loc?.start.line ?? node.loc.start.line;
          const column = attr.loc?.start.column ?? node.loc.start.column;
          const component = detectComponent(node);
          diagnostics.push({
            ruleId: "astro-unsafe-set-html",
            severity: "warning",
            category: "best-practice",
            confidence: 0.8,
            message: "set:html used with a dynamic expression \u2014 ensure HTML is sanitized to prevent XSS",
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
              "Astro does not automatically sanitize expressions passed to set:html",
              "For Markdown content from Content Collections, prefer the <Content /> component returned by render(entry)"
            ]
          });
        }
      }
    });
    return diagnostics;
  }
};
var astro_unsafe_set_html_default = rule26;

// src/rules/astro-inline-script.ts
function hasDefineVarsOrExternalSrc(attrs) {
  return attrs.some((a) => {
    if (a.type !== "JSXAttribute") return false;
    if (a.name.type === "JSXNamespacedName" && a.name.namespace.name === "define" && a.name.name.name === "vars") {
      return true;
    }
    if (a.name.type === "JSXIdentifier" && a.name.name === "src") {
      return true;
    }
    return false;
  });
}
var rule27 = {
  id: "astro-inline-script",
  severity: "warning",
  category: "performance",
  frameworks: ["astro"],
  check(ast, filePath, sourceLines) {
    if (!filePath.endsWith(".astro")) return [];
    const diagnostics = [];
    traverse(ast, (node) => {
      if (node.type !== "JSXOpeningElement") return;
      if (node.name.type !== "JSXIdentifier" || node.name.name !== "script") return;
      if (hasDefineVarsOrExternalSrc(node.attributes)) return;
      for (const attr of node.attributes) {
        if (attr.type === "JSXAttribute" && attr.name.type === "JSXNamespacedName" && attr.name.namespace.name === "is" && attr.name.name.name === "inline") {
          const line = attr.loc?.start.line ?? node.loc.start.line;
          const column = attr.loc?.start.column ?? node.loc.start.column;
          const component = detectComponent(node);
          diagnostics.push({
            ruleId: "astro-inline-script",
            severity: "warning",
            category: "performance",
            confidence: 0.75,
            message: "<script is:inline> disables Astro bundling, minification, and script deduplication",
            component,
            filePath,
            line,
            column,
            codeSnippet: getCodeSnippet(sourceLines, line),
            fix: `<!-- Remove is:inline so Astro bundles, tree-shakes, and deduplicates the script: -->
<script>
  // Runs once per page as a bundled ES module (even if component renders multiple times)
</script>

<!-- If you need frontmatter variables on the client, pass them via data-* attributes: -->
<div id="widget" data-api-url={apiUrl}></div>
<script>
  const url = document.getElementById('widget')?.dataset.apiUrl;
</script>`,
            suggestions: [
              "Standard <script> tags in Astro are automatically bundled, minified, and executed as deferred ES modules",
              "Use is:inline only when a script must execute synchronously in <head> before first paint (e.g. dark mode theme flash prevention)"
            ]
          });
        }
      }
    });
    return diagnostics;
  }
};
var astro_inline_script_default = rule27;

// src/rules/index.ts
var allRules = [
  fetch_in_effect_default,
  multiple_usestate_default,
  large_component_default,
  effect_set_state_default,
  effect_as_handler_default,
  index_as_key_default,
  a11y_autofocus_default,
  a11y_label_default,
  a11y_interactive_default,
  a11y_role_default,
  heavy_import_default,
  use_search_params_default,
  missing_use_client_default,
  img_not_optimized_default,
  inline_styles_default,
  no_console_log_default,
  flatlist_for_lists_default,
  rn_accessibility_default,
  constants_manifest_default,
  astro_v7_breaking_default,
  astro_legacy_content_config_default,
  astro_client_directive_on_html_default,
  astro_client_only_missing_framework_default,
  astro_hooks_in_astro_default,
  astro_client_load_overuse_default,
  astro_unsafe_set_html_default,
  astro_inline_script_default
];
var ruleMap = new Map(
  allRules.map((r) => [r.id, r])
);

// src/profiles.ts
var FRAMEWORK_LABELS = {
  react: "React",
  next: "Next.js",
  "react-native": "React Native",
  expo: "Expo",
  astro: "Astro"
};
var FRAMEWORK_DESCRIPTIONS = {
  react: "Create React App, Vite, etc.",
  next: "App Router / Pages Router",
  "react-native": "Bare workflow",
  expo: "Managed / Bare workflow",
  astro: "Islands, Content Layer, SSR / SSG (v5\u2013v7)"
};
function getRulesForFramework(framework) {
  if (!framework) return allRules;
  return allRules.filter((r) => r.frameworks.includes(framework));
}

// src/project-detector.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var ASTRO_CONFIG_FILES = [
  "astro.config.mjs",
  "astro.config.ts",
  "astro.config.mts",
  "astro.config.js",
  "astro.config.cjs"
];
function findProjectRoot(startPath) {
  let current = path2.resolve(startPath);
  try {
    const stat = fs2.statSync(current);
    if (!stat.isDirectory()) {
      current = path2.dirname(current);
    }
  } catch {
  }
  let dir = current;
  for (let i = 0; i < 5; i++) {
    if (fs2.existsSync(path2.join(dir, "package.json")) || ASTRO_CONFIG_FILES.some((cfg) => fs2.existsSync(path2.join(dir, cfg)))) {
      return dir;
    }
    const parent = path2.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return current;
}
function parseAstroVersion(raw) {
  if (raw === void 0 || raw === null) return void 0;
  const str = String(raw).trim();
  const match = str.match(/(\d+)/);
  if (!match) return void 0;
  const major = parseInt(match[1], 10);
  if (major <= 5) return 5;
  if (major === 6) return 6;
  return 7;
}
function detectProjectContext(targetPath, astroVersionOverride) {
  const projectRoot = findProjectRoot(targetPath);
  const pkgPath = path2.join(projectRoot, "package.json");
  let detectedFramework;
  let astroVersion = astroVersionOverride ?? 7;
  let astroVersionDetected = Boolean(astroVersionOverride);
  const hasAstroConfig = ASTRO_CONFIG_FILES.some(
    (cfg) => fs2.existsSync(path2.join(projectRoot, cfg))
  );
  if (fs2.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs2.readFileSync(pkgPath, "utf-8"));
      const deps = {
        ...pkg.devDependencies ?? {},
        ...pkg.dependencies ?? {}
      };
      if ("astro" in deps || hasAstroConfig) {
        detectedFramework = "astro";
        if (!astroVersionOverride && deps.astro) {
          const parsed = parseAstroVersion(deps.astro);
          if (parsed) {
            astroVersion = parsed;
            astroVersionDetected = true;
          }
        }
      } else if ("expo" in deps) {
        detectedFramework = "expo";
      } else if ("react-native" in deps) {
        detectedFramework = "react-native";
      } else if ("next" in deps) {
        detectedFramework = "next";
      } else if ("react" in deps) {
        detectedFramework = "react";
      }
    } catch {
      if (hasAstroConfig) {
        detectedFramework = "astro";
      }
    }
  } else if (hasAstroConfig) {
    detectedFramework = "astro";
  }
  return {
    detectedFramework,
    astroVersion,
    astroVersionDetected,
    projectRoot
  };
}

// src/scanner.ts
var BASE_GLOB_PATTERNS = ["**/*.tsx", "**/*.ts", "**/*.jsx", "**/*.js"];
var ASTRO_GLOB_PATTERNS = [
  "**/*.astro",
  "**/*.tsx",
  "**/*.ts",
  "**/*.jsx",
  "**/*.js",
  "**/astro.config.mjs",
  "**/astro.config.mts",
  "**/astro.config.cjs"
];
var IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.astro/**",
  "**/coverage/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.d.ts"
];
function dedup(diagnostics) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const d of diagnostics) {
    const key = `${d.ruleId}::${d.filePath}::${d.line}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(d);
    }
  }
  return result;
}
async function scan(options) {
  const { targetPath, framework, ruleId, ignore = [] } = options;
  const projectCtx = detectProjectContext(targetPath, options.astroVersion);
  const effectiveAstroVersion = options.astroVersion ?? projectCtx.astroVersion;
  const includeAstroFiles = framework === "astro" || !framework && projectCtx.detectedFramework === "astro" || Boolean(ruleId && ruleId.startsWith("astro-"));
  const rules = ruleId ? [ruleMap.get(ruleId)].filter(Boolean) : getRulesForFramework(framework);
  const globPatterns = includeAstroFiles ? ASTRO_GLOB_PATTERNS : BASE_GLOB_PATTERNS;
  const files = await (0, import_fast_glob.default)(globPatterns, {
    cwd: path3.resolve(targetPath),
    absolute: true,
    ignore: [...IGNORE_PATTERNS, ...ignore]
  });
  const diagnostics = [];
  const ruleContext = {
    framework,
    astroVersion: effectiveAstroVersion
  };
  for (const filePath of files) {
    const result = parseFile(filePath);
    if (isParseFailure(result)) {
      diagnostics.push({
        ruleId: "parse-error",
        severity: "warning",
        category: "correctness",
        confidence: 1,
        message: "File could not be parsed \u2014 syntax error or unsupported syntax",
        component: "unknown",
        filePath,
        line: result.parseError.line,
        column: 0,
        codeSnippet: [],
        fix: `// Check for syntax errors:
// ${result.parseError.message}`,
        suggestions: ["Check for missing brackets, invalid JSX, or unsupported syntax"]
      });
      continue;
    }
    if (!result) continue;
    const { ast, sourceLines } = result;
    for (const rule28 of rules) {
      const ruleDiagnostics = rule28.check(ast, filePath, sourceLines, ruleContext);
      diagnostics.push(...ruleDiagnostics);
    }
  }
  return {
    diagnostics: dedup(diagnostics),
    totalFiles: files.length,
    scannedFiles: files,
    astroVersion: framework === "astro" ? effectiveAstroVersion : void 0
  };
}
async function scanFile(filePath, framework, ruleId, astroVersion) {
  const rules = ruleId ? [ruleMap.get(ruleId)].filter(Boolean) : getRulesForFramework(framework);
  const result = parseFile(filePath);
  if (isParseFailure(result)) {
    return [{
      ruleId: "parse-error",
      severity: "warning",
      category: "correctness",
      confidence: 1,
      message: "File could not be parsed \u2014 syntax error or unsupported syntax",
      component: "unknown",
      filePath,
      line: result.parseError.line,
      column: 0,
      codeSnippet: [],
      fix: `// Check for syntax errors:
// ${result.parseError.message}`,
      suggestions: ["Check for missing brackets, invalid JSX, or unsupported syntax"]
    }];
  }
  if (!result) return [];
  const { ast, sourceLines } = result;
  const diagnostics = [];
  const ruleContext = {
    framework,
    astroVersion: astroVersion ?? 7
  };
  for (const rule28 of rules) {
    diagnostics.push(...rule28.check(ast, filePath, sourceLines, ruleContext));
  }
  return dedup(diagnostics);
}

// src/reporter.ts
var import_picocolors = __toESM(require("picocolors"));
var VERSION = "1.1.0";
var AUTO_GROUP_THRESHOLD = 20;
var MAX_LOCATIONS_SHOWN = 5;
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}
function scoreCat(score) {
  if (score >= 90) return "\u{1F638}";
  if (score >= 75) return "\u{1F63A}";
  if (score >= 50) return "\u{1F63E}";
  return "\u{1F640}";
}
function confidenceDots(confidence) {
  const filled = Math.round(confidence * 5);
  const empty = 5 - filled;
  return import_picocolors.default.yellow("\u25CF".repeat(filled)) + import_picocolors.default.dim("\u25CB".repeat(empty));
}
function categoryColor(cat) {
  switch (cat) {
    case "correctness":
      return import_picocolors.default.red;
    case "performance":
      return import_picocolors.default.yellow;
    case "best-practice":
      return import_picocolors.default.cyan;
    case "accessibility":
      return (s) => import_picocolors.default.bold(import_picocolors.default.magenta(s));
  }
}
function categoryLabel(cat) {
  return categoryColor(cat)(cat);
}
function groupByFile(diagnostics) {
  const map = /* @__PURE__ */ new Map();
  for (const d of diagnostics) {
    if (!map.has(d.filePath)) map.set(d.filePath, []);
    map.get(d.filePath).push(d);
  }
  return map;
}
function toRelPath(filePath) {
  return filePath.includes("/src/") ? filePath.substring(filePath.indexOf("/src/") + 1) : filePath;
}
function groupByRule(diagnostics) {
  const map = /* @__PURE__ */ new Map();
  for (const d of diagnostics) {
    if (!map.has(d.ruleId)) map.set(d.ruleId, []);
    map.get(d.ruleId).push(d);
  }
  const sorted = new Map(
    [...map.entries()].sort(([, a], [, b]) => {
      const aHasError = a.some((d) => d.severity === "error") ? 0 : 1;
      const bHasError = b.some((d) => d.severity === "error") ? 0 : 1;
      if (aHasError !== bHasError) return aHasError - bHasError;
      return b.length - a.length;
    })
  );
  return sorted;
}
var RULE_SUMMARY = {
  "fetch-in-effect": "fetch() inside useEffect \u2014 use a data fetching library instead",
  "multiple-usestate": "Multiple useState calls \u2014 consider useReducer or a state object",
  "effect-set-state": "Multiple setState calls inside useEffect \u2014 consider useReducer",
  "large-component": "Component too large \u2014 consider splitting into smaller components",
  "effect-as-handler": "useEffect used as an event handler \u2014 move logic into the handler",
  "index-as-key": "Array index used as key \u2014 use a stable unique ID instead",
  "heavy-import": "Heavy import detected \u2014 consider lazy loading or a lighter alternative",
  "img-not-optimized": "<img> tag \u2014 use Next.js <Image> for automatic optimization",
  "inline-styles": "Inline style object \u2014 use StyleSheet.create() for better performance",
  "a11y-label": "Form element has no accessible label \u2014 add aria-label or aria-labelledby",
  "a11y-autofocus": "autoFocus disrupts screen readers and keyboard navigation",
  "a11y-interactive": "Mouse handler without keyboard handler \u2014 add keyboard interaction",
  "a11y-role": "Event handler without role \u2014 add role for assistive technologies",
  "use-search-params": "useSearchParams() requires a Suspense boundary",
  "missing-use-client": 'Client hook used without "use client" directive',
  "constants-manifest": "Constants.manifest deprecated \u2014 use Constants.expoConfig",
  "no-console-log": "console statement in production code \u2014 remove or use a logger",
  "flatlist-for-lists": ".map() inside ScrollView \u2014 use FlatList for virtualization",
  "rn-accessibility": "No accessibilityLabel \u2014 screen readers cannot identify this element",
  "astro-v7-breaking": "Removed or deprecated Astro 6/7 API \u2014 update to Astro v7 syntax",
  "astro-legacy-content-config": "Legacy Content Collections config \u2014 migrate to src/content.config.ts with loader",
  "astro-client-directive-on-html": "client:* directive on native HTML element \u2014 use a UI component or <script>",
  "astro-client-only-missing-framework": 'client:only missing framework hint (e.g. client:only="react")',
  "astro-hooks-in-astro": "React hook called inside .astro file \u2014 move to a .tsx/.jsx island",
  "astro-client-load-overuse": "client:load hydrates immediately \u2014 prefer client:visible or client:idle",
  "astro-unsafe-set-html": "Dynamic set:html expression \u2014 sanitize HTML to prevent XSS",
  "astro-inline-script": "<script is:inline> opts out of Astro bundling and deduplication"
};
function normalizeMessage(ruleId, fallback) {
  if (ruleId === "img-not-optimized" && fallback) return fallback;
  return RULE_SUMMARY[ruleId] ?? fallback;
}
function printGroupedByRule(diagnostics) {
  const byRule = groupByRule(diagnostics);
  const totalRules = byRule.size;
  for (const [ruleId, reps] of byRule) {
    const rep = reps[0];
    const icon = rep.severity === "error" ? import_picocolors.default.red("\u2717") : import_picocolors.default.yellow("\u26A0");
    const cat = `[${categoryLabel(rep.category)}]`;
    const avgConf = reps.reduce((s, d) => s + d.confidence, 0) / reps.length;
    const dots = confidenceDots(avgConf);
    const countStr = import_picocolors.default.yellow(String(reps.length)) + ` occurrence${reps.length === 1 ? "" : "s"}`;
    console.log(`  ${icon}  ${import_picocolors.default.dim(ruleId)}  ${cat}  ${dots}  ${countStr}`);
    console.log(`     ${import_picocolors.default.bold(normalizeMessage(ruleId, rep.message))}`);
    console.log("");
    const fileMap = /* @__PURE__ */ new Map();
    for (const d of reps) {
      const relPath = toRelPath(d.filePath);
      if (!fileMap.has(relPath)) fileMap.set(relPath, []);
      fileMap.get(relPath).push(d.line);
    }
    const fileEntries = [...fileMap.entries()];
    console.log(`     ${import_picocolors.default.dim("Affected files:")}`);
    const shown = fileEntries.slice(0, MAX_LOCATIONS_SHOWN);
    for (const [fp, lines] of shown) {
      const lineStr = lines.map((l) => `line ${l}`).join(", ");
      console.log(`     ${import_picocolors.default.dim("\u203A")} ${import_picocolors.default.cyan(fp)}  ${import_picocolors.default.dim(lineStr)}`);
    }
    if (fileEntries.length > MAX_LOCATIONS_SHOWN) {
      console.log(`     ${import_picocolors.default.dim(`+ ${fileEntries.length - MAX_LOCATIONS_SHOWN} more files`)}`);
    }
    console.log("");
    console.log(`     ${import_picocolors.default.green("Fix")} ${"\u2500".repeat(50)}`);
    for (const line of rep.fix.split("\n")) {
      console.log(`     ${import_picocolors.default.green(line)}`);
    }
    if (rep.suggestions.length > 0) {
      console.log("");
      console.log(`     ${import_picocolors.default.cyan("Suggestions")}`);
      for (const s of rep.suggestions) {
        console.log(`     ${import_picocolors.default.dim("\u203A")} ${s}`);
      }
    }
    console.log("");
    console.log("  " + import_picocolors.default.dim("\u2500".repeat(60)));
    console.log("");
  }
  console.log(import_picocolors.default.dim(`  Grouped view: ${diagnostics.length} issues across ${totalRules} rules.`));
  console.log("");
}
function printCompactIssueList(diagnostics) {
  const byRule = groupByRule(diagnostics);
  for (const [, reps] of byRule) {
    const rep = reps[0];
    const icon = rep.severity === "error" ? import_picocolors.default.red("\u2717") : import_picocolors.default.yellow("\u26A0");
    const msg = normalizeMessage(rep.ruleId, rep.message);
    const count = reps.length > 1 ? import_picocolors.default.dim(`(${reps.length})`) : "";
    console.log(`  ${icon}  ${import_picocolors.default.bold(msg)}  ${count}`);
    const fixHint = stripAnsi(rep.fix).split("\n").find((l) => l.trim()) ?? "";
    console.log(`     ${import_picocolors.default.dim(fixHint)}`);
    console.log("");
  }
}
function buildAiPrompt(diagnostics, framework, score, totalFiles, options) {
  const maxIssues = options?.maxIssues ?? 0;
  const visible = maxIssues > 0 ? diagnostics.slice(0, maxIssues) : diagnostics;
  const truncated = visible.length < diagnostics.length;
  const fwLabel = framework ? FRAMEWORK_LABELS[framework] : "React";
  const errors = visible.filter((d) => d.severity === "error");
  const warnings = visible.filter((d) => d.severity === "warning");
  const affectedFiles = new Set(visible.map((d) => d.filePath)).size;
  const lines = [];
  lines.push("# codehealth AI Refactoring Prompt");
  lines.push("");
  lines.push("## Project Context");
  lines.push(`- **Framework:** ${fwLabel}`);
  lines.push(`- **Files scanned:** ${totalFiles}`);
  lines.push(`- **Health score:** ${score.score} / 100 (${score.label})`);
  lines.push(`- **Issues found:** ${score.errors} ${score.errors === 1 ? "error" : "errors"}, ${score.warnings} ${score.warnings === 1 ? "warning" : "warnings"} across ${affectedFiles} files`);
  if (truncated) {
    lines.push(`- **Note:** Showing first ${visible.length} of ${diagnostics.length} issues`);
  }
  lines.push("");
  function renderGroup(group) {
    const out = [];
    const byRule = groupByRule(group);
    for (const [ruleId, reps] of byRule) {
      const rep = reps[0];
      const summary = normalizeMessage(ruleId, rep.message);
      out.push(`### \`${ruleId}\` \u2014 ${summary}`);
      out.push(`**Category:** ${rep.category} | **Occurrences:** ${reps.length}`);
      out.push("");
      out.push("**Affected locations:**");
      const fileMap = /* @__PURE__ */ new Map();
      for (const d of reps) {
        const relPath = toRelPath(d.filePath);
        if (!fileMap.has(relPath)) fileMap.set(relPath, []);
        fileMap.get(relPath).push(d.line);
      }
      const fileEntries = [...fileMap.entries()];
      const shownEntries = fileEntries.slice(0, MAX_LOCATIONS_SHOWN);
      for (const [fp, ls] of shownEntries) {
        const lineStr = ls.map((l) => `line ${l}`).join(", ");
        out.push(`- \`${fp}\` ${lineStr}`);
      }
      if (fileEntries.length > MAX_LOCATIONS_SHOWN) {
        out.push(`- _+ ${fileEntries.length - MAX_LOCATIONS_SHOWN} more files_`);
      }
      out.push("");
      if (rep.codeSnippet.length > 0 && rep.severity === "error") {
        out.push("**Code context (first occurrence):**");
        out.push("```tsx");
        for (const l of rep.codeSnippet) {
          out.push(stripAnsi(l));
        }
        out.push("```");
        out.push("");
      }
      out.push("**Suggested fix:**");
      out.push("```tsx");
      out.push(stripAnsi(rep.fix));
      out.push("```");
      out.push("");
      if (rep.suggestions.length > 0) {
        out.push("**Additional notes:**");
        for (const s of rep.suggestions) {
          out.push(`- ${stripAnsi(s)}`);
        }
        out.push("");
      }
      out.push("---");
      out.push("");
    }
    return out;
  }
  if (errors.length > 0) {
    lines.push(`## Errors (${errors.length})`);
    lines.push("These issues are likely to cause runtime failures or incorrect behavior.");
    lines.push("");
    lines.push(...renderGroup(errors));
  }
  if (warnings.length > 0) {
    lines.push(`## Warnings (${warnings.length})`);
    lines.push("These issues represent code quality, performance, or accessibility improvements.");
    lines.push("");
    lines.push(...renderGroup(warnings));
  }
  lines.push("---");
  lines.push("");
  lines.push("## Instructions for AI");
  lines.push("Review each rule group: explain why it is problematic, show a concrete fix from the first affected file.");
  return lines.join("\n");
}
function printAiPrompt(diagnostics, framework, score, totalFiles, options) {
  process.stdout.write(buildAiPrompt(diagnostics, framework, score, totalFiles, options) + "\n");
}
function printHeader(fileCount, framework) {
  const fwLabel = framework ? ` \xB7 ${FRAMEWORK_LABELS[framework]}` : "";
  console.log(
    import_picocolors.default.bold(`codehealth v${VERSION}`) + import_picocolors.default.dim(fwLabel) + import_picocolors.default.dim(` \xB7 ${fileCount} files scanned`)
  );
  console.log("");
}
function printDiagnostic(diag) {
  const icon = diag.severity === "error" ? import_picocolors.default.red("\u2717") : import_picocolors.default.yellow("\u26A0");
  const loc = import_picocolors.default.dim(`${diag.line}:${diag.column}`);
  const rule28 = import_picocolors.default.dim(diag.ruleId);
  const cat = `[${categoryLabel(diag.category)}]`;
  const dots = confidenceDots(diag.confidence);
  console.log(`  ${icon}  ${loc}  ${rule28}  ${cat}  ${dots}`);
  console.log(`     ${import_picocolors.default.bold(diag.message)}`);
  console.log("");
  for (const line of diag.codeSnippet) {
    if (line.startsWith("\u25B6")) {
      console.log("  " + import_picocolors.default.yellow(line));
    } else {
      console.log("  " + import_picocolors.default.dim(line));
    }
  }
  if (diag.codeSnippet.length > 0) console.log("");
  console.log(`     ${import_picocolors.default.green("Fix")} ${"\u2500".repeat(50)}`);
  for (const line of diag.fix.split("\n")) {
    console.log(`     ${import_picocolors.default.green(line)}`);
  }
  if (diag.suggestions.length > 0) {
    console.log("");
    console.log(`     ${import_picocolors.default.cyan("Suggestions")}`);
    for (const s of diag.suggestions) {
      console.log(`     ${import_picocolors.default.dim("\u203A")} ${s}`);
    }
  }
  console.log("");
}
function printCompactDiagnostic(diag) {
  const icon = diag.severity === "error" ? import_picocolors.default.red("\u2717") : import_picocolors.default.yellow("\u26A0");
  console.log(`  ${icon}  ${import_picocolors.default.dim(`${diag.line}:${diag.column}`)}  ${import_picocolors.default.dim(diag.ruleId)}  [${categoryLabel(diag.category)}]  ${confidenceDots(diag.confidence)}`);
  console.log(`     ${import_picocolors.default.dim(diag.message)}`);
}
function printDiagnostics(diagnostics, framework, options) {
  if (diagnostics.length === 0) return;
  console.log("");
  console.log(import_picocolors.default.bold(`  ${"\u2500".repeat(4)} Detailed fixes ${"\u2500".repeat(4)}`));
  console.log("");
  const maxIssues = options?.maxIssues ?? 0;
  const compact = options?.compact ?? false;
  const totalCount = diagnostics.length;
  const visible = maxIssues > 0 ? diagnostics.slice(0, maxIssues) : diagnostics;
  if (visible.length >= AUTO_GROUP_THRESHOLD) {
    printGroupedByRule(visible);
    if (maxIssues > 0 && totalCount > maxIssues) {
      console.log(import_picocolors.default.dim(`  Showing ${maxIssues} of ${totalCount} issues. Use --max-issues 0 to see all.`));
      console.log("");
    }
    return;
  }
  const byFile = groupByFile(visible);
  for (const [filePath, fileDiags] of byFile) {
    const issueWord = fileDiags.length === 1 ? "issue" : "issues";
    const relPath = toRelPath(filePath);
    const header = `  ${import_picocolors.default.cyan(relPath)}   ${import_picocolors.default.yellow(String(fileDiags.length))} ${issueWord}`;
    console.log(header);
    console.log("  " + import_picocolors.default.dim("\u2500".repeat(Math.max(60, stripAnsi(header).length - 2))));
    console.log("");
    for (const diag of fileDiags) {
      if (compact) {
        printCompactDiagnostic(diag);
      } else {
        printDiagnostic(diag);
      }
    }
    console.log("  " + import_picocolors.default.dim("\u2500".repeat(60)));
    console.log("");
  }
  if (maxIssues > 0 && totalCount > maxIssues) {
    console.log(import_picocolors.default.dim(`  Showing ${maxIssues} of ${totalCount} issues. Use --max-issues 0 to see all.`));
    console.log("");
  }
}
function printSummary(result) {
  const { score, label, errors, warnings, affectedFiles, totalFiles, byCategory } = result;
  const BOX_WIDTH = 63;
  const BAR_WIDTH = 50;
  const filled = Math.round(score / 100 * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  let scoreColor;
  if (score >= 90) scoreColor = import_picocolors.default.green;
  else if (score >= 75) scoreColor = import_picocolors.default.cyan;
  else if (score >= 60) scoreColor = import_picocolors.default.yellow;
  else scoreColor = import_picocolors.default.red;
  const bar = scoreColor("\u2588".repeat(filled)) + import_picocolors.default.dim("\u2591".repeat(empty));
  const errStr = errors > 0 ? import_picocolors.default.red(`\u2717 ${errors} ${errors === 1 ? "error" : "errors"}`) : import_picocolors.default.dim("\u2717 0 errors");
  const warnStr = warnings > 0 ? import_picocolors.default.yellow(`\u26A0 ${warnings} ${warnings === 1 ? "warning" : "warnings"}`) : import_picocolors.default.dim("\u26A0 0 warnings");
  const fileStr = import_picocolors.default.dim(`in ${affectedFiles}/${totalFiles} files`);
  const border = "\u2500".repeat(BOX_WIDTH);
  const pad = (s, target) => s + " ".repeat(Math.max(0, target - stripAnsi(s).length));
  const scoreLine = `  ${scoreColor(import_picocolors.default.bold(`${score} / 100`))}  ${import_picocolors.default.dim(label)}`;
  const statsLine = `  ${errStr}   ${warnStr}   ${fileStr}`;
  const cats = ["correctness", "performance", "best-practice", "accessibility"];
  const catEntries = cats.map((cat) => {
    const count = byCategory[cat];
    const dots = count > 0 ? categoryColor(cat)("\u25CF".repeat(Math.min(count, 5))) : import_picocolors.default.dim("\u25CB");
    return `${import_picocolors.default.dim(cat)}  ${dots}  ${count > 0 ? categoryColor(cat)(String(count)) : import_picocolors.default.dim("0")}`;
  });
  const catLine1 = `  ${pad(catEntries[0], 32)}  ${catEntries[2]}`;
  const catLine2 = `  ${pad(catEntries[1], 32)}  ${catEntries[3]}`;
  function boxLine(content) {
    const raw = stripAnsi(content);
    const padding = Math.max(0, BOX_WIDTH - raw.length - 2);
    return import_picocolors.default.dim("\u2502") + content + " ".repeat(padding) + import_picocolors.default.dim("\u2502");
  }
  console.log(import_picocolors.default.dim("\u250C" + border + "\u2510"));
  console.log(boxLine(`  ${import_picocolors.default.bold("codehealth")}${" ".repeat(BOX_WIDTH - 14)}${scoreColor(import_picocolors.default.bold(`${score} / 100`))}  ${import_picocolors.default.dim(label)}`));
  console.log(boxLine("  " + bar));
  console.log(import_picocolors.default.dim("\u2502") + " ".repeat(BOX_WIDTH + 2) + import_picocolors.default.dim("\u2502"));
  console.log(boxLine(statsLine));
  console.log(import_picocolors.default.dim("\u2502") + " ".repeat(BOX_WIDTH + 2) + import_picocolors.default.dim("\u2502"));
  console.log(boxLine(catLine1));
  console.log(boxLine(catLine2));
  console.log(import_picocolors.default.dim("\u2514" + border + "\u2518"));
}
function printNoIssues(totalFiles) {
  console.log(import_picocolors.default.green("\u2713") + ` No issues found in ${totalFiles} files.
`);
}
function printOverview(diagnostics, framework, score) {
  const fwLabel = framework ? `  ${FRAMEWORK_LABELS[framework]}` : "";
  console.log("");
  console.log(`  ${import_picocolors.default.bold("codehealth")}${import_picocolors.default.dim(fwLabel)}  ${import_picocolors.default.dim("\xB7")}  ${import_picocolors.default.dim(`${score.totalFiles} files scanned`)}`);
  console.log("");
  const categoryOrder = ["correctness", "performance", "best-practice", "accessibility"];
  const byCat = /* @__PURE__ */ new Map();
  for (const d of diagnostics) {
    if (!byCat.has(d.category)) byCat.set(d.category, []);
    byCat.get(d.category).push(d);
  }
  for (const cat of categoryOrder) {
    const catDiags = byCat.get(cat);
    if (!catDiags || catDiags.length === 0) continue;
    const color = categoryColor(cat);
    const countStr = String(catDiags.length);
    const labelPart = `\u2500\u2500 ${cat} `;
    const rightPart = ` ${countStr} \u2500\u2500`;
    const LINE_WIDTH = 50;
    const fillCount = Math.max(0, LINE_WIDTH - labelPart.length - rightPart.length);
    console.log(`  ${color(labelPart)}${import_picocolors.default.dim("\u2500".repeat(fillCount) + rightPart)}`);
    const byRule = groupByRule(catDiags);
    for (const [ruleId, reps] of byRule) {
      const icon = reps[0].severity === "error" ? import_picocolors.default.red("\u2717") : import_picocolors.default.yellow("\u26A0");
      const countCol = import_picocolors.default.dim(`${reps.length}\xD7`);
      const ruleCol = ruleId.padEnd(28);
      console.log(`   ${icon}  ${ruleCol}  ${countCol}`);
      const hint = stripAnsi(normalizeMessage(ruleId, reps[0].message));
      const truncated = hint.length > 52 ? hint.slice(0, 49) + "..." : hint;
      console.log(`      ${import_picocolors.default.dim(truncated)}`);
    }
    console.log("");
  }
  const { score: s, label, errors, warnings, totalFiles } = score;
  let scoreColor;
  if (s >= 90) scoreColor = import_picocolors.default.green;
  else if (s >= 75) scoreColor = import_picocolors.default.cyan;
  else if (s >= 60) scoreColor = import_picocolors.default.yellow;
  else scoreColor = import_picocolors.default.red;
  const sep = import_picocolors.default.dim("\u254C".repeat(52));
  const errPart = errors > 0 ? import_picocolors.default.red(`\u2717 ${errors}`) : import_picocolors.default.dim(`\u2717 0`);
  const warnPart = warnings > 0 ? import_picocolors.default.yellow(`\u26A0 ${warnings}`) : import_picocolors.default.dim(`\u26A0 0`);
  console.log(`  ${sep}`);
  console.log(`    ${scoreColor(import_picocolors.default.bold(`${s} / 100`))}  ${import_picocolors.default.dim(label)}  ${scoreCat(s)}  \xB7  ${errPart}  \xB7  ${warnPart}  \xB7  ${import_picocolors.default.dim(`${totalFiles} files`)}`);
  console.log(`  ${sep}`);
  console.log("");
}
function printAiPromptTerminal(diagnostics, _framework, _score) {
  const BOX_INNER = 64;
  console.log("");
  console.log(import_picocolors.default.bold(`  ${"\u2500".repeat(4)} AI Refactoring ${"\u2500".repeat(4)}`));
  console.log("");
  const byCat = /* @__PURE__ */ new Map();
  for (const d of diagnostics) {
    if (!byCat.has(d.category)) byCat.set(d.category, []);
    byCat.get(d.category).push(d);
  }
  const categoryOrder = ["correctness", "performance", "best-practice", "accessibility"];
  for (const cat of categoryOrder) {
    const catDiags = byCat.get(cat);
    if (!catDiags || catDiags.length === 0) continue;
    const color = categoryColor(cat);
    const countStr = String(catDiags.length);
    const leftPart = `\u2550\u2550 ${cat} \u2550\u2550`;
    const rightPart = ` ${countStr} \u2550\u2550`;
    const fillCount = Math.max(0, BOX_INNER - leftPart.length - rightPart.length);
    console.log(
      `  ${import_picocolors.default.dim("\u2554\u2550\u2550 ")}${color(cat)}${import_picocolors.default.dim(` \u2550\u2550${"\u2550".repeat(fillCount)} ${countStr} \u2550\u2550\u2557`)}`
    );
    console.log("");
    const byRule = groupByRule(catDiags);
    for (const [ruleId, reps] of byRule) {
      const rep = reps[0];
      const msg = normalizeMessage(ruleId, rep.message);
      console.log(`   ${import_picocolors.default.bold(ruleId)}`);
      console.log(`   ${msg}`);
      console.log("");
      const fileList = [];
      const seen = /* @__PURE__ */ new Set();
      for (const d of reps) {
        const basename2 = d.filePath.split("/").pop() ?? d.filePath;
        if (!seen.has(basename2)) {
          seen.add(basename2);
          fileList.push(basename2);
        }
      }
      const shownFiles = fileList.slice(0, 5);
      const moreCount = fileList.length - shownFiles.length;
      const filesStr = shownFiles.map((f) => import_picocolors.default.cyan(f)).join(import_picocolors.default.dim(" \xB7 "));
      console.log(`   ${import_picocolors.default.dim("Files")}  ${filesStr}`);
      if (moreCount > 0) {
        console.log(`          ${import_picocolors.default.dim(`+${moreCount} more files`)}`);
      }
      console.log("");
      const fixWidth = BOX_INNER - 2;
      const fixLines = stripAnsi(rep.fix).split("\n");
      console.log(`   ${import_picocolors.default.green("Fix")}`);
      console.log(`   ${import_picocolors.default.green("\u250C" + "\u2500".repeat(fixWidth))}`);
      for (const line of fixLines) {
        console.log(`   ${import_picocolors.default.green("\u2502")} ${line}`);
      }
      console.log(`   ${import_picocolors.default.green("\u2514" + "\u2500".repeat(fixWidth))}`);
      console.log("");
    }
    console.log(`  ${import_picocolors.default.dim("\u255A" + "\u2550".repeat(BOX_INNER) + "\u255D")}`);
    console.log("");
  }
}

// src/scorer.ts
function computeScore(diagnostics, totalFiles) {
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  const affectedFiles = new Set(diagnostics.map((d) => d.filePath)).size;
  let penalty = 0;
  for (const d of diagnostics) {
    if (d.severity === "error") {
      penalty += d.confidence * 5;
    } else {
      penalty += d.confidence * 1;
    }
  }
  const score = Math.max(0, Math.round(100 - penalty));
  let label;
  if (score >= 90) label = "Excellent";
  else if (score >= 75) label = "Great";
  else if (score >= 60) label = "Good";
  else if (score >= 40) label = "Fair";
  else label = "Needs work";
  const byCategory = {
    correctness: 0,
    performance: 0,
    "best-practice": 0,
    accessibility: 0
  };
  for (const d of diagnostics) {
    byCategory[d.category]++;
  }
  return { score, label, errors, warnings, affectedFiles, totalFiles, byCategory };
}

// src/watcher.ts
var import_chokidar = __toESM(require("chokidar"));
var path4 = __toESM(require("path"));
var WATCH_EXTENSIONS = /\.(tsx?|jsx?|astro|mjs|mts|cjs)$/;
function startWatch(options) {
  const { targetPath, framework, astroVersion, ruleId, ignore = [], allDiagnostics, totalFiles } = options;
  const ignoredPatterns = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/.astro/**",
    "**/coverage/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/*.d.ts",
    ...ignore
  ];
  const watcher = import_chokidar.default.watch(path4.resolve(targetPath), {
    ignored: ignoredPatterns,
    persistent: true,
    ignoreInitial: true
  });
  watcher.on("error", (err) => {
    if (err.code === "EMFILE") {
      console.error("\n[codehealth] EMFILE: too many open files.");
      console.error("Fix: brew install watchman");
      console.error("     (chokidar uses watchman automatically once installed)\n");
      process.exit(1);
    }
    console.error("[codehealth] Watcher error:", err.message);
  });
  async function handleChange(filePath) {
    if (!WATCH_EXTENSIONS.test(filePath)) return;
    const newDiagnostics = await scanFile(filePath, framework, ruleId, astroVersion);
    if (newDiagnostics.length === 0) {
      allDiagnostics.delete(filePath);
    } else {
      allDiagnostics.set(filePath, newDiagnostics);
    }
    process.stdout.write("\x1Bc");
    const all = Array.from(allDiagnostics.values()).flat();
    if (all.length > 0) {
      printDiagnostics(all, framework);
    }
    const score = computeScore(all, totalFiles);
    printSummary(score);
    console.log("\n" + dim("Watching for changes..."));
  }
  watcher.on("change", handleChange);
  watcher.on("add", handleChange);
  return watcher;
}
function dim(s) {
  return `\x1B[2m${s}\x1B[0m`;
}

// src/prompt.ts
var readline = __toESM(require("readline"));
var import_picocolors2 = __toESM(require("picocolors"));
var NEXT_ACTIONS = [
  { value: "overview", label: "Overview & score" },
  { value: "fixes", label: "Detailed fixes" },
  { value: "ai-prompt", label: "AI refactoring view" },
  { value: "skip", label: "Exit" }
];
async function promptNextAction() {
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;
  if (!isTTY) return "skip";
  let selected = 0;
  function renderMenu() {
    process.stdout.write(
      `  ${import_picocolors2.default.bold("What would you like to do?")}  ${import_picocolors2.default.dim("(\u2191\u2193 arrow keys, Enter to confirm)")}

`
    );
    for (let i = 0; i < NEXT_ACTIONS.length; i++) {
      const { label } = NEXT_ACTIONS[i];
      const isActive = i === selected;
      const cursor = isActive ? import_picocolors2.default.cyan("\u276F") : " ";
      const text = isActive ? import_picocolors2.default.cyan(import_picocolors2.default.bold(label)) : label;
      process.stdout.write(`  ${cursor} ${text}
`);
    }
  }
  function clearMenu() {
    const lines = NEXT_ACTIONS.length + 2;
    for (let i = 0; i < lines; i++) {
      process.stdout.write("\x1B[1A\x1B[2K");
    }
  }
  return new Promise((resolve5) => {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdout.write("\n");
    renderMenu();
    function onKey(_, key) {
      if (!key) return;
      if (key.name === "up") {
        selected = (selected - 1 + NEXT_ACTIONS.length) % NEXT_ACTIONS.length;
        clearMenu();
        renderMenu();
      } else if (key.name === "down") {
        selected = (selected + 1) % NEXT_ACTIONS.length;
        clearMenu();
        renderMenu();
      } else if (key.name === "return") {
        process.stdin.setRawMode(false);
        process.stdin.removeListener("keypress", onKey);
        clearMenu();
        const chosen = NEXT_ACTIONS[selected];
        process.stdout.write(`
  ${import_picocolors2.default.green("\u2713")} ${import_picocolors2.default.cyan(import_picocolors2.default.bold(chosen.label))}

`);
        resolve5(chosen.value);
      } else if (key.ctrl && key.name === "c") {
        process.stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(0);
      }
    }
    process.stdin.on("keypress", onKey);
  });
}
var FRAMEWORKS = ["react", "next", "react-native", "expo", "astro"];
async function promptFramework(projectCtx) {
  const detected = projectCtx?.detectedFramework;
  let selected = detected ? Math.max(0, FRAMEWORKS.indexOf(detected)) : 0;
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;
  if (!isTTY) {
    if (detected) {
      return detected;
    }
    console.error(
      "No framework specified. Use --react, --next, --react-native, --expo, or --astro."
    );
    process.exit(1);
  }
  function renderMenu() {
    process.stdout.write("\n");
    process.stdout.write(
      `  ${import_picocolors2.default.bold("Select your framework:")}  ${import_picocolors2.default.dim("(\u2191\u2193 arrow keys, Enter to confirm)")}

`
    );
    for (let i = 0; i < FRAMEWORKS.length; i++) {
      const fw = FRAMEWORKS[i];
      const isActive = i === selected;
      const isDetected = fw === detected;
      const cursor = isActive ? import_picocolors2.default.cyan("\u276F") : " ";
      const baseLabel = FRAMEWORK_LABELS[fw];
      const label = isActive ? import_picocolors2.default.cyan(import_picocolors2.default.bold(baseLabel)) : baseLabel;
      const detectedBadge = isDetected ? fw === "astro" && projectCtx?.astroVersionDetected ? import_picocolors2.default.green(` (detected \xB7 v${projectCtx.astroVersion})`) : import_picocolors2.default.green(" (detected)") : "";
      const desc = import_picocolors2.default.dim(FRAMEWORK_DESCRIPTIONS[fw]);
      process.stdout.write(`  ${cursor} ${label.padEnd(isActive ? 22 : 14)}  ${desc}${detectedBadge}
`);
    }
  }
  function clearMenu() {
    const lines = FRAMEWORKS.length + 3;
    for (let i = 0; i < lines; i++) {
      process.stdout.write("\x1B[1A\x1B[2K");
    }
  }
  return new Promise((resolve5) => {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    renderMenu();
    function onKey(_, key) {
      if (!key) return;
      if (key.name === "up") {
        selected = (selected - 1 + FRAMEWORKS.length) % FRAMEWORKS.length;
        clearMenu();
        renderMenu();
      } else if (key.name === "down") {
        selected = (selected + 1) % FRAMEWORKS.length;
        clearMenu();
        renderMenu();
      } else if (key.name === "return") {
        process.stdin.setRawMode(false);
        process.stdin.removeListener("keypress", onKey);
        clearMenu();
        const chosen = FRAMEWORKS[selected];
        process.stdout.write(
          `
  ${import_picocolors2.default.green("\u2713")} Framework: ${import_picocolors2.default.cyan(import_picocolors2.default.bold(FRAMEWORK_LABELS[chosen]))}

`
        );
        resolve5(chosen);
      } else if (key.ctrl && key.name === "c") {
        process.stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(0);
      }
    }
    process.stdin.on("keypress", onKey);
  });
}

// src/cli.ts
var program = new import_commander.Command();
program.name("codehealth-mali").description("Framework-aware React & Astro code scanner with diagnostics and fix snippets").version("1.2.0").argument("[path]", "Path to scan (directory or file)", ".").option("--react", "Scan as a React project (CRA, Vite, etc.)").option("--next", "Scan as a Next.js project (App Router / Pages)").option("--react-native", "Scan as a React Native project").option("--expo", "Scan as an Expo project").option("--astro", "Scan as an Astro project (.astro + React islands)").option("--astro-version <version>", "Target Astro major version (5, 6, or 7)").option("-w, --watch", "Watch mode \u2014 re-scan on file changes").option("-r, --rule <ruleId>", "Run only a specific rule").option("--ignore <pattern>", "Glob pattern to ignore (can be repeated)", collect, []).option("--list-rules", "List all available rules (optionally filtered by framework flag)").option("--max-issues <n>", "Show only first N issues (0 = all)", "0").option("--compact", "Show file headers only, no code snippets or fix details").option("--ai-prompt", "Output a plain-text AI prompt for refactoring assistance").action(async (targetPath, options) => {
  let framework;
  if (options.react) framework = "react";
  else if (options.next) framework = "next";
  else if (options.reactNative) framework = "react-native";
  else if (options.expo) framework = "expo";
  else if (options.astro) framework = "astro";
  const astroVersionOverride = parseAstroVersion(options.astroVersion);
  if (options.listRules) {
    const rules = getRulesForFramework(framework);
    const header = framework ? `Rules for ${FRAMEWORK_LABELS[framework]}:` : "All available rules (use --react / --next / --react-native / --expo / --astro to filter):";
    console.log(`
${header}
`);
    for (const rule28 of rules) {
      const icon = rule28.severity === "error" ? "\u2717" : "\u26A0";
      const fws = rule28.frameworks.join(", ");
      console.log(`  ${icon} ${rule28.id.padEnd(36)} [${rule28.severity.padEnd(7)}]  [${rule28.category.padEnd(14)}]  ${fws}`);
    }
    console.log("");
    process.exit(0);
  }
  if (options.rule && !ruleMap.has(options.rule)) {
    console.error(`Unknown rule: "${options.rule}"`);
    console.error(`Run with --list-rules to see available rules.`);
    process.exit(1);
  }
  const resolvedPath = path5.resolve(process.cwd(), targetPath);
  const projectCtx = detectProjectContext(resolvedPath, astroVersionOverride);
  if (!framework && !options.rule) {
    framework = await promptFramework(projectCtx);
  }
  const { diagnostics, totalFiles } = await scan({
    targetPath: resolvedPath,
    framework,
    astroVersion: projectCtx.astroVersion,
    ruleId: options.rule,
    ignore: options.ignore
  });
  const score = computeScore(diagnostics, totalFiles);
  const maxIssues = parseInt(options.maxIssues, 10);
  if (options.aiPrompt) {
    if (diagnostics.length === 0) {
      console.log(`# No issues found \u2014 score: ${score.score}/100`);
    } else {
      printAiPrompt(diagnostics, framework, score, totalFiles, { maxIssues });
    }
  } else {
    const isTTY = process.stdin.isTTY && process.stdout.isTTY;
    if (isTTY && !options.compact && !options.watch && diagnostics.length > 0) {
      printOverview(diagnostics, framework, score);
      printSummary(score);
      let action = await promptNextAction();
      while (action !== "skip") {
        process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
        if (action === "overview") {
          printOverview(diagnostics, framework, score);
          printSummary(score);
        } else if (action === "fixes") {
          printDiagnostics(diagnostics, framework, { maxIssues, compact: false });
        } else if (action === "ai-prompt") {
          printAiPromptTerminal(diagnostics, framework, score);
        }
        action = await promptNextAction();
      }
      process.stdin.pause();
    } else {
      printHeader(totalFiles, framework);
      if (diagnostics.length > 0) {
        printCompactIssueList(diagnostics);
      } else {
        printNoIssues(totalFiles);
      }
      printSummary(score);
    }
  }
  if (options.watch) {
    console.log("\nWatching for changes...\n");
    const diagMap = /* @__PURE__ */ new Map();
    for (const diag of diagnostics) {
      if (!diagMap.has(diag.filePath)) diagMap.set(diag.filePath, []);
      diagMap.get(diag.filePath).push(diag);
    }
    startWatch({
      targetPath: resolvedPath,
      framework,
      astroVersion: projectCtx.astroVersion,
      ruleId: options.rule,
      ignore: options.ignore,
      allDiagnostics: diagMap,
      totalFiles
    });
  } else {
    if (!options.aiPrompt && score.errors > 0) {
      process.exit(1);
    }
  }
});
function collect(value, previous) {
  return previous.concat([value]);
}
program.parse(process.argv);
