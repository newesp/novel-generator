# Comic TTS Video MVP Design

## Context

`modules/10-multimedia.md` already defines the target feature as "continuous comic images + AI narration -> uploadable mp4". The current Phase 6 comic foundation can generate editable panels and panel images. `ComicPanel` already includes `dialogue`, `narration`, and `durationSec`, while `MediaAssetKind` already reserves `tts_audio` and `video`.

The missing pieces are:

- storyboard generation must reliably produce a narration script for every panel;
- each panel needs a TTS audio asset and measured audio duration;
- video export must use per-panel timing derived from audio, manual duration overrides, and padding;
- desktop export needs a native command boundary for Edge-TTS and ffmpeg.

This design covers the first shippable MVP for one chapter at a time.

## Goals

- Generate or edit a pure narration script per comic panel.
- Produce one TTS audio file per panel with a single narrator voice.
- Compose one mp4 per chapter from generated panel images and narration audio.
- Make the output suitable for YouTube upload: mp4, H.264 video, AAC audio, yuv420p, fixed canvas size.
- Keep provider and command boundaries replaceable so Edge-TTS can later be swapped for ElevenLabs or another provider.

## Non-Goals

- Multi-character voices and per-dialogue speaker casting.
- Subtitles burned into video or exported as SRT/VTT.
- Full-book batch rendering.
- Browser-only ffmpeg.wasm export.
- Cloud video rendering.
- Advanced motion effects such as pan/zoom, transitions, or animated speech bubbles.
- A single large ffmpeg filter graph path.

## Key Decisions

### Reasoning Level

Implementation should use high reasoning for the data model, timing rules, Tauri command boundary, Edge-TTS adapter, ffmpeg composition, and error recovery. UI wiring and simple form work can use medium reasoning after those contracts are fixed.

### TTS Provider

MVP uses Edge-TTS because it is lightweight, has a CLI, supports Mandarin voices, can output mp3, and fits a local-first desktop flow. It must be wrapped behind a `TTSProvider` interface rather than called directly from UI code.

Edge-TTS is not an official paid stability contract, so the provider abstraction is mandatory. ElevenLabs can be added later with the same request/result shape.

### Audio Scope

MVP is pure narration with a single selected voice. `ComicPanel.narration` is the canonical spoken script. `ComicPanel.dialogue` remains available for comic display and future multi-voice support, but it is not spoken in the MVP unless the user manually includes it in `narration`.

The full chapter narration is the ordered concatenation of all panel narration. The target is not a short summary; the joined narration should cover the complete chapter content in spoken form. Panel count controls narration density:

- fewer panels mean each panel can carry more narration;
- more panels mean narration is distributed into shorter lines;
- visually obvious description can move to `visualPrompt`, but plot movement, cause/effect, emotional turns, important dialogue meaning, and chapter hooks must remain in the spoken script.

### Duration Rule

Each panel has three relevant time values:

- `audioDurationMs`: measured duration of the generated TTS file.
- `durationSec`: existing manual/fallback panel duration.
- `panelPauseMs`: export setting for silence and visual hold after each panel.

The effective panel duration is:

```ts
const manualDurationMs = panel.durationSec > 0 ? panel.durationSec * 1000 : 0;
const baseDurationMs = Math.max(audioDurationMs, manualDurationMs);
const effectiveDurationMs = baseDurationMs + panelPauseMs;
```

`durationSec` may extend a panel but never truncates narration. If `durationSec > 0` and is shorter than the TTS audio, the audio duration wins to avoid cutting speech.

Default `panelPauseMs` is 400ms. The export UI should offer at least 0, 250, 400, 600, and 1000ms. A separate `endingHoldMs` can default to 1200ms for the last panel, but the MVP may use the same `panelPauseMs` for all panels if UI space is tight.

## Chosen Composition Approach

### Panel Segments + Concat List

Generate one mp4 segment per panel, then concatenate them with ffmpeg concat demuxer.

Flow:

```text
panel image + panel audio + timing -> segment-001.mp4
panel image + panel audio + timing -> segment-002.mp4
panel image + panel audio + timing -> segment-003.mp4
segments + concat.txt -> chapter-video.mp4
```

Pros:

- Clear failure boundary per panel.
- Easy to retry one broken segment.
- `concat.txt` stays simple and deterministic.
- Avoids a very large ffmpeg filter graph.

Cons:

- Produces temporary segment files.
- Requires consistent segment encoding settings to allow `-c copy` concat.

This is the MVP design.

### Future Consideration: Browser ffmpeg.wasm

Use ffmpeg.wasm in the browser for Web export.

Pros:

- No desktop-only dependency.

Cons:

- Slow and memory-heavy for chapter-length video.
- Large output download flows are unreliable.
- Conflicts with the project direction that large media belongs in desktop/native file storage.

