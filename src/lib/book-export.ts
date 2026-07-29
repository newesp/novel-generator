import type { Chapter, Project } from '../types';

export type BookExportFormat = 'txt' | 'html' | 'epub';

export interface BookExportInput {
  project: Project;
  chapters: Chapter[];
  exportedAt?: Date;
  locale?: string;
}

export interface BookExportArtifact {
  filename: string;
  mimeType: string;
  blob: Blob;
}

interface EpubEntry {
  path: string;
  content: Uint8Array;
  mimeType?: string;
}

const textEncoder = new TextEncoder();
const CRC32_TABLE = makeCrc32Table();

export async function buildBookExportArtifact(
  format: BookExportFormat,
  input: BookExportInput,
): Promise<BookExportArtifact> {
  const sortedChapters = sortChapters(input.chapters);
  const exportedAt = input.exportedAt ?? new Date();
  const basename = sanitizeFilename(input.project.title || 'novel');

  if (format === 'txt') {
    const content = buildTxtExport({ ...input, chapters: sortedChapters, exportedAt });
    return {
      filename: `${basename}.txt`,
      mimeType: 'text/plain;charset=utf-8',
      blob: new Blob([content], { type: 'text/plain;charset=utf-8' }),
    };
  }

  if (format === 'html') {
    const content = buildHtmlExport({ ...input, chapters: sortedChapters, exportedAt });
    return {
      filename: `${basename}.html`,
      mimeType: 'text/html;charset=utf-8',
      blob: new Blob([content], { type: 'text/html;charset=utf-8' }),
    };
  }

  const content = buildEpubExport({ ...input, chapters: sortedChapters, exportedAt });
  const arrayBuffer = content.buffer.slice(
    content.byteOffset,
    content.byteOffset + content.byteLength,
  ) as ArrayBuffer;
  return {
    filename: `${basename}.epub`,
    mimeType: 'application/epub+zip',
    blob: new Blob([arrayBuffer], { type: 'application/epub+zip' }),
  };
}

export function buildTxtExport(input: BookExportInput & { exportedAt?: Date }): string {
  const exportedAt = input.exportedAt ?? new Date();
  const locale = input.locale ?? 'zh-TW';
  const tocTitle = locale === 'zh-TW' ? '目錄' : 'Table of Contents';
  const chapterPrefix = locale === 'zh-TW' ? '第 ' : 'Chapter ';
  const chapterSuffix = locale === 'zh-TW' ? ' 章' : '';
  const unnamedChapter = locale === 'zh-TW' ? '未命名章節' : 'Unnamed Chapter';
  const emptyContent = locale === 'zh-TW' ? '（本章尚無正文）' : '(No content yet)';

  const lines = [
    input.project.title,
    '',
    ...formatProjectMetadata(input.project, exportedAt, locale),
    '',
    tocTitle,
    ...sortChapters(input.chapters).map((chapter, index) => `${index + 1}. ${chapter.title || `${chapterPrefix}${index + 1}${chapterSuffix}`}`),
    '',
  ];

  for (const [index, chapter] of sortChapters(input.chapters).entries()) {
    lines.push(
      '',
      `${chapterPrefix}${index + 1}${chapterSuffix}\u3000${chapter.title || unnamedChapter}`,
      '',
      chapter.content.trim() || emptyContent,
      '',
    );
  }

  return normalizeNewlines(lines.join('\n')).trimEnd() + '\n';
}

