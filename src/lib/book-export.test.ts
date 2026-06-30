import { describe, expect, it } from 'vitest';
import type { Chapter, Project } from '../types';
import {
  buildBookExportArtifact,
  buildEpubExport,
  buildHtmlExport,
  buildTxtExport,
  sanitizeFilename,
} from './book-export';

const project: Project = {
  id: 'book-1',
  title: '星河：測試/小說',
  genre: '科幻',
  style: '冷冽',
  worldSetting: '',
  mainPlot: '',
  chapterOutline: '',
  createdAt: 1,
  updatedAt: 1,
};

const chapters: Chapter[] = [
  makeChapter({ id: 'c2', order: 1, title: '第二章', content: '第二章正文' }),
  makeChapter({ id: 'c1', order: 0, title: '第一章 <開始>', content: '第一段\n\n第二段 & 轉折' }),
];

describe('book export', () => {
  it('builds a sorted plain text manuscript', () => {
    const text = buildTxtExport({ project, chapters, exportedAt: new Date('2026-06-28T00:00:00Z') });

    expect(text.indexOf('第 1 章　第一章 <開始>')).toBeLessThan(text.indexOf('第 2 章　第二章'));
    expect(text).toContain('第一段');
    expect(text).toContain('第二段 & 轉折');
  });

  it('escapes HTML output and keeps readable paragraphs', () => {
    const html = buildHtmlExport({ project, chapters, exportedAt: new Date('2026-06-28T00:00:00Z') });

    expect(html).toContain('第一章 &lt;開始&gt;');
    expect(html).toContain('第二段 &amp; 轉折');
    expect(html).toContain('<p>第一段</p>');
    expect(html).toContain('<p>第二段 &amp; 轉折</p>');
  });

  it('creates an EPUB zip with the required first mimetype entry', () => {
    const epub = buildEpubExport({ project, chapters, exportedAt: new Date('2026-06-28T00:00:00Z') });
    const firstNameLength = epub[26] + (epub[27] << 8);
    const firstName = decode(epub.slice(30, 30 + firstNameLength));
    const firstContentStart = 30 + firstNameLength;
    const firstContent = decode(epub.slice(firstContentStart, firstContentStart + 'application/epub+zip'.length));
    const decoded = decode(epub);

    expect(firstName).toBe('mimetype');
    expect(firstContent).toBe('application/epub+zip');
    expect(decoded).toContain('META-INF/container.xml');
    expect(decoded).toContain('OEBPS/content.opf');
    expect(decoded).toContain('OEBPS/chapters/chapter-1.xhtml');
  });

  it('returns the right artifact filename and MIME type', async () => {
    const artifact = await buildBookExportArtifact('epub', { project, chapters });

    expect(artifact.filename).toBe('星河：測試-小說.epub');
    expect(artifact.mimeType).toBe('application/epub+zip');
    expect(artifact.blob.type).toBe('application/epub+zip');
  });

  it('sanitizes empty and Windows-reserved filename characters', () => {
    expect(sanitizeFilename('  <>:"/\\|?*  ')).toBe('---------');
    expect(sanitizeFilename('   ')).toBe('novel');
  });
});

function makeChapter(overrides: Partial<Chapter>): Chapter {
  return {
    id: 'chapter',
    projectId: project.id,
    order: 0,
    title: '',
    targetWords: null,
    beat: '',
    points: '',
    content: '',
    referenceChapterId: null,
    wikiSyncedAt: null,
    wikiSyncedHash: null,
    wikiSyncStatus: 'unsynced',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