Deferred to a future Web fallback.

## Data Model

Reuse existing `MediaAsset` for binary metadata:

- panel TTS files use `kind: 'tts_audio'`;
- final chapter videos use `kind: 'video'`;
- comic panel images continue to use `kind: 'comic_panel_image'`.

Add panel-level optional TTS metadata:

```ts
type ComicPanelTtsStatus = 'idle' | 'queued' | 'generating' | 'ready' | 'failed';

interface ComicPanel {
  narration: string;
  durationSec: number;
  ttsStatus?: ComicPanelTtsStatus;
  ttsAssetId?: string;
  ttsDurationMs?: number;
  ttsProviderId?: string;
  ttsVoice?: string;
  ttsErrorMessage?: string;
}
```

Add comic-level optional video export metadata:

```ts
type ChapterComicVideoStatus = 'idle' | 'generating_audio' | 'rendering_segments' | 'concatenating' | 'ready' | 'failed';

interface ChapterComic {
  videoStatus?: ChapterComicVideoStatus;
  videoAssetId?: string;
  videoProviderId?: string;
  videoSettingsJson?: string;
  videoErrorMessage?: string;
}
```

`videoSettingsJson` stores the effective export settings snapshot, including voice, panel pause, output dimensions, fps, codec settings, and source panel ids. It is not used as the source of truth for future edits.

The first implementation must update Dexie and SQLite adapters through `StorageAdapter`, plus a new SQLite migration. UI and library code must not import Dexie or SQLite directly.

## Storyboard Generation

The storyboard prompt should make `narration` a required field for every panel:

- Chinese spoken prose sized to the target panel count and source content density;
- suitable for direct TTS narration;
- no image prompt syntax;
- no speaker labels unless intentionally part of the narration;
- faithful to the panel beat and chapter prose.

The quality gate should validate chapter-level spoken coverage, not only per-panel brevity. When all `panels[].narration` are joined in order, the result should read as a complete chapter narration script. It may be compressed for video pacing, but it must not skip major events, relationship changes, key clues, emotional turns, or the chapter ending/hook.

Normalization keeps `narration` as a trimmed string. If LLM output omits narration, the fallback is an empty string and the UI marks the panel as needing narration before audio generation.

`durationSec` remains a number. For new storyboard output, the preferred default is `0`, meaning "use measured TTS duration". Existing panels with non-zero duration keep their behavior as manual minimum duration.

## TTS Pipeline

Introduce a provider interface:

```ts
interface TTSGenerationRequest {
  text: string;
  voice: string;
  outputPath: string;
  format: 'mp3';
}

interface TTSGenerationResult {
  asset: MediaAsset;
  durationMs: number;
  providerId: string;
  voice: string;
}

interface TTSProvider {
  id: string;
  label: string;
  generate(request: TTSGenerationRequest): Promise<TTSGenerationResult>;
}
```

The Edge-TTS adapter runs an approved desktop command path, not arbitrary shell strings. The command boundary should pass arguments as structured values:

```text
edge-tts --voice zh-TW-HsiaoChenNeural --text <panel narration> --write-media panel-001.mp3
```

Audio duration should be measured after file creation. Prefer ffprobe if bundled with ffmpeg; otherwise use a small Rust-side duration helper or ffmpeg probing command. Do not trust estimated text length as final timing.

Panel generation is resumable:

- skip panels with ready `ttsAssetId` unless the user chooses regenerate;
- fail one panel without deleting other ready audio;
- persist `ttsErrorMessage` for panel-level recovery.

## Video Pipeline

### Segment Rendering

For each panel:

1. Resolve current panel image asset.
2. Resolve or generate panel TTS asset.
3. Measure `audioDurationMs`.
4. Compute `effectiveDurationMs`.
5. Create an audio stream with trailing silence equal to `effectiveDurationMs - audioDurationMs`.
6. Render a segment with fixed encoding settings.

Expected ffmpeg behavior:

- input image loops for `effectiveDurationMs`;
- audio is the TTS file plus any required silence;
- output is H.264/AAC/yuv420p mp4;
- dimensions are normalized to the selected canvas, default 1920x1080 with contain/letterbox rather than crop.

### Concat List

After all segments are ready, write a concat list next to the segments:

```txt
file 'segment-001.mp4'
file 'segment-002.mp4'
file 'segment-003.mp4'
```

Then concatenate:

```text
ffmpeg -f concat -safe 0 -i concat.txt -c copy chapter-video.mp4
```

The concat list should not contain separate silence entries. Pauses belong inside each segment so each panel remains an independent timing unit.

### Output Asset

The final mp4 is registered as a `MediaAsset` with:

