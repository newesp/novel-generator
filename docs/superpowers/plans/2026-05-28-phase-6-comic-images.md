# Phase 6 Comic Images MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable comic images MVP: selected chapter to editable storyboard draft, provider-backed image jobs, and comic preview metadata.

**Architecture:** Add focused comic domain modules under `src/lib/comic/`, keep provider differences behind `ImageGenerationProvider`, and persist comic/panel/media metadata through the existing `StorageAdapter`. The UI enters from `ChapterEditor`, opens a modal workflow, and reuses existing LLM/settings/storage patterns.

**Tech Stack:** React 19, TypeScript, Zustand, Dexie, Tauri SQLite adapter, Vitest, existing `complete()` LLM API.

---

## File Structure

- `src/types/index.ts`: add `ChapterComic`, `ComicPanel`, `MediaAsset`, image provider settings types.
- `src/lib/comic/storyboard.ts`: parse/normalize storyboard JSON into `ComicPanel` drafts.
- `src/lib/comic/providers.ts`: provider interface, capabilities, registry, config validation helpers.
- `src/lib/comic/comfyui-provider.ts`: ComfyUI HTTP API request/poll/download normalization.
- `src/lib/comic/openai-image-provider.ts`: OpenAI-compatible image response normalization.
- `src/lib/comic/image-job-queue.ts`: deterministic sequential queue for panel generation.
- `src/lib/comic/storyboard-generate.ts`: build prompt and call LLM for storyboard draft.
- `src/lib/storage/types.ts`: add comic/panel/media stores.
- `src/lib/storage/dexie-adapter.ts`: implement stores with IndexedDB tables.
- `src/lib/storage/tauri-sqlite-adapter.ts`: implement metadata stores against existing `media_assets` plus new comic tables.
- `src/lib/db.ts`: add Dexie schema version for comics.
- `src/stores/settingsStore.ts`: add image generation provider prefs.
- `src/components/comic/ComicModal.tsx`: four-step comic UI.
- `src/components/chapters/ChapterEditor.tsx`: add `轉漫畫` entry button.
- `src/index.css`: compact styling for storyboard editor and preview.
- `docs/superpowers/specs/2026-05-28-phase-6-comic-images-design.md`: reference only.

---

## Task 1: Core Types And Storyboard Normalization

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/comic/storyboard.ts`
- Test: `src/lib/comic/storyboard.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeStoryboardDraft } from './storyboard';

