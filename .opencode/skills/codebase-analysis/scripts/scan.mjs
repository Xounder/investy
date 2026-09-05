#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
const OUTPUT_DIR = path.join(SKILL_DIR, 'output');

const SCAN_MODES = {
  implementation: {
    label: 'Implementation',
    includeDirs: [
      'apps/web/src',
      'apps/api/src',
      'packages/shared/src',
      'packages/domain/src',
      'packages/calendar/src',
      'packages/ui/src',
    ],
    extensions: ['.ts', '.tsx'],
    excludePatterns: [
      /node_modules/,
      /\.test\.(ts|tsx)$/,
      /\.spec\.(ts|tsx)$/,
      /\.d\.ts$/,
      /dist\//,
      /\.opencode\//,
    ],
    includeDotDirs: false,
  },
  docs: {
    label: 'Documentation',
    includeDirs: ['.opencode'],
    extensions: ['.md', '.mdx', '.txt', '.json', '.yaml', '.yml'],
    excludePatterns: [
      /node_modules/,
      /dist\//,
      /\.opencode\/plan\//,
    ],
    includeDotDirs: true,
  },
};

let isLoaded = false;
let tsParser = null;
let tsxParser = null;

async function loadTreeSitter() {
  try {
    const Parser = (await import('tree-sitter')).default;
    const tsModule = await import('tree-sitter-typescript');

    const tsLang = tsModule.typescript || tsModule.TypeScript || tsModule.default;
    const language = tsLang && tsLang.typescript ? tsLang : { typescript: tsLang, tsx: null };

    const parser = new Parser();
    parser.setLanguage(language.typescript);
    tsParser = parser;

    if (language.tsx) {
      const tsxParser_ = new Parser();
      tsxParser_.setLanguage(language.tsx);
      tsxParser = tsxParser_;
    }

    isLoaded = true;
    return true;
  } catch {
    return false;
  }
}

function findFiles(dir, results, baseRel, extensions, excludePatterns, includeDotDirs) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const rel = path.join(baseRel, entry.name).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (!includeDotDirs && entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      findFiles(fullPath, results, rel, extensions, excludePatterns, includeDotDirs);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!extensions.includes(ext)) continue;
      const shouldExclude = excludePatterns.some(p => p.test(rel));
      if (!shouldExclude) {
        results.push({ absPath: fullPath, relPath: rel.replace(/\\/g, '/') });
      }
    }
  }
}

