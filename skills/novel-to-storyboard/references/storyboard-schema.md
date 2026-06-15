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
  panelNumber: number
  beat: string
  characters: string[]
  setting: string
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
  extraGroups: StoryboardExtraGroup[]
  dialogue: StoryboardDialogueLine[]
  /** Spoken narration for this panel. All panel narrations joined in order should cover the complete chapter. */
  narration: string
  /** 0 means downstream video timing should use measured TTS duration. Positive values are manual minimum seconds. */
  durationSec: number
}

export interface StoryboardExtraGroup {
  label: string
  count?: number
  role: 'crowd' | 'guards' | 'civilians' | 'creatures' | 'vehicles' | 'background'
  prompt: string
  visualPriority: 'low' | 'medium'
}

export interface StoryboardDialogueLine {
  character: string
  text: string
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
      "panelNumber": 1,
      "beat": "",
      "characters": [],
      "setting": "",
      "shotType": "medium",
      "cameraAngle": "",
      "action": "",
      "emotion": "",
      "visualPrompt": "",
      "negativePrompt": "",
      "extraGroups": [],
      "dialogue": [],
      "narration": "",
      "durationSec": 0
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
