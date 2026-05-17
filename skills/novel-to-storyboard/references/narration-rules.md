# Narration Rules

Use these rules when converting prose into panel-level narration for a voiced comic video.

## Conversion

- Convert inner monologue into concise spoken narration.
- Preserve important dialogue as dialogue, not narration.
- Remove repeated description once the image prompt carries the visual information.
- Keep cause and emotion clear even when shortening the prose.
- Avoid authorial explanation that does not help the viewer understand the scene.

## Pacing

- Normal narration: 1-2 short Chinese sentences per panel.
- Action panel: 0-1 short sentence; let the image carry movement.
- Emotional closeup: 1 focused sentence that names the emotional turn.
- Establishing panel: 1 sentence for place, tension, or time.
- Hook panel: short, memorable line.

## Duration Heuristics

- 3-4 seconds: impact shot, reveal, quick action
- 5-6 seconds: normal panel with one narration sentence
- 7-8 seconds: dialogue-heavy or emotional panel
- 9+ seconds: avoid unless the panel has multiple dialogue lines

## Dialogue

Store dialogue as an array of strings. Keep speaker names only when needed for downstream TTS:

```json
[
  "林澈：你早就知道了？",
  "沈霜：我只是比你先看見代價。"
]
```

If speaker identity is obvious from the panel and downstream TTS does not need names, omit names.
