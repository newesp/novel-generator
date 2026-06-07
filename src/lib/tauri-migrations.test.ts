import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tauri SQL migrations', () => {
  it('registers the comic metadata and scene visual migrations', () => {
    const libRs = readFileSync(join(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
    expect(libRs).toContain('version: 4');
    expect(libRs).toContain('../migrations/004_comics.sql');
    expect(libRs).toContain('version: 5');
    expect(libRs).toContain('../migrations/005_scene_visuals.sql');
    expect(libRs).toContain('version: 6');
    expect(libRs).toContain('../migrations/006_comic_panel_image_variants.sql');
  });
});
