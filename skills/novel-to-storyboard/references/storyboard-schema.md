# Storyboard Schema

Use this schema for storyboard JSON intended to drive comic image generation, narration, and video assembly.

```ts
export interface Storyboard {
  chapterTitle: string
  storyboardStyle: string
  visualContinuityBible: VisualContinuityBible
  panels: StoryboardPanel[]
  qualityChecks: StoryboardQualityChecks
}

export interface VisualContinuityBible {
  characters: ContinuityCharacter[]
  locations: ContinuityLocation[]
  props: ContinuityProp[]
  styleRules: string[]
}

export interface ContinuityCharacter {
  id: string
  name: string
  stableVisualTraits: string
  outfit?: string
  expressionRange?: string
  promptAlias?: string
}

export interface ContinuityLocation {
  id: string
  name: string
  visualDescription: string
  timeOfDay?: string
  atmosphere?: string
}

export interface ContinuityProp {
  id: string
  name: string
  visualDescription: string
  ownerOrLocation?: string
}

export interface StoryboardPanel {
  panelId: string
  order: number
  sourceExcerpt: string
  beat: string
  sceneSummary: string
  location: string
  timeOfDay?: string
  characters: string[]
  shotType:
    | 'establishing'
    | 'wide'
    | 'medium'
    | 'closeup'
    | 'extreme_closeup'
    | 'over_shoulder'
    | 'action'
  cameraAngle?: string
  action: string
  emotion: string
  visualPrompt: string
  negativePrompt?: string
  dialogue: string[]
  narration: string
  durationSec: number
  continuityNotes: string[]
}

export interface StoryboardQualityChecks {
  coversMajorBeats: boolean
  characterContinuity: boolean
  sceneContinuity: boolean
  noUnsupportedInventions: boolean
  notes: string[]
}
```

Minimal valid JSON shape:

```json
{
  "chapterTitle": "",
  "storyboardStyle": "color-webtoon",
  "visualContinuityBible": {
    "characters": [],
    "locations": [],
    "props": [],
    "styleRules": []
  },
  "panels": [
    {
      "panelId": "p01",
      "order": 1,
      "sourceExcerpt": "",
      "beat": "",
      "sceneSummary": "",
      "location": "",
      "timeOfDay": "",
      "characters": [],
      "shotType": "medium",
      "cameraAngle": "",
      "action": "",
      "emotion": "",
      "visualPrompt": "",
      "negativePrompt": "",
      "dialogue": [],
      "narration": "",
      "durationSec": 5,
      "continuityNotes": []
    }
  ],
  "qualityChecks": {
    "coversMajorBeats": true,
    "characterContinuity": true,
    "sceneContinuity": true,
    "noUnsupportedInventions": true,
    "notes": []
  }
}
```
