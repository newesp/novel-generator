# Comic Single-Panel Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selected-panel MP4 export, move chapter video settings into a popup, and let chapter export reuse valid panel video segments.

**Architecture:** Split video rendering into a panel segment renderer and a chapter concat orchestrator. The selected panel editor calls the segment renderer; the chapter footer calls the chapter renderer, which validates all panels and reuses segment assets when metadata matches the current settings.

**Tech Stack:** React 19, TypeScript strict, Vitest, Vite, Tauri desktop commands, custom CSS.

---

### Task 1: Renderer Split And Segment Reuse

**Files:**
- Modify: `src/lib/comic/video/video-renderer.ts`
- Modify: `src/lib/comic/video/video-renderer.test.ts`

- [x] Add failing Vitest coverage for `renderComicPanelSegment()` validating only one panel, writing TTS and segment metadata, and not failing because another panel has empty narration.
- [x] Add failing Vitest coverage for `renderComicVideo()` reusing a valid segment when `generationParamsJson` matches current settings.
- [x] Export `renderComicPanelSegment(input)` from `video-renderer.ts`.
- [x] Store segment metadata with `panelId`, `sourceImageAssetId`, `ttsAssetId`, `ttsVoice`, `durationSec`, `panelPauseMs`, `width`, `height`, `fps`, and `narrationHash`.
- [x] Reuse matching segment assets in `renderComicVideo()` and regenerate stale TTS/segments when narration, voice, image, timing, or render settings change.
- [x] Run `npx vitest run src/lib/comic/video/video-renderer.test.ts`.

### Task 2: ComicModal UI And Chapter Settings Popup

**Files:**
- Modify: `src/components/comic/ComicModal.tsx`

- [x] Add state for opening and closing `整章影片設定`.
- [x] Replace the selected-panel `旁白影片` full-chapter section with a panel-scoped action row containing `單格輸出 MP4`, selected-panel status, output path when available, and panel-scoped messages.
- [x] Add `renderSelectedPanelVideo()` that validates only `selectedPanel`, calls `renderComicPanelSegment()`, updates local panel state, and keeps chapter video state untouched unless the segment fails.
- [x] Move `整章影片設定` and `整章輸出 MP4` into the `Modal` footer near the existing `生成分鏡` and `開始生圖` actions.
- [x] Add the popup containing `旁白音色`, `格間停頓`, `Edge-TTS`, `ffmpeg`, and `ffprobe`.

### Task 3: Styling, Changelog, And Verification

**Files:**
- Modify: `src/index.css`
- Modify: `docs/CHANGELOG.md`

- [x] Add CSS for the chapter video settings popup with responsive grid tracks, `min-width: 0` form controls, readable select options, and wrapped footer actions.
- [x] Update `docs/CHANGELOG.md` with the single-panel export and settings popup change.
- [x] Run `npx vitest run src/lib/comic/video/video-renderer.test.ts`.
- [x] Run `npx tsc -b`.
- [x] If a dev server is available, visually check ComicModal popup and footer at desktop width; otherwise report the UI reasoning and residual manual QA risk.