describe('normalizeStoryboardDraft', () => {
  it('turns storyboard json into ordered comic panel drafts', () => {
    const result = normalizeStoryboardDraft({
      chapterTitle: '迷霧中的平衡點',
      storyboardStyle: 'manga',
      visualContinuityBible: { characters: { 阿飛: 'black hair, worn coat' } },
      panels: [
        {
          panelNumber: 2,
          beat: '衝突',
          characters: ['阿飛'],
          setting: '霧潮街口',
          action: '阿飛拔出短刀',
          emotion: '緊張',
          shotType: 'medium shot',
          cameraAngle: 'low angle',
          visualPrompt: 'manga panel, 阿飛, black hair',
          negativePrompt: 'extra fingers',
          narration: '霧壓低了街聲。',
          dialogue: [{ character: '阿飛', text: '退後。' }],
          durationSec: 4,
        },
      ],
      qualityChecks: { notes: [] },
    });

    expect(result.panels[0]).toMatchObject({
      order: 1,
      beat: '衝突',
      characters: ['阿飛'],
      location: '霧潮街口',
      visualPrompt: expect.stringContaining('阿飛'),
      negativePrompt: 'extra fingers',
      dialogue: '阿飛：退後。',
      narration: '霧壓低了街聲。',
      durationSec: 4,
      status: 'draft',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\\node_modules\\.bin\\vitest.cmd run src\\lib\\comic\\storyboard.test.ts`

Expected: FAIL because `src/lib/comic/storyboard.ts` does not exist.

- [ ] **Step 3: Implement types and normalization**

Add comic/media/image settings types, then implement `normalizeStoryboardDraft()` to coerce unknown LLM JSON into safe panel drafts. Clamp duration to 2-12 seconds, sort by `panelNumber`, and join dialogue lines as `角色：文字`.

- [ ] **Step 4: Run test to verify it passes**

Run: `.\\node_modules\\.bin\\vitest.cmd run src\\lib\\comic\\storyboard.test.ts`

Expected: PASS.

---

## Task 2: Image Provider Interfaces And Adapters

**Files:**
- Create: `src/lib/comic/providers.ts`
- Create: `src/lib/comic/openai-image-provider.ts`
- Create: `src/lib/comic/comfyui-provider.ts`
- Test: `src/lib/comic/providers.test.ts`
- Test: `src/lib/comic/openai-image-provider.test.ts`
- Test: `src/lib/comic/comfyui-provider.test.ts`

- [ ] **Step 1: Write failing tests**

Tests must cover:
- registry returns `comfyui` and `openai-compatible-image`
- OpenAI-compatible normalizes base64 and URL responses
- ComfyUI injects prompt/negative/seed/size into workflow and extracts `/view` image URL from history

- [ ] **Step 2: Run tests to verify failure**

Run: `.\\node_modules\\.bin\\vitest.cmd run src\\lib\\comic\\providers.test.ts src\\lib\\comic\\openai-image-provider.test.ts src\\lib\\comic\\comfyui-provider.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement provider modules**

Keep implementation side-effect free except `fetch`. Route browser requests through direct `fetch`; CORS constraints are surfaced as provider errors. Return data URLs for base64 online images and remote URLs for URL responses. For ComfyUI, return `/view?filename=...&subfolder=...&type=...` URLs.

- [ ] **Step 4: Run provider tests**

Run: `.\\node_modules\\.bin\\vitest.cmd run src\\lib\\comic\\providers.test.ts src\\lib\\comic\\openai-image-provider.test.ts src\\lib\\comic\\comfyui-provider.test.ts`

Expected: PASS.

---

## Task 3: Image Job Queue

**Files:**
- Create: `src/lib/comic/image-job-queue.ts`
- Test: `src/lib/comic/image-job-queue.test.ts`

- [ ] **Step 1: Write failing tests**

Tests must cover sequential generation, failed panel status, and cancel-before-next-panel behavior.

- [ ] **Step 2: Run failure**

Run: `.\\node_modules\\.bin\\vitest.cmd run src\\lib\\comic\\image-job-queue.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement queue**

Implement `runImageJobQueue({ panels, provider, requestForPanel, onPanelUpdate, signal })` with sequential `for...of`, update statuses, and `AbortError` support.

- [ ] **Step 4: Run queue tests**

Run: `.\\node_modules\\.bin\\vitest.cmd run src\\lib\\comic\\image-job-queue.test.ts`

Expected: PASS.

---

## Task 4: Storage Metadata Stores

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/storage/types.ts`
- Modify: `src/lib/storage/dexie-adapter.ts`
- Modify: `src/lib/storage/sqlite-helpers.ts`
- Modify: `src/lib/storage/tauri-sqlite-adapter.ts`
- Add migration: `src-tauri/migrations/004_comics.sql`
- Test: `src/lib/comic/storage-types.test.ts`

- [ ] **Step 1: Write store shape tests**

Use type-level smoke and Dexie adapter methods to add/list/update comics and panels.

- [ ] **Step 2: Run failure**

Run: `.\\node_modules\\.bin\\vitest.cmd run src\\lib\\comic\\storage-types.test.ts`

Expected: FAIL until store methods exist.

- [ ] **Step 3: Implement storage**

Add stores:
- `storage.comics`
- `storage.comicPanels`
- `storage.mediaAssets`

Use JSON `data` rows in SQLite to match existing table style. Keep binary out of DB.

- [ ] **Step 4: Run storage tests**

Run: `.\\node_modules\\.bin\\vitest.cmd run src\\lib\\comic\\storage-types.test.ts`

Expected: PASS.

---

## Task 5: Storyboard Generation

**Files:**
- Create: `src/lib/comic/storyboard-generate.ts`
- Test: `src/lib/comic/storyboard-generate.test.ts`

- [ ] **Step 1: Write failing tests**

Mock a completion function and verify prompt includes chapter title, characters, style preset, and required JSON output instructions.

- [ ] **Step 2: Run failure**

Run: `.\\node_modules\\.bin\\vitest.cmd run src\\lib\\comic\\storyboard-generate.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement generation helper**

Expose `generateStoryboardDraft(input, completeFn = complete)`. Parse fenced or raw JSON, then call `normalizeStoryboardDraft`.

- [ ] **Step 4: Run tests**

Run: `.\\node_modules\\.bin\\vitest.cmd run src\\lib\\comic\\storyboard-generate.test.ts`

Expected: PASS.

---

## Task 6: Settings And Comic Modal UI

**Files:**
- Modify: `src/stores/settingsStore.ts`
- Modify: `src/components/Toolbar.tsx`
- Create: `src/components/comic/ComicModal.tsx`
- Modify: `src/components/chapters/ChapterEditor.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Add settings state**

Add image provider prefs to `settingsStore` with merge defaults:
- provider id
- ComfyUI base URL + workflow mapping
- online base URL/model/API key
- default width/height/style preset

- [ ] **Step 2: Add modal**

`ComicModal` has four states:
- setup
- storyboard
- generating
- preview

It can generate storyboard, edit panels, run image jobs, retry a panel, and preview generated URLs.

- [ ] **Step 3: Add ChapterEditor entry**

Add `🎬 轉漫畫` button next to Wiki/version actions. Disable when chapter has no content.

- [ ] **Step 4: Run typecheck**

Run: `.\\node_modules\\.bin\\tsc.cmd -b`

Expected: PASS.

---

## Task 7: Verification And Commit

**Files:** all changed files.

- [ ] **Step 1: Run targeted tests**

Run: `.\\node_modules\\.bin\\vitest.cmd run src\\lib\\comic`

Expected: all comic tests pass.

- [ ] **Step 2: Run full tests**

Run: `.\\node_modules\\.bin\\vitest.cmd run`

Expected: all tests pass.

- [ ] **Step 3: Run typecheck and build**

Run:
- `.\\node_modules\\.bin\\tsc.cmd -b`
- `.\\node_modules\\.bin\\vite.cmd build`

Expected: both pass; Vite chunk-size warning is acceptable.

- [ ] **Step 4: Commit**

Commit message: `Implement comic image MVP foundation`
