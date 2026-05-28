import type { Character, WikiPage } from '../types';
import type { Plan, PlanCreateOp, PlanOp } from './wiki-plan';

export interface RequiredCharacterEntity {
  characterId: string;
  name: string;
  title: string;
  suggestedSlug: string;
  contentBrief: string;
  reason: string;
}

export function findRequiredCharacterEntities(input: {
  chapterContent: string;
  characters: Character[];
  pages: WikiPage[];
}): RequiredCharacterEntity[] {
  const entityPages = input.pages.filter((page) => page.type === 'entity');
  const required: RequiredCharacterEntity[] = [];

  for (const character of input.characters) {
    const name = character.name.trim();
    if (!name) continue;
    if (!input.chapterContent.includes(name)) continue;
    if (hasMatchingEntityPage(entityPages, name)) continue;

    required.push({
      characterId: character.id,
      name,
      title: name,
      suggestedSlug: slugForCharacter(character),
      contentBrief: buildCharacterContentBrief(character),
      reason: '角色庫已有且本章出現，但 Wiki entity 不存在',
    });
  }

  return required;
}

export function ensureRequiredCharacterEntityOps(input: {
  plan: Plan;
  required: RequiredCharacterEntity[];
}): Plan {
  const operations: PlanOp[] = [...input.plan.operations];
  const warnings = [...input.plan.warnings];
  const opKeys = new Set(operations.map((op) => `${op.type}/${op.slug}`));
  const opTitles = new Set(operations.filter((op) => op.type === 'entity').map((op) => opTitle(op)));

  for (const required of input.required) {
    const key = `entity/${required.suggestedSlug}`;
    if (opKeys.has(key) || opTitles.has(required.title)) continue;

    const op: PlanCreateOp = {
      action: 'create',
      type: 'entity',
      slug: required.suggestedSlug,
      title: required.title,
      aliases: [],
      description: `${required.title} 是本章出現的角色。`,
      reason: required.reason,
      content_brief: required.contentBrief,
    };
    operations.push(op);
    opKeys.add(key);
    opTitles.add(required.title);
    warnings.push(`required entity ${key} was missing from plan; appended create op`);
  }

  return { ...input.plan, operations, warnings };
}

export function formatRequiredCharacterEntitiesForPrompt(required: RequiredCharacterEntity[]): string {
  if (required.length === 0) return '(none)';
  return JSON.stringify(
    required.map((item) => ({
      name: item.name,
      suggestedSlug: item.suggestedSlug,
      reason: item.reason,
      contentBrief: item.contentBrief,
    })),
    null,
    2,
  );
}

function hasMatchingEntityPage(entityPages: WikiPage[], name: string): boolean {
  return entityPages.some((page) => page.title === name || page.aliases.includes(name));
}

function opTitle(op: PlanOp): string {
  return op.action === 'create' ? op.title : '';
}

function buildCharacterContentBrief(character: Character): string {
  const parts = [
    `角色庫：${character.name}`,
    field('性別', character.gender),
    field('年齡', character.age),
    field('種族', character.race),
    field('性格', character.personality),
    field('背景', character.background),
    field('外貌', character.appearance),
    field('能力', character.abilities),
    field('關係', character.relations),
    field('角色弧線', character.arc),
  ].filter(Boolean);
  return parts.join('；');
}

function field(label: string, value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? `${label}：${trimmed}` : '';
}

function slugForCharacter(character: Character): string {
  const explicit = asciiSlug(character.name);
  if (explicit) return explicit;

  const mapped = Array.from(character.name)
    .map((char) => CJK_SLUG_MAP[char] ?? '')
    .filter(Boolean)
    .join('-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (mapped) return mapped;

  return `character-${character.id.slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '') || 'page'}`;
}

function asciiSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

const CJK_SLUG_MAP: Record<string, string> = {
  阿: 'a',
  飛: 'fei',
  艾: 'ai',
  莉: 'li',
  亞: 'ya',
  老: 'old',
  趙: 'zhao',
  鐵: 'tie',
  臂: 'bi',
  星: 'xing',
  塵: 'chen',
  市: 'shi',
  迷: 'mi',
  霧: 'wu',
  潮: 'chao',
  汐: 'xi',
};