- `kind: 'video'`;
- `projectId` and `chapterId`;
- `path` to the local file in desktop mode;
- `mimeType: 'video/mp4'`;
- `sizeBytes` if available;
- `generationParamsJson` with export settings and source asset ids.

## File Layout

The long-term target is a media file adapter. The MVP can start with a deterministic desktop media folder and keep metadata in `StorageAdapter`.

Recommended logical layout:

```text
media/
  <projectId>/
    chapters/
      <chapterId>/
        comic-video/
          audio/
            panel-001.mp3
          segments/
            segment-001.mp4
          concat.txt
          chapter-video.mp4
```

Temporary segment files may be retained for debugging in MVP. A later cleanup option can delete segments after successful concat.

When a panel is deleted, all panel-owned media files and metadata must be deleted or marked for cleanup:

- panel TTS audio asset;
- generated segment file for that panel;
- stale concat list entries;
- any panel-scoped temporary files.

Deleting a panel image variant should keep following the existing comic image history rules. Deleting the panel itself should remove assets that exist only for that panel and then rerender the concat list/video before publishing a new final mp4.

## Tauri Boundary

Current Tauri setup only includes SQLite and log plugins. This feature needs a desktop command boundary for Edge-TTS, ffmpeg, and ffprobe.

Preferred shape:

- Rust commands expose narrow operations such as `generate_tts_audio`, `probe_audio_duration`, `render_comic_video_segment`, and `concat_comic_video`.
- Frontend never builds arbitrary shell command strings.
- Commands accept structured JSON arguments and validate paths under the app media directory.
- Sidecars or configured binary paths are detected before export starts.

If sidecar bundling is not ready in the first implementation, the UI may require configured local binary paths for `edge-tts`, `ffmpeg`, and `ffprobe`, but the command execution still belongs behind the same narrow boundary.

## UI Workflow

ComicModal gets a video/export section after storyboard and images are ready.

Any implementation that changes this UI must use the `frontend-visual-qa` skill. The affected surface is the full-screen ComicModal, especially the selected panel editor and export controls. Verification must check for clipped controls, overflowing narration fields, understandable loading/failure states, and panel rail/editor/sidebar layout behavior at the existing modal sizes.

Minimum controls:

- narrator voice select;
- panel pause select;
- output size select, default 1920x1080;
- generate missing narration audio;
- render video;
- open/download final mp4.

Panel editor should show:

- narration textarea;
- TTS status;
- measured audio duration when ready;
- effective duration preview using `max(audio, durationSec) + padding`;
- regenerate audio for this panel.

Before video render, validation should block export when:

- any panel has no current image;
- any panel has empty narration;
- required desktop binaries are missing;
- TTS audio failed and was not regenerated.

## Error Handling

Errors are scoped to the smallest unit:

- storyboard narration missing: panel-level validation message;
- TTS failure: panel `ttsStatus: 'failed'` and `ttsErrorMessage`;
- segment render failure: comic `videoStatus: 'failed'` with panel id in the error message;
- concat failure: comic `videoStatus: 'failed'`, segments retained for inspection.

Regeneration rules:

- editing `narration` marks the panel TTS as stale or clears `ttsAssetId`;
- changing voice or provider requires regenerating all audio;
- changing `durationSec` or `panelPauseMs` does not require regenerating TTS, only rerendering segments/video;
- replacing a panel image does not require regenerating TTS, only rerendering segments/video.
- deleting a panel removes panel-owned TTS and segment artifacts, rewrites the concat list, and marks the final video stale.

## Testing

Code changes for this feature should run `tsc -b` per project instructions.

Focused unit coverage should include:

- effective duration calculation;
- storyboard normalization for required narration and `durationSec: 0`;
- TTS provider request construction without shell string concatenation;
- media asset creation for TTS and final video;
- concat list generation with escaped Windows paths;
- cleanup behavior when deleting a panel with TTS and segment artifacts;
- SQLite/Dexie round-trip for new optional fields.

Manual desktop verification should cover:

- one chapter with 2-3 panels renders to playable mp4;
- `durationSec = 0` uses measured audio duration;
- `durationSec > audio` extends still image and pads silence;
- `durationSec < audio` does not truncate speech;
- `panelPauseMs` changes final video timing;
- one failed panel can be regenerated without losing other audio.

## Implementation Slice

1. Data model and storage migration for optional TTS/video metadata.
2. Storyboard prompt and normalization update so narration is consistently produced.
3. Timing helper and tests.
4. TTS provider interface and Edge-TTS desktop command boundary.
5. Audio generation UI and per-panel status.
6. ffmpeg segment renderer, concat list writer, and final video asset registration.
7. ComicModal export controls and validation.

The first implementation should stop at single-chapter, pure narration, single-voice video export. Multi-voice dialogue, subtitles, full-book queues, and motion effects should remain separate specs or later follow-up plans.
