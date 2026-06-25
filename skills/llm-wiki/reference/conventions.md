# Conventions

## Page types

| Type | Slug form | Purpose | Example |
|------|-----------|---------|------------------|
| concept   | `concept/<slug>`   | An idea, rule, magic system, plot thread, place type, or recurring motif | `concept/forbidden-art` |
| entity    | `entity/<slug>`    | A named character, faction, location, item, creature, or other concrete story object | `entity/lin-che` |
| summary   | `summary/<slug>`   | Chapter/source summary; chapter pages use `summary/ch-N` | `summary/ch-12` |
| compare   | `compare/<slug>`   | Side-by-side analysis of two or more concepts/entities | `compare/two-factions` |
| synthesis | `synthesis/<slug>` | Narrative cross-cutting summary spanning many pages | `synthesis/main-conflict` |

A page's type is fixed once chosen. Type changes happen only through an
explicit create/update/delete flow reviewed by the application.

## Slug rules

- ASCII, lowercase, kebab-case: `lin-che`, not `林澈`
- Singular nouns where possible: `forbidden-art`, not `forbidden-arts`
- No prefixes — the `type` field already encodes the namespace
- Avoid abbreviations unless they are canonical in the story world
- A page's H1 (top heading) can be in any language and is the human-friendly
  display title; the slug stays ASCII

## Page structure

Each `WikiPage` row stores:

```markdown
# <Display Title>

> **Type:** concept | entity | summary | compare | synthesis
> **Aliases:** alt-name-1, alt-name-2  (optional)
> **Related:** [Other Page](entity/other), [Yet Another](concept/yet-another)

## <First substantive section>

...prose...

## Sources

- [第十二章摘要](summary/ch-12) — chapter 12
- [設定總覽](synthesis/world-overview) — cross-page synthesis
```

The application parses the H1, aliases, related links, description fallback,
and body into `WikiPage.title`, `aliases`, `relatedSlugs`, `description`, and
`contentMd`. The blockquote with Type/Aliases/Related and the closing
`## Sources` section are required. Body sections in between are free-form.

## Cross-references

Use `type/slug` style links:

- Entity: `[林澈](entity/lin-che)`
- Concept: `[禁術代價](concept/forbidden-art-cost)`
- Summary: `[第十二章摘要](summary/ch-12)`

Every cross-reference target should correspond to an existing `WikiPage`
`{type, slug}`. The application sanitizes missing `relatedSlugs`, cascades
deletes, and lint reports broken links.

## Generated index

The application can generate an index from `wiki_pages`. Format:

```markdown
# Index

## Concepts
- [forbidden-art-cost](concept/forbidden-art-cost) — 禁術使用後的代價規則

## Entities
- [lin-che](entity/lin-che) — 主角林澈的能力與成長弧線

## Summaries
- [ch-12](summary/ch-12) — 第十二章事件摘要

## Comparisons
- ...

## Syntheses
- ...
```

One section per type, alphabetical within each section. Each entry is one line:
link plus `WikiPage.description`.

## wiki_log

Append-only operation history. Each `WikiLogEntry` records `batchId`, `kind`,
`opStatus`, page snapshot before/after, source, summary, and optional error:

```
source=ingest:<chapterId> kind=create page=entity/lin-che status=ok
source=lint:broken-link kind=update page=concept/forbidden-art-cost status=ok
source=undo:<batchId> kind=undo page=entity/lin-che status=ok
```