export function buildHtmlExport(input: BookExportInput & { exportedAt?: Date }): string {
  const exportedAt = input.exportedAt ?? new Date();
  const locale = input.locale ?? 'zh-TW';
  const chapters = sortChapters(input.chapters);
  const metadata = formatProjectMetadata(input.project, exportedAt, locale);
  const tocTitle = locale === 'zh-TW' ? '目錄' : 'Table of Contents';
  const chapterPrefix = locale === 'zh-TW' ? '第 ' : 'Chapter ';
  const chapterSuffix = locale === 'zh-TW' ? ' 章' : '';
  const unnamedChapter = locale === 'zh-TW' ? '未命名章節' : 'Unnamed Chapter';
  const emptyContent = locale === 'zh-TW' ? '（本章尚無正文）' : '(No content yet)';

  const toc = chapters
    .map((chapter, index) => `<li><a href="#chapter-${index + 1}">${escapeHtml(chapter.title || `${chapterPrefix}${index + 1}${chapterSuffix}`)}</a></li>`)
    .join('\n');
  const chapterHtml = chapters
    .map((chapter, index) => {
      const title = escapeHtml(chapter.title || unnamedChapter);
      const body = paragraphsToHtml(chapter.content.trim() || emptyContent);
      return `<section id="chapter-${index + 1}" class="chapter">
  <h2>${chapterPrefix}${index + 1}${chapterSuffix}\u3000${title}</h2>
${body}
</section>`;
    })
    .join('\n\n');

  const langAttr = input.project.writingLanguage === 'zh-Hant' ? 'zh-Hant' : 'en';

  return `<!doctype html>
<html lang="${langAttr}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.project.title)}</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0 auto;
      max-width: 760px;
      padding: 48px 24px 72px;
      color: #1f2937;
      background: #fff;
      font-family: "Noto Serif TC", "Source Han Serif TC", "PMingLiU", serif;
      line-height: 1.9;
    }
    h1, h2 { line-height: 1.35; color: #111827; }
    h1 { margin: 0 0 12px; font-size: 2rem; }
    h2 { margin: 3rem 0 1rem; font-size: 1.45rem; break-before: page; }
    p { margin: 0 0 1em; text-indent: 2em; }
    .meta { margin: 0 0 2rem; color: #6b7280; font-size: 0.92rem; }
    .toc { margin: 2rem 0 3rem; padding-left: 1.5rem; }
    .toc a { color: #374151; text-decoration: none; }
    .chapter { margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(input.project.title)}</h1>
  <div class="meta">
${metadata.map((line) => `    <div>${escapeHtml(line)}</div>`).join('\n')}
  </div>
  <nav aria-label="${escapeHtml(tocTitle)}">
    <h2>${escapeHtml(tocTitle)}</h2>
    <ol class="toc">
${toc}
    </ol>
  </nav>
${chapterHtml}
</body>
</html>
`;
}

export function buildEpubExport(input: BookExportInput & { exportedAt?: Date }): Uint8Array {
  const exportedAt = input.exportedAt ?? new Date();
  const locale = input.locale ?? 'zh-TW';
  const chapters = sortChapters(input.chapters);
  const bookId = `urn:uuid:${input.project.id}`;
  const modified = exportedAt.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const title = input.project.title || (locale === 'zh-TW' ? '未命名小說' : 'Unnamed Novel');
  const chapterPrefix = locale === 'zh-TW' ? '第 ' : 'Chapter ';
  const chapterSuffix = locale === 'zh-TW' ? ' 章' : '';
  const unnamedChapter = locale === 'zh-TW' ? '未命名章節' : 'Unnamed Chapter';
  const emptyContent = locale === 'zh-TW' ? '（本章尚無正文）' : '(No content yet)';
  const tocTitle = locale === 'zh-TW' ? '目錄' : 'Table of Contents';

  const langAttr = input.project.writingLanguage === 'zh-Hant' ? 'zh-Hant' : 'en';

  const chapterEntries = chapters.map((chapter, index) => ({
    href: `chapters/chapter-${index + 1}.xhtml`,
    title: chapter.title || `${chapterPrefix}${index + 1}${chapterSuffix}`,
    content: chapterToXhtml(chapter, index, langAttr, chapterPrefix, chapterSuffix, unnamedChapter, emptyContent),
  }));

  const entries: EpubEntry[] = [
    { path: 'mimetype', content: textEncoder.encode('application/epub+zip'), mimeType: 'application/epub+zip' },
    { path: 'META-INF/container.xml', content: encodeXml(containerXml()) },
    { path: 'OEBPS/styles.css', content: textEncoder.encode(epubCss()) },
    { path: 'OEBPS/nav.xhtml', content: encodeXml(navXhtml(title, chapterEntries, langAttr, tocTitle)) },
    { path: 'OEBPS/toc.ncx', content: encodeXml(tocNcx(bookId, title, chapterEntries)) },
    { path: 'OEBPS/content.opf', content: encodeXml(contentOpf(bookId, title, modified, chapterEntries, langAttr)) },
    ...chapterEntries.map((entry) => ({
      path: `OEBPS/${entry.href}`,
      content: encodeXml(entry.content),
    })),
  ];

  return createStoredZip(entries);
}

