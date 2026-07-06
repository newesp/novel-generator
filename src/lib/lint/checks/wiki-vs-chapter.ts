import { v4 as uuid } from 'uuid';
import { complete } from '../../llm';
import { renderTemplate } from '../../prompt-template';
import type { Chapter, Character, WikiPage } from '../../../types';
import type { LintCheck, LintContext, LintIssue, IssueTarget } from '../types';

interface VsChapterResult {
  conflicts: Array<{
    field: string;
    wikiSays: string;
    chapterSays: string;
    chapterRefs: string[];
  }>;
}

function parseVsChapterJson(raw: string): VsChapterResult {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('LLM 回應不含 JSON');
  const j = JSON.parse(s.slice(start, end + 1));
  return { conflicts: Array.isArray(j.conflicts) ? j.conflicts : [] };
}

interface ChapterExcerpt {
  chapterId: string;
  excerpt: string;
}

function collectChapterExcerpts(
  chapters: Chapter[],
  aliases: string[],
  maxChapters: number,
): ChapterExcerpt[] {
  const out: ChapterExcerpt[] = [];
  for (const chapter of chapters) {
    if (out.length >= maxChapters) break;
    for (const alias of aliases) {
      const idx = chapter.content.indexOf(alias);
      if (idx < 0) continue;
      const start = Math.max(0, idx - 250);
      const end = Math.min(chapter.content.length, idx + alias.length + 250);
      out.push({ chapterId: chapter.id, excerpt: chapter.content.slice(start, end) });
      break;   // 每章只取第一個命中
    }
  }
  return out;
}

interface CharacterToCheck {
  character: Character;
  entityPage: WikiPage;
  aliases: string[];   // union of character + entity aliases
}

function selectCharactersToCheck(
  pages: WikiPage[],
  characters: Character[],
  cap: number,
): CharacterToCheck[] {
  const entityPages = pages.filter((p) => p.type === 'entity');
  const out: CharacterToCheck[] = [];
  for (const ch of characters) {
    if (!ch.name) continue;
    const entity = entityPages.find((p) =>
      p.title === ch.name || p.aliases.includes(ch.name) || p.slug === ch.name,
    );
    if (!entity) continue;

    const charAliasField = ch as unknown as { aliases?: string[] };
    const characterAliases = Array.isArray(charAliasField.aliases) ? charAliasField.aliases : [];

    const set = new Set<string>([
      ch.name, ...characterAliases, entity.title, ...entity.aliases,
    ]);
    out.push({
      character: ch,
      entityPage: entity,
      aliases: [...set].filter(Boolean),
    });
    if (out.length >= cap) break;
  }
  return out;
}

export const wikiVsChapterCheck: LintCheck = {
  id: 'wikiVsChapter',
  label: 'Wiki vs 章節事實衝突',
  kind: 'llm',
  async run(ctx: LintContext) {
    const issues: LintIssue[] = [];
    const unprocessed: Array<{ reason: string }> = [];

    const cap = ctx.prefs.maxCharactersVsChapter;
    const selected = selectCharactersToCheck(ctx.pages, ctx.characters, cap);
    const allEligible = ctx.characters.filter((c) =>
      ctx.pages.some((p) => p.type === 'entity' &&
        (p.title === c.name || p.aliases.includes(c.name) || p.slug === c.name)),
    );
    if (allEligible.length > cap) {
      unprocessed.push({
        reason: `符合條件角色 ${allEligible.length} 個，僅檢查前 ${cap} 個；剩 ${allEligible.length - cap} 個未檢查`,
      });
    }

    for (const item of selected) {
      const excerpts = collectChapterExcerpts(
        ctx.chapters, item.aliases, ctx.prefs.maxChapterExcerptsPerChar,
      );
      if (excerpts.length === 0) continue;

      const prompt = renderTemplate(ctx.aiPrompts.lintWikiVsChapterTemplate, {
        characterName: item.character.name,
        aliasesList: item.aliases.join('、'),
        wikiContent: item.entityPage.contentMd,
        chapterExcerptsJson: JSON.stringify(excerpts, null, 2),
      });

      let raw: string;
      try {
        raw = await complete(prompt, { maxTokens: 2048 }, ctx.signal);
      } catch (e) {
        throw new Error(`Wiki vs 章節 LLM (${item.character.name}) 失敗：${(e as Error).message}`, { cause: e });
      }

      let parsed: VsChapterResult;
      try {
        parsed = parseVsChapterJson(raw);
      } catch {
        raw = await complete(prompt + '\n\n（重要：請只輸出嚴格 JSON）', { maxTokens: 2048 }, ctx.signal);
        parsed = parseVsChapterJson(raw);
      }

      for (const c of parsed.conflicts) {
        // 防呆：LLM 偶爾把 wiki metadata（Aliases/Type/Related）當衝突回報
        // prompt 已明確排除，這裡再加一層過濾
        const fieldLower = (c.field || '').toLowerCase();
        if (
          fieldLower.includes('alias') || c.field?.includes('別名') ||
          fieldLower === 'type' || c.field === '類型' ||
          fieldLower === 'related' || c.field === '相關'
        ) {
          continue;
        }
        const targets: IssueTarget[] = [
          {
            kind: 'wikiPage', id: item.entityPage.id,
            label: `${item.entityPage.type}/${item.entityPage.slug}`,
          },
        ];
        for (const chapterId of c.chapterRefs) {
          const chapter = ctx.chapters.find((ch) => ch.id === chapterId);
          if (!chapter) continue;
          const excerpt = excerpts.find((e) => e.chapterId === chapterId)?.excerpt;
          targets.push({
            kind: 'chapter', id: chapter.id,
            label: `章節 ${chapter.title || chapter.id.slice(0, 6)}`,
            sourceExcerpt: excerpt,
          });
        }
        issues.push({
          id: uuid(),
          checkId: 'wikiVsChapter',
          severity: 'error',
          status: 'open',
          title: `${item.entityPage.type}/${item.entityPage.slug} 寫「${c.wikiSays}」，但章節寫「${c.chapterSays}」`,
          detail: `欄位「${c.field}」衝突。Wiki: ${c.wikiSays} ｜ 章節: ${c.chapterSays}`,
          targets,
          fix: { kind: 'llm' },
        });
      }
    }
    return { issues, unprocessed };
  },
};
