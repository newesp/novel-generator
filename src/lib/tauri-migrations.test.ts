import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tauri SQL migrations', () => {
  it('registers the comic metadata migration', () => {
    const libRs = readFileSync(join(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
    expect(libRs).toContain('version: 4');
    expect(libRs).toContain('../migrations/004_comics.sql');
  });
});
