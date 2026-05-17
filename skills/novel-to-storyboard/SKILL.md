---
name: novel-to-storyboard
description: Convert novel chapters or prose scenes into structured comic/storyboard panels for image generation, narration, and video assembly. Use when Codex needs to split Chinese novel content into sequential panels, create panel-level visual prompts, preserve character and scene continuity, generate narration scripts, or prepare JSON for comic/video pipelines.
---

# Novel To Storyboard

## Purpose

Transform selected novel chapter content into editable storyboard data that can drive comic panel image generation, narrated comic videos, storyboard previews, and chapter-to-video pipelines.

Do not generate final images, audio, or video in this skill. Produce structured, reviewable storyboard output that downstream tools can consume.

## Inputs To Gather

Use available project context before asking the user:

- chapter title and selected chapter text
- world setting and main plot
- character cards, especially visual traits and relationships
- relevant previous chapter summary when continuity matters
- target panel count, style preset, or video duration if provided

If a field is missing, infer conservatively and note uncertainty in `qualityChecks.notes`.

## Workflow

1. Read the selected prose and identify major beats: opening state, conflict/action, revelation, emotional peak, hook or resolution.
2. Split the content into 6-20 panels unless the user specifies a count.
3. Preserve chronological order and avoid unsupported inventions.
4. Build a `visualContinuityBible` for recurring characters, locations, props, outfits, injuries, weather, and time of day.
5. For each panel, write concrete visual data: setting, characters, action, emotion, shot type, camera angle, prompt, narration, dialogue, and duration.
6. Check continuity across panels and repair contradictions before returning.
7. Return valid JSON first, then a short summary of panel coverage and assumptions.

## Panel Count Rules

- Short scene: 4-6 panels
- Normal chapter section: 8-12 panels
- Full long chapter: 12-20 panels
- Action-heavy content: more panels with shorter durations
- Dialogue-heavy content: fewer panels with more expression and camera variation

## Continuity Rules

- Use character card details when available.
- Repeat stable visual identifiers in every panel prompt where the character appears.
- Do not invent named characters unless the source clearly implies them.
- Use stable placeholders for unnamed people, such as `unnamed_guard_01`.
- Track outfits, injuries, props, weather, location, and time of day.
- Mark important persistent details in `continuityNotes`.

## Output Requirements

Return JSON matching the structure in `references/storyboard-schema.md`. The top-level output must include:

- `chapterTitle`
- `storyboardStyle`
- `visualContinuityBible`
- `panels`
- `qualityChecks`

Each panel must include an image-model-ready `visualPrompt` and video-ready `narration`.

## Image Prompt Rules

Write prompts as concrete visual instructions:

- Include medium/style, characters, setting, action, emotion, composition, and lighting.
- Avoid abstract plot explanation.
- Avoid literary prose that cannot be drawn.
- Keep prompt details consistent with the continuity bible.
- Add `negativePrompt` for common failures such as extra limbs, inconsistent faces, unreadable text, or wrong style.

Use `references/panel-style-guide.md` when the user asks for a specific visual mode or when choosing a default style.

## Narration Rules

Write narration for spoken video pacing:

- Compress prose; do not copy whole paragraphs.
- Keep dialogue separate from narration.
- Avoid describing visuals already obvious in the panel unless the meaning would be unclear.
- Make intense action panels shorter and quieter emotional panels slightly longer.

Use `references/narration-rules.md` for pacing and conversion details.

## Quality Gate

Before final output, verify:

- The storyboard covers the chapter's main plot movement.
- Every named character is handled consistently.
- Panel order is coherent.
- Visual prompts are drawable and not overly abstract.
- Narration duration roughly matches `durationSec`.
- No major event, relationship, prop, or location is invented without support from the source.
