# Architecture

The LLM Wiki sits between raw novel sources and generation/query flows, as a
curated, LLM-owned knowledge layer stored in the Novel Generator database.

```
┌──────────────────────────────────────────────────────────┐
│  Raw Sources (source of truth)                           │
│  Project outline, chapters, character cards, Q&A notes   │
└──────────────────────────────────────────────────────────┘
                           │
                           │ ingest
                           ▼
┌──────────────────────────────────────────────────────────┐
│  The Wiki (LLM-owned, mutable)                           │
│  WikiPage rows: concept/entity/summary/compare/synthesis │
│  WikiLogEntry rows for apply/undo/lint history           │
└──────────────────────────────────────────────────────────┘
                           │
                           │ query
                           ▼
                         User
```

## Why a wiki layer

A single story concept, character, place, faction, item, or timeline fact can
appear across many chapters. Direct retrieval over raw chapter chunks gives
fragmented, source-shaped answers. The wiki layer **rewrites** that knowledge
into story-shaped pages: one page per concept/entity/summary, synthesizing
across chapters, with explicit `relatedSlugs` cross-references.

## Properties

- **Source-derived but source-independent in shape.** A wiki page is organized
  by topic, not by which chapter produced it. `summary/ch-N` pages are the
  only pages that intentionally map 1:1 to chapter order.
- **Mutable and append-friendly.** New sources or new Q&A answers extend
  existing pages or create new ones. Pages are rewritten in place.
- **Self-describing.** The application provides these conventions, a generated
  index derived from `wiki_pages`, and operation history from `wiki_log`.
- **Cross-linked.** Pages reference each other through `relatedSlugs`
  (`{ type, slug }`). Markdown links inside `contentMd` are tolerated, but
  structured metadata is the authority used by lint, graph, and sanitizers.

## What the LLM does

The LLM owns the wiki layer. Specifically:
- Decides whether new information goes into an existing page or a new page
- Names new pages following the schema's conventions
- Updates other pages that should now cross-reference the new content
- Returns metadata that the application writes into `wiki_pages`
- Lets the application append every operation to `wiki_log`
- Periodically lints for contradictions, stale claims, and orphan pages

## What the user does

- Curates the raw sources
- Asks questions (which become wiki queries; good answers can be filed back)
- Reviews wiki pages when curious; can edit by hand if desired
- Triggers lint passes
- Can edit prompt templates and wiki preferences from the application's
  preferences modal