export function sanitizeFilename(name: string): string {
  const sanitized = name
    .trim()
    // Strip filesystem-forbidden characters and ASCII control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 80);
  return sanitized || 'novel';
}

function sortChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

function formatProjectMetadata(project: Project, exportedAt: Date, locale: string): string[] {
  const tStr = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(exportedAt);
  const genreLabel = locale === 'zh-TW' ? '類型：' : 'Genre: ';
  const styleLabel = locale === 'zh-TW' ? '風格：' : 'Style: ';
  const exportLabel = locale === 'zh-TW' ? '匯出時間：' : 'Exported at: ';

  return [
    project.genre ? `${genreLabel}${project.genre}` : '',
    project.style ? `${styleLabel}${project.style}` : '',
    `${exportLabel}${tStr}`,
  ].filter(Boolean);
}

function paragraphsToHtml(text: string): string {
  return normalizeNewlines(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `  <p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

function chapterToXhtml(chapter: Chapter, index: number, langAttr: string, chapterPrefix: string, chapterSuffix: string, unnamedChapter: string, emptyContent: string): string {
  const title = chapter.title || unnamedChapter;
  const body = paragraphsToHtml(chapter.content.trim() || emptyContent);
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${langAttr}" xml:lang="${langAttr}">
<head>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles.css" />
</head>
<body>
  <section epub:type="chapter">
    <h1>${chapterPrefix}${index + 1}${chapterSuffix}\u3000${escapeHtml(title)}</h1>
${body}
  </section>
</body>
</html>`;
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;
}

function navXhtml(title: string, chapters: Array<{ href: string; title: string }>, langAttr: string, tocTitle: string): string {
  const items = chapters
    .map((chapter) => `      <li><a href="${escapeXml(chapter.href)}">${escapeHtml(chapter.title)}</a></li>`)
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${langAttr}" xml:lang="${langAttr}">
<head>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${escapeHtml(tocTitle)}</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>`;
}

function tocNcx(bookId: string, title: string, chapters: Array<{ href: string; title: string }>): string {
  const points = chapters
    .map((chapter, index) => `    <navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(chapter.title)}</text></navLabel>
      <content src="${escapeXml(chapter.href)}" />
    </navPoint>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(bookId)}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>`;
}

function contentOpf(
  bookId: string,
  title: string,
  modified: string,
  chapters: Array<{ href: string; title: string }>,
  langAttr: string,
): string {
  const chapterManifest = chapters
    .map((chapter, index) => `    <item id="chapter-${index + 1}" href="${escapeXml(chapter.href)}" media-type="application/xhtml+xml" />`)
    .join('\n');
  const spine = chapters
    .map((_, index) => `    <itemref idref="chapter-${index + 1}" />`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(bookId)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>${langAttr}</dc:language>
    <dc:creator>Novel Generator</dc:creator>
    <meta property="dcterms:modified">${escapeXml(modified)}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="style" href="styles.css" media-type="text/css" />
${chapterManifest}
  </manifest>
  <spine toc="toc">
${spine}
  </spine>
</package>`;
}

function epubCss(): string {
  return `body {
  color: #1f2937;
  font-family: serif;
  line-height: 1.9;
}
h1 {
  font-size: 1.4em;
  line-height: 1.35;
  margin: 0 0 1em;
}
p {
  margin: 0 0 1em;
  text-indent: 2em;
}
`;
}

function createStoredZip(entries: EpubEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.path);
    const crc = crc32(entry.content);
    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.content.length),
      u32(entry.content.length),
      u16(name.length),
      u16(0),
      name,
    ]);
    chunks.push(localHeader, entry.content);

    centralDirectory.push(concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.content.length),
      u32(entry.content.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]));
    offset += localHeader.length + entry.content.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectoryBytes = concatBytes(centralDirectory);
  const end = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectoryBytes.length),
    u32(centralDirectoryOffset),
    u16(0),
  ]);

  return concatBytes([...chunks, centralDirectoryBytes, end]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[i] = crc >>> 0;
  }
  return table;
}

function encodeXml(xml: string): Uint8Array {
  return textEncoder.encode(xml);
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function escapeHtml(value: string): string {
  return escapeXml(value);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
