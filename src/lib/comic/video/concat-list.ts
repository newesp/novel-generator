export function buildConcatList(segmentPaths: string[]): string {
  return `${segmentPaths.map((path) => `file '${escapeConcatPath(path)}'`).join('\n')}\n`;
}

export function escapeConcatPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/'/g, "'\\''");
}
