import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';
import TR from './ui-translations/tr';

// These are names, citation formats, and literal examples/identifiers.
const UNCHANGED = new Set([
  'Google Classroom', 'Casparel', '© 2026 Casparel', ', Casparel',
  'APA 7', 'MLA 9', 'Chicago', 'URL', 'Pro', 'Free', 'CSP-',
  'https://...', 'https://…', 'https://meet.google.com/…',
  'user@example.com', 'COURSE_ID', 'VITE_REVENUECAT_WEB_API_KEY',
  'pdl_…', 'default',
]);

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = join(directory, entry.name);
    return entry.isDirectory() ? files(full) : full.endsWith('.tsx') ? [full] : [];
  });
}

function decode(value: string): string {
  return value.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, '\u00a0');
}

it('translates static copy inside unopened menus, dialogs, and conditional states too', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const missing: string[] = [];
  for (const file of files(root)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      let copy: string | undefined;
      if (ts.isJsxText(node)) copy = node.text.replace(/\s+/g, ' ').trim();
      if (ts.isJsxAttribute(node) && ['aria-label', 'title', 'placeholder'].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) {
        copy = node.initializer.text;
      }
      if (copy) {
        copy = decode(copy);
        if (/[a-zA-Z]{3}/.test(copy) && !UNCHANGED.has(copy) && !TR[copy]) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          missing.push(`${file.slice(root.length + 1)}:${line} ${copy}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(missing).toEqual([]);
});
