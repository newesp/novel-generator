import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const HAN_TEXT = /[\u3400-\u9fff]/;

function listTsxFiles(targetPath: string): string[] {
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) return targetPath.endsWith('.tsx') ? [targetPath] : [];

  return fs.readdirSync(targetPath).flatMap((entry) =>
    listTsxFiles(path.join(targetPath, entry)),
  );
}

function isInsideJsxExpression(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxExpression(current) || ts.isJsxAttribute(current)) return true;
    if (
      ts.isStatement(current)
      || ts.isVariableDeclaration(current)
      || ts.isFunctionLike(current)
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

function findVisibleHanText(filePath: string): string[] {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const findings: string[] = [];

  const addFinding = (node: ts.Node) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const text = node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 100);
    findings.push(`${path.relative(process.cwd(), filePath)}:${line + 1} ${text}`);
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && HAN_TEXT.test(node.getText(sourceFile))) {
      addFinding(node);
    } else if (
      (
        ts.isStringLiteral(node)
        || ts.isNoSubstitutionTemplateLiteral(node)
        || ts.isTemplateExpression(node)
      )
      && HAN_TEXT.test(node.getText(sourceFile))
      && isInsideJsxExpression(node)
    ) {
      addFinding(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

describe('UI localization coverage', () => {
  it('does not hard-code Han text in visible JSX', () => {
    const files = [
      path.join(process.cwd(), 'src', 'App.tsx'),
      ...listTsxFiles(path.join(process.cwd(), 'src', 'components'))
        .filter((filePath) => !filePath.endsWith('.test.tsx')),
    ];
    const findings = files.flatMap(findVisibleHanText);

    expect(findings).toEqual([]);
  });
});
