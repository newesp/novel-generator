# Comic Single-Panel Video And Chapter Export Settings Design

## Goal

Strengthen the comic TTS video MVP by separating single-panel video generation from full-chapter video export.

The current `輸出 MP4` action is full-chapter scoped but appears inside the selected panel editor. This creates a misleading interaction: users expect it to export only the selected panel, while the renderer validates all panels and blocks when another panel is missing narration.

## Scope

In scope:

- Add a `單格輸出 MP4` action for the selected panel.
- Move full-chapter export controls out of the selected panel editor.
- Add an `整章影片設定` popup for settings that apply across the whole chapter.
- Add an `整章輸出 MP4` action near the existing ComicModal footer actions.
- Reuse ready panel segments during full-chapter export when their settings still match.

Out of scope:

- Multi-voice narration.
- Subtitle generation.
- Full-book batch rendering.
- Browser `ffmpeg.wasm`.
- Advanced motion effects.

## UI Design

### Selected Panel Editor

The selected panel editor owns panel-specific video work:

- `旁白腳本`
- `手動秒數`
- TTS/audio status display
- segment status display
- `單格輸出 MP4`

The panel editor must not contain full-chapter settings. This prevents users from interpreting global controls as panel-local controls.

### ComicModal Footer

The ComicModal footer action row owns chapter-level operations:

- `生成分鏡`
- `開始生圖`
- `整章影片設定`
- `整章輸出 MP4`

`整章影片設定` opens a popup. `整章輸出 MP4` runs the full ordered panel concat workflow.

### 整章影片設定 Popup

The popup stores settings that affect the chapter or all generated segments:

- `旁白音色`
- `格間停頓`
- `Edge-TTS`
- `ffmpeg`
- `ffprobe`
- future-ready `輸出尺寸`
- future-ready `fps`

The popup should be a focused modal or dialog layered above ComicModal. It should use a compact two-column grid on wide screens and a single-column layout on narrow screens.

## Frontend Visual QA Notes

Affected surface: full-screen `ComicModal`.

Parent hierarchy:

- `Modal`
- `.comic-modal`
- `.comic-workspace`
- selected panel editor in `.comic-detail`
- footer action row supplied through the `Modal` footer
- new settings popup layered above the modal content

Root visual issue:

Full-chapter controls currently live inside a selected-panel card, which makes their scope ambiguous and expands the already dense panel editor. Moving full-chapter controls to the footer and popup keeps panel-local editing compact and makes chapter-level actions visually distinct.

Layout strategy:

- Keep single-panel controls in the existing `.comic-narration-panel`.
- Put chapter-level buttons in the existing footer action row with wrapping.
- Put chapter settings in a popup with grid tracks and `min-width: 0` on inputs/selects.
- Avoid nesting cards inside cards; the popup is a modal surface, not a section card inside the panel editor.
- Verify no clipped footer actions, no overlapping popup controls, readable select options, and usable loading/error states.

## Rendering Architecture

Split rendering into two orchestration levels:

1. `renderComicPanelSegment()`
   - input: one `ComicPanel`, `ChapterComic`, storage, TTS provider, desktop commands, settings
   - validates only the target panel
   - resolves/materializes the panel image
   - generates or reuses TTS audio when valid
   - renders one segment mp4
   - writes `ttsAssetId`, `ttsDurationMs`, `ttsProviderId`, `ttsVoice`, and `segmentAssetId`

2. `renderComicVideo()`
   - input: ordered panels and the same settings
   - validates all panels for image and narration
   - ensures every panel has a valid segment, calling `renderComicPanelSegment()` only when needed
   - writes `concat.txt`
   - produces `chapter-video.mp4`
   - writes `videoAssetId`, `videoProviderId`, `videoSettingsJson`, and `videoStatus`

This keeps single-panel output and full-chapter output on the same underlying code path.

## Segment Reuse Rules

Full-chapter export may reuse a panel segment when all of these are true:

- `segmentAssetId` exists.
- The media asset exists.
- The segment file still exists.
- The segment metadata matches the current effective settings.

Segment metadata should include:

- `panelId`
- `sourceImageAssetId`
- `ttsAssetId`
- `ttsVoice`
- `durationSec`
- `panelPauseMs`
- `width`
- `height`
- `fps`
- `narrationHash`

Regenerate TTS and segment when:

- narration changed
- voice changed
- TTS asset missing
- TTS file missing

Regenerate only the segment when:

- image changed
- `durationSec` changed
- `panelPauseMs` changed
- width, height, or fps changed
- segment file missing

## Validation And Errors

Single-panel export validates only the selected panel:

- missing image -> `分鏡 #N 尚未建立圖片。`
- missing narration -> `分鏡 #N 尚未填寫旁白。`
- TTS/ffmpeg failure -> panel-level message and failed status

Full-chapter export validates the full ordered panel list:

- first missing image or narration blocks export with the panel number
- failed single-panel segment can be regenerated automatically if required inputs are valid
- concat failure marks chapter `videoStatus: 'failed'`

## Testing

Add or update focused tests for:

- single-panel renderer validates only one panel
- single-panel renderer writes TTS and segment metadata
- full-chapter renderer reuses valid segment assets
- full-chapter renderer regenerates stale segments when settings change
- data URL image materialization still works
- missing narration on another panel does not block `單格輸出 MP4`
- missing narration on any panel still blocks `整章輸出 MP4`

Manual UI verification:

- panel editor shows `單格輸出 MP4`
- footer shows `整章影片設定` and `整章輸出 MP4`
- popup controls do not clip or overlap
- dropdown options remain readable
- loading, success, and failure messages are scoped to the correct action
