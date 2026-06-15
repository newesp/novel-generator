# Narration Rules

Use these rules when converting prose into panel-level narration for a voiced comic video.

## Conversion

- Treat the ordered `panels[].narration` as the full spoken chapter script.
- Convert source prose into panel-aligned narration that covers the complete chapter, not a short recap.
- Preserve important dialogue as dialogue, but include its meaning in narration when the target pipeline is pure single-voice narration.
- Remove repeated description once the image prompt carries the visual information.
- Keep cause and emotion clear even when shortening the prose.
- Avoid authorial explanation that does not help the viewer understand the scene.
- Do not skip major events, relationship changes, clues, emotional turns, or the chapter ending/hook.

## Pacing

- Sentence count depends on panel count and source density.
- Fewer panels: allow more narration per panel so the chapter remains complete.
- More panels: distribute narration into shorter lines.
- Action panel: shorter narration is preferred, but do not lose causal information.
- Emotional closeup: include the emotional turn, not only the visible expression.
- Establishing panel: include place, tension, time, or relevant setup.
- Hook panel: include the final turn or suspense beat clearly.

## Coverage

- After drafting, join all panel narration in order and read it as one script.
- The joined script should be understandable without seeing the source chapter.
- Visual-only description may be omitted when the image prompt carries it, but story content should remain in narration.
- If the target panel count is too low to cover the chapter cleanly, use denser narration and add a note in `qualityChecks.notes`.

## Duration Heuristics

- `durationSec: 0` means downstream video timing should use measured TTS duration.
- Positive `durationSec` is a manual minimum; it may extend a panel but should not imply audio truncation.
- 3-4 seconds: impact shot, reveal, quick action.
- 5-6 seconds: normal panel with one narration sentence.
- 7-8 seconds: dialogue-heavy, exposition, or emotional panel.
- 9+ seconds: acceptable when a low panel count forces denser narration; prefer splitting panels when possible.

## Dialogue

Store dialogue as schema-compatible `{ character, text }` objects:

```json
[
  { "character": "林澈", "text": "你早就知道了？" },
  { "character": "沈霜", "text": "我只是比你先看見代價。" }
]
```

If speaker identity is obvious from the panel, still keep `character` populated when a named character speaks so downstream character selection and future multi-voice TTS can use it.
