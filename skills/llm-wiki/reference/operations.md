# Operations

Three primary operations: **ingest**, **query**, **lint**. In Novel Generator,
all operations work against database-backed `WikiPage` rows and `WikiLogEntry`
history, not a physical wiki folder.

---

## Ingest

New information arrives from one of two sources:

- **Q&A**: a chat exchange (user question + assistant answer) the user wants to file
- **Source**: a raw source the user wants assimilated into the wiki

Both follow the same two-pass shape.

### Pass 1 — Plan (`prompts/ingest-plan.md`)

Inputs:
- The new content (Q&A pair or source summary)
- Current generated index (so the LLM knows what pages exist)
- Wiki conventions / prompt wrapper
- Application-provided integrity hints, when available, such as required character entities detected from the local character table and the current chapter text

Output (JSON):
```json
{
  "operations": [
    {
      "action": "create",
      "type": "concept",
      "slug": "forbidden-art-cost",
      "title": "禁術代價",
      "reason": "...",
      "content_brief": "..."
    },
    {
      "action": "update",
      "type": "entity",
      "slug": "lin-che",
      "reason": "...",
      "change_brief": "..."
    }
  ],
  "log_entry": "ingest qa=\"...\" pages_created=1 pages_updated=1"
}
```

### Pass 2 — Apply (`prompts/ingest-apply-create.md`, `prompts/ingest-apply-update.md`)

For each operation, one LLM call:
- **create**: produce full page content following the conventions, including
  the required header blockquote and `## Sources` section
- **update**: given the current page content + the new information + reason,
  produce the new full page content

Caller parses the returned markdown into `WikiPage` fields, writes
`wiki_pages`, sanitizes `relatedSlugs`, updates FTS/search indexes, and writes
`wiki_log` entries with before/after snapshots.

Application guards run around the LLM plan/apply steps. In the Novel Generator
integration, related refs are sanitized against the current Wiki index, deletes
cascade stale refs, and required character entities can be appended to the plan
when a known character appears in the chapter but has no Wiki entity yet.

### Cost note

A typical ingest is 1 plan call + 2–4 apply calls. Use a cheaper model for
plan and the user's preferred model for apply, or use the cheaper one
throughout if budget-sensitive.

---

## Query

Query currently uses deterministic relevance scoring over `WikiPage` title,
slug, aliases, description, and content. The older two-pass LLM pick-pages
shape remains planned as an optional upgrade.

### Pass 1 — Pick pages (`prompts/query-pick-pages.md`)

Inputs:
- User's question
- Generated wiki index / page metadata
- Wiki conventions

Output (JSON):
```json
{
  "pages": ["concept/forbidden-art-cost", "entity/lin-che"],
  "reasoning": "..."
}
```

### Pass 2 — Answer (`prompts/query-answer.md`)

Inputs:
- User's question
- The full text of every selected `WikiPage`
- Optionally: any other raw sources the user explicitly attached
- Wiki conventions / application prompt wrapper

Output: the natural-language answer, with citations to wiki pages.

The application is responsible for the system-prompt wrapper around the wiki
content (e.g. "this is your maintained wiki, prefer it over raw sources").
This wrapper is intentionally outside the prompt files because applications
will want to customize it — see your application's config for the template.

### Small-wiki shortcut

If the wiki is small (e.g. total content < 2000 tokens), Pass 1 can be
skipped: read all pages and inject them directly. The application implements
the threshold.

---

## Lint

Periodic maintenance pass. Reads a sample (or all) of the wiki and identifies:

- **Contradictions** between pages
- **Stale claims** that newer sources have superseded
- **Orphan pages** with no inbound links
- **Broken links** to nonexistent pages
- **Duplicates** (two pages covering the same concept)
- **Misclassified pages** (e.g. a `concept/` that is actually an `entity/`)

Novel Generator implements deterministic structural checks plus LLM-assisted
checks. Lint reports issues; user-approved fixes write `wiki_log` entries and
update page metadata/content through the same storage path as ingest.