function extractWithTreeSitter(source, ext) {
  const parser = ext === '.tsx' && tsxParser ? tsxParser : tsParser;
  const tree = parser.parse(source);
  const root = tree.rootNode;

  const result = { imports: [], exports: [], declarations: [] };

  function getText(n) {
    return n ? source.slice(n.startIndex, n.endIndex) : '';
  }

  function isExported(node) {
    let p = node.parent;
    while (p) {
      if (p.type === 'export_statement') return true;
      if (p.type === 'program') break;
      p = p.parent;
    }
    return false;
  }

  function hasChildType(node, type) {
    for (let i = 0; i < node.childCount; i++) {
      if (node.child(i).type === type) return true;
    }
    return false;
  }

  function findChildByType(node, type) {
    for (let i = 0; i < node.childCount; i++) {
      if (node.child(i).type === type) return node.child(i);
    }
    return null;
  }

  function countRealParams(paramsNode) {
    if (!paramsNode) return 0;
    let count = 0;
    for (let i = 0; i < paramsNode.childCount; i++) {
      const c = paramsNode.child(i);
      const t = c.type;
      if (t === 'required_parameter' || t === 'optional_parameter' ||
          t === 'rest_pattern' || t === 'identifier' ||
          t === 'object_pattern' || t === 'array_pattern' ||
          t === 'assignment_pattern') {
        count++;
      }
    }
    return count;
  }

  function hasJsxInSubtree(node) {
    if (!node) return false;
    const t = node.type;
    if (t === 'jsx_element' || t === 'jsx_self_closing_element' ||
        t === 'jsx_fragment' || t === 'jsx_expression') {
      return true;
    }
    for (let i = 0; i < node.childCount; i++) {
      if (hasJsxInSubtree(node.child(i))) return true;
    }
    return false;
  }

  function walk(node) {
    if (!node) return;

    switch (node.type) {
      case 'import_statement': {
        const sourceNode = node.childForFieldName('source');
        if (!sourceNode) break;
        const module = getText(sourceNode).replace(/['"]/g, '');
        let defaultName = null;
        const named = [];

        for (let i = 0; i < node.childCount; i++) {
          const c = node.child(i);
          if (c.type === 'import_specifier') {
            defaultName = getText(c.childForFieldName('name') || c.namedChild(0));
          } else if (c.type === 'named_imports') {
            for (let j = 0; j < c.childCount; j++) {
              const spec = c.child(j);
              if (spec.type === 'import_specifier') {
                const name = getText(spec.childForFieldName('name') || spec.namedChild(0));
                if (name) named.push(name);
              }
            }
          } else if (c.type === 'namespace_import') {
            named.push('*');
          }
        }

        result.imports.push({
          source: module,
          default: !!defaultName,
          defaultName: defaultName || undefined,
          named,
        });
        break;
      }

      case 'export_statement': {
        if (hasChildType(node, 'default')) {
          if (!findChildByType(node, 'function_declaration') &&
              !findChildByType(node, 'class_declaration') &&
              !findChildByType(node, 'interface_declaration') &&
              !findChildByType(node, 'type_alias_declaration')) {
            result.exports.push({ type: 'default' });
          }
          break;
        }

        const sourceNode = node.childForFieldName('source');
        if (sourceNode) {
          result.exports.push({ type: 're-export', source: getText(sourceNode).replace(/['"]/g, '') });
          break;
        }

        if (findChildByType(node, 'function_declaration') ||
            findChildByType(node, 'class_declaration') ||
            findChildByType(node, 'interface_declaration') ||
            findChildByType(node, 'type_alias_declaration') ||
            findChildByType(node, 'lexical_declaration')) {
          break;
        }

        const namedExports = findChildByType(node, 'named_exports');
        if (namedExports) {
          for (let i = 0; i < namedExports.childCount; i++) {
            const spec = namedExports.child(i);
            if (spec.type === 'export_specifier') {
              const name = getText(spec.childForFieldName('name') || spec.namedChild(0));
              if (name) result.exports.push({ type: 'named', name });
            }
          }
        }
        break;
      }

      case 'function_declaration': {
        const name = getText(node.childForFieldName('name'));
        const exported = isExported(node);
        const isAsync = hasChildType(node, 'async');
        const paramsNode = node.childForFieldName('parameters');
        result.declarations.push({
          kind: 'function',
          name: name || '(anonymous)',
          exported,
          async: isAsync,
          params: countRealParams(paramsNode),
        });
        break;
      }

      case 'class_declaration': {
        const name = getText(node.childForFieldName('name'));
        const exported = isExported(node);
        const extendsNode = findChildByType(node, 'extends_clause');
        const implementsNode = findChildByType(node, 'implements_clause');
        const entry = { kind: 'class', name: name || '(anonymous)', exported };
        if (extendsNode) {
          const firstType = extendsNode.namedChild(0);
          if (firstType) entry.extends = getText(firstType);
        }
        if (implementsNode) {
          const types = [];
          for (let i = 0; i < implementsNode.childCount; i++) {
            const c = implementsNode.child(i);
            if (c.type === 'type_identifier' || c.type === 'nested_type_identifier') {
              types.push(getText(c));
            }
          }
          if (types.length) entry.implements = types;
        }
        result.declarations.push(entry);
        break;
      }

      case 'interface_declaration': {
        const name = getText(node.childForFieldName('name'));
        const exported = isExported(node);
        const extendsNode = findChildByType(node, 'extends_clause');
        const entry = { kind: 'interface', name: name || '(anonymous)', exported };
        if (extendsNode) {
          const types = [];
          for (let i = 0; i < extendsNode.childCount; i++) {
            const c = extendsNode.child(i);
            if (c.type === 'type_identifier' || c.type === 'nested_type_identifier' || c.type === 'generic_type') {
              types.push(getText(c));
            }
          }
          if (types.length) entry.extends = types;
        }
        result.declarations.push(entry);
        break;
      }

      case 'type_alias_declaration': {
        const name = getText(node.childForFieldName('name'));
        const exported = isExported(node);
        result.declarations.push({ kind: 'type', name: name || '(anonymous)', exported });
        break;
      }

      case 'lexical_declaration': {
        for (let i = 0; i < node.childCount; i++) {
          const decl = node.child(i);
          if (decl.type === 'variable_declarator') {
            const nameNode = decl.childForFieldName('name');
            const valueNode = decl.childForFieldName('value');
            if (!nameNode || !valueNode) continue;

            if (valueNode.type === 'arrow_function') {
              const isAsync = hasChildType(valueNode, 'async');
              const paramsNode = valueNode.childForFieldName('parameters');
              const hasJsx = hasJsxInSubtree(valueNode);

              const entry = {
                kind: 'arrow-function',
                name: getText(nameNode),
                async: isAsync,
                params: countRealParams(paramsNode),
                exported: isExported(node),
              };
              if (hasJsx) entry.reactComponent = true;
              result.declarations.push(entry);
            }
          }
        }
        break;
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      walk(node.child(i));
    }
  }

  for (let i = 0; i < root.childCount; i++) {
    walk(root.child(i));
  }

  return result;
}

function extractWithRegex(source) {
  const result = { imports: [], exports: [], declarations: [] };

  const importRegex = /^import\s+(?:(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]|['"]([^'"]+)['"])/gm;
  let match;
  while ((match = importRegex.exec(source)) !== null) {
    const moduleName = match[3] || match[4];
    const defaultName = match[1] || undefined;
    const named = match[2]
      ? match[2].split(',').map(s => s.trim()).filter(Boolean).map(s => {
          const parts = s.split(/\s+as\s+/);
          return parts[0].trim();
        })
      : [];

    result.imports.push({
      source: moduleName,
      default: !!defaultName,
      defaultName: defaultName || undefined,
      named,
    });
  }

  const exportDeclRegex = /^export\s+(?:(default)\s+)?(?:function|class|interface|type|const|let|var|enum)\s+(\w+)/gm;
  while ((match = exportDeclRegex.exec(source)) !== null) {
    result.exports.push({
      type: match[1] ? 'default' : 'named',
      name: match[2],
    });
  }

  const namedExportRegex = /^export\s+\{([^}]+)\}/gm;
  while ((match = namedExportRegex.exec(source)) !== null) {
    match[1].split(',').forEach(s => {
      const name = s.trim().split(/\s+as\s+/)[0].trim();
      if (name) result.exports.push({ type: 'named', name });
    });
  }

  const reExportRegex = /^export\s+\*?\s*from\s+['"]([^'"]+)['"]/gm;
  while ((match = reExportRegex.exec(source)) !== null) {
    result.exports.push({ type: 're-export', source: match[1] });
  }

  const funcRegex = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm;
  while ((match = funcRegex.exec(source)) !== null) {
    const before = source.slice(Math.max(0, match.index - 80), match.index);
    const exported = /export\s*$/.test(source.slice(Math.max(0, match.index - 10), match.index));
    const isAsync = /async\s+/.test(match[0]);
    result.declarations.push({
      kind: 'function',
      name: match[1],
      exported: exported || /export\s+/.test(before),
      async: isAsync,
    });
  }

  const arrowRegex = /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/gm;
  while ((match = arrowRegex.exec(source)) !== null) {
    const before = source.slice(Math.max(0, match.index - 10), match.index);
    const exported = /export\s+/.test(before);
    const isAsync = /=.*(?:async\s*)/.test(match[0]);
    const isReact = /\n[^}]*<\w+[^>]*>/.test(source.slice(match.index, match.index + 500));
    const entry = { kind: 'arrow-function', name: match[1], exported, async: isAsync };
    if (isReact) entry.reactComponent = true;
    result.declarations.push(entry);
  }

  const classRegex = /(?:^|\n)\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/gm;
  while ((match = classRegex.exec(source)) !== null) {
    const before = source.slice(Math.max(0, match.index - 10), match.index);
    const exported = /export\s+/.test(before);
    const entry = { kind: 'class', name: match[1], exported };
    if (match[2]) entry.extends = match[2];
    if (match[3]) entry.implements = match[3].split(/\s*,\s*/).filter(Boolean);
    result.declarations.push(entry);
  }

  const interfaceRegex = /(?:^|\n)\s*(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?/gm;
  while ((match = interfaceRegex.exec(source)) !== null) {
    const before = source.slice(Math.max(0, match.index - 10), match.index);
    const exported = /export\s+/.test(before);
    const entry = { kind: 'interface', name: match[1], exported };
    if (match[2]) entry.extends = match[2].split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
    result.declarations.push(entry);
  }

  const typeRegex = /(?:^|\n)\s*(?:export\s+)?type\s+(\w+)\s*=/gm;
  while ((match = typeRegex.exec(source)) !== null) {
    const before = source.slice(Math.max(0, match.index - 10), match.index);
    const exported = /export\s+/.test(before);
    result.declarations.push({ kind: 'type', name: match[1], exported });
  }

  return result;
}

function extractDocInfo(source, ext) {
  const info = { size: source.length, lines: source.split('\n').length };

  if (ext === '.md' || ext === '.mdx') {
    const headings = [];
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let m;
    while ((m = headingRegex.exec(source)) !== null) {
      headings.push({ level: m[1].length, text: m[2].trim() });
    }

    const codeBlocks = [];
    const codeRegex = /```(\w*)\n[\s\S]*?```/g;
    while ((m = codeRegex.exec(source)) !== null) {
      const lang = m[1] || '(none)';
      const content = m[0];
      const lines = content.split('\n').length - 2;
      codeBlocks.push({ language: lang, lines });
    }

    const listItems = (source.match(/^[\s]*[-*+]\s/gm) || []).length +
                      (source.match(/^[\s]*\d+\.\s/gm) || []).length;

    info.type = 'markdown';
    info.headings = headings;
    info.totalHeadings = headings.length;
    info.totalCodeBlocks = codeBlocks.length;
    info.codeBlocks = codeBlocks;
    info.totalListItems = listItems;
    info.sections = headings.map(h => h.text);
  } else if (ext === '.json') {
    try {
      const parsed = JSON.parse(source);
      info.type = 'json';
      info.topKeys = Array.isArray(parsed)
        ? `array[${parsed.length}]`
        : Object.keys(parsed);
    } catch {
      info.type = 'json';
      info.parseError = true;
    }
  } else if (ext === '.yaml' || ext === '.yml') {
    info.type = 'yaml';
    const keyRegex = /^(\w+[-\w]*):/gm;
    const keys = new Set();
    let k;
    while ((k = keyRegex.exec(source)) !== null) {
      keys.add(k[1]);
    }
    info.topKeys = [...keys];
  } else if (ext === '.txt') {
    info.type = 'text';
    info.wordCount = source.split(/\s+/).filter(Boolean).length;
  }

  return info;
}

function buildImplementationReport(allFiles) {
  process.stdout.write(`Found ${allFiles.length} source files\n`);
  if (isLoaded) {
    process.stdout.write('Parser: tree-sitter (native)\n');
  } else {
    process.stdout.write('Parser: regex (fallback)\n');
  }
  process.stdout.write('---\n');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'implementation',
    parser: isLoaded ? 'tree-sitter' : 'regex',
    summary: {
      totalFiles: 0,
      totalTsFiles: 0,
      totalTsxFiles: 0,
      totalImports: 0,
      totalExports: 0,
      totalFunctions: 0,
      totalClasses: 0,
      totalInterfaces: 0,
      totalTypes: 0,
      totalArrowFunctions: 0,
      totalReactComponents: 0,
      totalHookOrUtilities: 0,
    },
    files: Object.create(null),
    errors: [],
    dependencyCount: Object.create(null),
    perPackage: Object.create(null),
  };

  for (const file of allFiles) {
    let content;
    try {
      content = fs.readFileSync(file.absPath, 'utf-8');
    } catch (err) {
      report.errors.push({ file: file.relPath, error: `read error: ${err.message}` });
      continue;
    }

    report.summary.totalFiles++;
    const ext = path.extname(file.relPath);
    if (ext === '.ts') report.summary.totalTsFiles++;
    else if (ext === '.tsx') report.summary.totalTsxFiles++;

    let parsed;
    try {
      if (isLoaded) {
        parsed = extractWithTreeSitter(content, ext);
      } else {
        parsed = extractWithRegex(content);
      }
    } catch (err) {
      report.errors.push({ file: file.relPath, error: `parse error: ${err.message}` });
      parsed = extractWithRegex(content);
    }

    report.summary.totalImports += parsed.imports.length;
    report.summary.totalExports += parsed.exports.length;

    for (const decl of parsed.declarations) {
      if (decl.kind === 'function') report.summary.totalFunctions++;
      else if (decl.kind === 'class') report.summary.totalClasses++;
      else if (decl.kind === 'interface') report.summary.totalInterfaces++;
      else if (decl.kind === 'type') report.summary.totalTypes++;
      else if (decl.kind === 'arrow-function') {
        report.summary.totalArrowFunctions++;
        if (decl.reactComponent) report.summary.totalReactComponents++;
        else report.summary.totalHookOrUtilities++;
      }
    }

    for (const imp of parsed.imports) {
      report.dependencyCount[imp.source] = (report.dependencyCount[imp.source] || 0) + 1;
    }

    const parts = file.relPath.split('/');
    const pkg = parts[0] === 'apps' ? `apps/${parts[1]}`
      : parts[0] === 'packages' ? `packages/${parts[1]}`
      : 'other';

    if (!report.perPackage[pkg]) {
      report.perPackage[pkg] = { files: 0, imports: 0, exports: 0, declarations: 0 };
    }
    report.perPackage[pkg].files++;
    report.perPackage[pkg].imports += parsed.imports.length;
    report.perPackage[pkg].exports += parsed.exports.length;
    report.perPackage[pkg].declarations += parsed.declarations.length;

    report.files[file.relPath] = parsed;
  }

  return report;
}

function buildDocReport(allFiles) {
  process.stdout.write(`Found ${allFiles.length} documentation files\n`);
  process.stdout.write('Parser: document info extractor\n');
  process.stdout.write('---\n');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'docs',
    summary: {
      totalFiles: 0,
      totalMdFiles: 0,
      totalJsonFiles: 0,
      totalYamlFiles: 0,
      totalTxtFiles: 0,
      totalHeadings: 0,
      totalCodeBlocks: 0,
      totalListItems: 0,
    },
    files: Object.create(null),
    errors: [],
    headingIndex: Object.create(null),
    codeBlockLanguages: Object.create(null),
  };

  for (const file of allFiles) {
    let content;
    try {
      content = fs.readFileSync(file.absPath, 'utf-8');
    } catch (err) {
      report.errors.push({ file: file.relPath, error: `read error: ${err.message}` });
      continue;
    }

    report.summary.totalFiles++;
    const ext = path.extname(file.relPath);
    if (ext === '.md' || ext === '.mdx') report.summary.totalMdFiles++;
    else if (ext === '.json') report.summary.totalJsonFiles++;
    else if (ext === '.yaml' || ext === '.yml') report.summary.totalYamlFiles++;
    else if (ext === '.txt') report.summary.totalTxtFiles++;

    const info = extractDocInfo(content, ext);

    if (info.totalHeadings) {
      report.summary.totalHeadings += info.totalHeadings;
      for (const h of info.headings || []) {
        const key = h.text.toLowerCase();
        if (!report.headingIndex[key]) report.headingIndex[key] = [];
        report.headingIndex[key].push(file.relPath);
      }
    }

    if (info.totalCodeBlocks) {
      report.summary.totalCodeBlocks += info.totalCodeBlocks;
      for (const cb of info.codeBlocks || []) {
        const lang = cb.language || '(none)';
        report.codeBlockLanguages[lang] = (report.codeBlockLanguages[lang] || 0) + 1;
      }
    }

    if (info.totalListItems) {
      report.summary.totalListItems += info.totalListItems;
    }

    report.files[file.relPath] = info;
  }

  return report;
}

function printImplementationReport(report) {
  const s = report.summary;
  const lines = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════╗');
  lines.push('║     Codebase — Implementation Report     ║');
  lines.push('╚══════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Parser:    ${report.parser}`);
  lines.push('');

  lines.push('── Overview ──');
  lines.push(`  Total files:      ${s.totalFiles} (TS: ${s.totalTsFiles}, TSX: ${s.totalTsxFiles})`);
  lines.push(`  Total imports:    ${s.totalImports}`);
  lines.push(`  Total exports:    ${s.totalExports}`);
  lines.push(`  Functions:        ${s.totalFunctions}`);
  lines.push(`  Arrow functions:  ${s.totalArrowFunctions}`);
  lines.push(`  Classes:          ${s.totalClasses}`);
  lines.push(`  Interfaces:       ${s.totalInterfaces}`);
  lines.push(`  Type aliases:     ${s.totalTypes}`);
  lines.push(`  React components: ${s.totalReactComponents}`);
  lines.push('');

  lines.push('── Per Package ──');
  for (const [pkg, data] of Object.entries(report.perPackage)) {
    lines.push(`  ${pkg}:`);
    lines.push(`    Files:        ${data.files}`);
    lines.push(`    Imports:      ${data.imports}`);
    lines.push(`    Exports:      ${data.exports}`);
    lines.push(`    Declarations: ${data.declarations}`);
  }
  lines.push('');

  const topDeps = Object.entries(report.dependencyCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  lines.push('── Top Dependencies ──');
  for (const [dep, count] of topDeps) {
    lines.push(`  ${dep.padEnd(30)} ${count}`);
  }
  lines.push('');

  if (report.errors.length > 0) {
    lines.push(`── Errors (${report.errors.length}) ──`);
    for (const err of report.errors.slice(0, 10)) {
      lines.push(`  ${err.file}: ${err.error}`);
    }
    if (report.errors.length > 10) {
      lines.push(`  ... and ${report.errors.length - 10} more`);
    }
    lines.push('');
  }

  const allDecls = Object.values(report.files).flatMap(f => f.declarations || []);
  const exportedDecls = allDecls.filter(d => d.exported).map(d => d.name).filter(Boolean);
  if (exportedDecls.length > 0) {
    lines.push(`── Exported API Surface (${exportedDecls.length}) ──`);
    const pkgExports = {};
    for (const [filePath, fileData] of Object.entries(report.files)) {
      const exports = (fileData.declarations || []).filter(d => d.exported);
      if (exports.length > 0) {
        const pkg = filePath.split('/')[1] || 'other';
        if (!pkgExports[pkg]) pkgExports[pkg] = [];
        for (const exp of exports) {
          pkgExports[pkg].push(`    ${exp.kind.padEnd(14)} ${exp.name.padEnd(30)} ${filePath}`);
        }
      }
    }
    for (const [pkg, items] of Object.entries(pkgExports)) {
      lines.push(`  ${pkg}:`);
      for (const item of items) {
        lines.push(item);
      }
    }
    lines.push('');
  }

  lines.push('── Files Scanned ──');
  for (const filePath of Object.keys(report.files).sort()) {
    lines.push(`  ${filePath}`);
  }
  lines.push('');

  return lines.join('\n');
}

function printDocReport(report) {
  const s = report.summary;
  const lines = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════╗');
  lines.push('║     Codebase — Documentation Report      ║');
  lines.push('╚══════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');

  lines.push('── Overview ──');
  lines.push(`  Total files:       ${s.totalFiles}`);
  lines.push(`  Markdown (.md):    ${s.totalMdFiles}`);
  lines.push(`  JSON:              ${s.totalJsonFiles}`);
  lines.push(`  YAML:              ${s.totalYamlFiles}`);
  lines.push(`  Text (.txt):       ${s.totalTxtFiles}`);
  lines.push(`  Total headings:    ${s.totalHeadings}`);
  lines.push(`  Total code blocks: ${s.totalCodeBlocks}`);
  lines.push(`  Total list items:  ${s.totalListItems}`);
  lines.push('');

  const codeLangs = Object.entries(report.codeBlockLanguages).sort((a, b) => b[1] - a[1]);
  if (codeLangs.length > 0) {
    lines.push('── Code Block Languages ──');
    for (const [lang, count] of codeLangs) {
      lines.push(`  ${lang.padEnd(20)} ${count}`);
    }
    lines.push('');
  }

  const allHeadings = Object.entries(report.headingIndex);
  if (allHeadings.length > 0) {
    const dupes = allHeadings.filter(([, files]) => files.length > 1);
    if (dupes.length > 0) {
      lines.push(`── Duplicate Headings (${dupes.length}) ──`);
      for (const [heading, files] of dupes.slice(0, 15)) {
        lines.push(`  "${heading}" — ${files.length}x`);
      }
      if (dupes.length > 15) {
        lines.push(`  ... and ${dupes.length - 15} more`);
      }
      lines.push('');
    }

    lines.push(`── All Headings (${allHeadings.length}) ──`);
    for (const [heading, files] of allHeadings.slice(0, 30)) {
      lines.push(`  ${heading.padEnd(45)} ${files[0]}`);
    }
    if (allHeadings.length > 30) {
      lines.push(`  ... and ${allHeadings.length - 30} more`);
    }
    lines.push('');
  }

  if (report.errors.length > 0) {
    lines.push(`── Errors (${report.errors.length}) ──`);
    for (const err of report.errors) {
      lines.push(`  ${err.file}: ${err.error}`);
    }
    lines.push('');
  }

  lines.push('── Files Scanned ──');
  for (const filePath of Object.keys(report.files).sort()) {
    const info = report.files[filePath];
    const detail = info.type === 'markdown'
      ? `[${info.totalHeadings} headings, ${info.totalCodeBlocks} code blocks]`
      : info.type === 'json' || info.type === 'yaml'
      ? `[keys: ${Array.isArray(info.topKeys) ? info.topKeys.join(', ') : info.topKeys}]`
      : info.type === 'text'
      ? `[${info.wordCount} words]`
      : '';
    lines.push(`  ${filePath}  ${detail}`);
  }
  lines.push('');

  return lines.join('\n');
}

function saveReports(reports) {
  for (const [mode, { report, textReport }] of Object.entries(reports)) {
    const suffix = mode === 'all' ? 'combined' : mode;
    const jsonPath = path.join(OUTPUT_DIR, `${suffix}-report.json`);
    const mdPath = path.join(OUTPUT_DIR, `${suffix}-report.md`);

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    const md = `# Codebase Analysis — ${mode === 'all' ? 'Combined' : (mode === 'implementation' ? 'Implementation' : 'Documentation')}\n\nGenerated: ${report.generatedAt}\n\n\`\`\`\n${textReport}\n\`\`\`\n`;
    fs.writeFileSync(mdPath, md);

    process.stdout.write(`  ${suffix.padEnd(16)} JSON: ${jsonPath}\n`);
    process.stdout.write(`  ${suffix.padEnd(16)} MD:   ${mdPath}\n`);
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    const help = `
Usage: node scan.mjs [options]

Modes:
  --mode <name>       Scan mode: implementation | docs | all  (default: implementation)

Options:
  --help, -h          Show this help
  --json-only         Output only JSON (no human-readable report)
  --no-save           Don't save output files
  --include-tests     Include test files in scan (implementation mode only)
`;
    process.stdout.write(help);
    return;
  }

  const modeFlag = process.argv.includes('--mode')
    ? process.argv[process.argv.indexOf('--mode') + 1] || 'implementation'
    : 'implementation';

  const validModes = ['implementation', 'docs', 'all'];
  if (!validModes.includes(modeFlag)) {
    process.stderr.write(`Error: invalid mode "${modeFlag}". Valid modes: ${validModes.join(', ')}\n`);
    process.exit(1);
  }

  const modesToRun = modeFlag === 'all' ? ['implementation', 'docs'] : [modeFlag];

  const includeTests = process.argv.includes('--include-tests');
  const jsonOnly = process.argv.includes('--json-only');
  const noSave = process.argv.includes('--no-save');

  await loadTreeSitter();

  const results = {};

  for (const mode of modesToRun) {
    process.stdout.write(`\n=== ${SCAN_MODES[mode].label} Mode ===\n`);
    process.stdout.write('Scanning files...\n');

    const config = SCAN_MODES[mode];
    let excludePatterns = [...config.excludePatterns];

    if (mode === 'implementation' && includeTests) {
      excludePatterns = excludePatterns.filter(p => {
        const s = p.source;
        return s !== '\\.test\\.(ts|tsx)$' && s !== '\\.spec\\.(ts|tsx)$';
      });
    }

    const allFiles = [];
    for (const relDir of config.includeDirs) {
      const absDir = path.join(WORKSPACE_ROOT, relDir.replace(/\//g, path.sep));
      if (fs.existsSync(absDir)) {
        findFiles(absDir, allFiles, relDir, config.extensions, excludePatterns, config.includeDotDirs);
      } else {
        process.stdout.write(`Warning: directory not found: ${relDir}\n`);
      }
    }

    let report;
    let textReport;

    if (mode === 'docs') {
      report = buildDocReport(allFiles);
      textReport = printDocReport(report);
    } else {
      report = buildImplementationReport(allFiles);
      textReport = printImplementationReport(report);
    }

    if (jsonOnly) {
      process.stdout.write(JSON.stringify(report, null, 2));
    } else {
      process.stdout.write(textReport);
    }

    results[mode] = { report, textReport };
  }

  if (modeFlag === 'all') {
    const combined = {
      generatedAt: new Date().toISOString(),
      mode: 'all',
      implementation: results.implementation.report,
      documentation: results.docs.report,
    };
    const combinedText = `# Combined Report\n\nImplementation:\n${results.implementation.textReport}\n\nDocumentation:\n${results.docs.textReport}`;
    results.all = { report: combined, textReport: combinedText };
  }

  if (!noSave) {
    saveReports(results);
  }
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.stderr.write(err.stack + '\n');
  process.exit(1);
});
