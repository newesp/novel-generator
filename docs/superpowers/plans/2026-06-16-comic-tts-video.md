# Comic TTS Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-chapter comic video MVP that turns generated comic panels plus single-voice Edge-TTS narration into a YouTube-ready mp4 using per-panel segments and a concat list.

**Architecture:** Keep metadata in existing `StorageAdapter` JSON-backed comic/media records. Add focused comic video helpers under `src/lib/comic/video/`, narrow Tauri Rust commands for file/ffmpeg/Edge-TTS operations, and a small ComicModal video export surface. Each panel owns its narration audio and segment artifacts; the final chapter video is a `MediaAsset`.

**Tech Stack:** React 19, TypeScript strict, Vite 8, Dexie 4, Tauri 2, Rust `std::process::Command`, Edge-TTS CLI, ffmpeg/ffprobe, existing custom CSS, Vitest focused tests, final `tsc -b`.

---

## Scope And File Structure

This plan implements the approved `docs/superpowers/specs/2026-06-14-comic-tts-video-design.md` only. It does not add multi-character TTS, subtitles, full-book batch rendering, browser ffmpeg.wasm, pan/zoom motion, or a single huge ffmpeg filter graph.

Files to create:

- `src/lib/comic/video/timing.ts` - pure duration calculation helpers.
- `src/lib/comic/video/timing.test.ts` - unit tests for timing rules.
- `src/lib/comic/video/concat-list.ts` - ffmpeg concat list generation and escaping.
- `src/lib/comic/video/concat-list.test.ts` - Windows-path concat list tests.
- `src/lib/comic/video/desktop-commands.ts` - typed frontend wrappers around Tauri invoke commands.
- `src/lib/comic/video/tts-provider.ts` - `TTSProvider` interface and Edge-TTS provider adapter.
- `src/lib/comic/video/video-renderer.ts` - orchestration for audio generation, segment rendering, concat, asset registration.
- `src/lib/comic/video/video-renderer.test.ts` - pure orchestration tests with mocked providers/storage.
- `src/lib/comic/video/panel-cleanup.ts` - panel-owned media cleanup helper.
- `src/lib/comic/video/panel-cleanup.test.ts` - cleanup tests.
- `src-tauri/migrations/007_comic_tts_video_metadata.sql` - SQLite migration for useful media lookup index.

Files to modify:

- `src/types/index.ts` - optional TTS/video metadata fields and status types.
- `src/lib/db.ts` - Dexie version 9 if an index is needed; otherwise no schema change.
- `src/lib/storage/types.ts` - add `MediaAssetStore.listByProjectAndKind()` only if needed by cleanup/listing.
- `src/lib/storage/dexie-adapter.ts` - implement any new media store helper.
- `src/lib/storage/tauri-sqlite-adapter.ts` - implement any new media store helper and include migration-compatible queries.
- `src/lib/storage/sqlite-helpers.ts` - row round-trip stays JSON-based but tests must include new optional fields.
- `src/lib/comic/storage-types.test.ts` - round-trip new fields.
- `src/lib/tauri-migrations.test.ts` - assert migration 7 is registered.
- `src-tauri/src/lib.rs` - add Tauri commands and register migration 7.
- `src-tauri/Cargo.toml` - no new dependency unless implementation chooses a crate for path helpers; prefer std.
- `src/lib/prompt-defaults.ts` - update default comic storyboard template for chapter-complete narration and `durationSec: 0`.
- `src/lib/comic/storyboard.ts` - allow `durationSec: 0` and default new panels to 0.
- `src/lib/comic/storyboard.test.ts` - cover `durationSec: 0` and narration preservation.
- `src/lib/comic/storyboard-generate.test.ts` - cover prompt instructions and JSON repair with duration 0.
- `src/components/comic/ComicModal.tsx` - add narration/TTS/video UI, integrate cleanup on panel delete.
- `src/index.css` - layout styles for video export controls and narration/TTS states.
- `docs/CHANGELOG.md` - record implementation when code is complete.

Existing dirty worktree note: `modules/10-multimedia.md` currently has an unrelated uncommitted formatting diff. Do not stage or revert it unless the user explicitly asks.

---

### Task 1: Types And Timing Rules

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/comic/video/timing.ts`
- Create: `src/lib/comic/video/timing.test.ts`
- Modify: `src/lib/comic/storage-types.test.ts`

- [ ] **Step 1: Add failing timing tests**

Create `src/lib/comic/video/timing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calculatePanelTiming } from './timing';

describe('calculatePanelTiming', () => {
  it('uses measured audio duration when durationSec is 0', () => {
    expect(calculatePanelTiming({ audioDurationMs: 3200, durationSec: 0, panelPauseMs: 400 })).toEqual({
      audioDurationMs: 3200,
      manualDurationMs: 0,
      baseDurationMs: 3200,
      effectiveDurationMs: 3600,
      trailingSilenceMs: 400,
    });
  });

  it('extends short audio when durationSec is longer', () => {
    expect(calculatePanelTiming({ audioDurationMs: 2100, durationSec: 5, panelPauseMs: 400 })).toMatchObject({
      manualDurationMs: 5000,
      baseDurationMs: 5000,
      effectiveDurationMs: 5400,
      trailingSilenceMs: 3300,
    });
  });

  it('does not truncate audio when durationSec is shorter', () => {
    expect(calculatePanelTiming({ audioDurationMs: 7200, durationSec: 3, panelPauseMs: 250 })).toMatchObject({
      manualDurationMs: 3000,
      baseDurationMs: 7200,
      effectiveDurationMs: 7450,
      trailingSilenceMs: 250,
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/video/timing.test.ts
```

Expected: FAIL because `src/lib/comic/video/timing.ts` does not exist.

- [ ] **Step 3: Add the timing helper**

Create `src/lib/comic/video/timing.ts`:

```ts
export interface PanelTimingInput {
  audioDurationMs: number;
  durationSec: number;
  panelPauseMs: number;
}

export interface PanelTiming {
  audioDurationMs: number;
  manualDurationMs: number;
  baseDurationMs: number;
  effectiveDurationMs: number;
  trailingSilenceMs: number;
}

export function calculatePanelTiming(input: PanelTimingInput): PanelTiming {
  const audioDurationMs = Math.max(0, Math.round(input.audioDurationMs));
  const manualDurationMs = input.durationSec > 0 ? Math.round(input.durationSec * 1000) : 0;
  const panelPauseMs = Math.max(0, Math.round(input.panelPauseMs));
  const baseDurationMs = Math.max(audioDurationMs, manualDurationMs);
  const effectiveDurationMs = baseDurationMs + panelPauseMs;

  return {
    audioDurationMs,
    manualDurationMs,
    baseDurationMs,
    effectiveDurationMs,
    trailingSilenceMs: Math.max(0, effectiveDurationMs - audioDurationMs),
  };
}

export function msToSeconds(ms: number): number {
  return Math.max(0, Math.round(ms) / 1000);
}
```

- [ ] **Step 4: Add optional metadata types**

Modify `src/types/index.ts` near existing comic types:

```ts
export type ComicPanelTtsStatus = 'idle' | 'queued' | 'generating' | 'ready' | 'failed';
export type ChapterComicVideoStatus = 'idle' | 'generating_audio' | 'rendering_segments' | 'concatenating' | 'ready' | 'failed';
```

Extend `ChapterComic`:

```ts
  videoStatus?: ChapterComicVideoStatus;
  videoAssetId?: string;
  videoProviderId?: string;
  videoSettingsJson?: string;
  videoErrorMessage?: string;
```

Extend `ComicPanel`:

```ts
  ttsStatus?: ComicPanelTtsStatus;
  ttsAssetId?: string;
  ttsDurationMs?: number;
  ttsProviderId?: string;
  ttsVoice?: string;
  ttsErrorMessage?: string;
  segmentAssetId?: string;
```

Use `segmentAssetId` only for cleanup/debug if segments are registered as temporary `MediaAsset` records. If the implementation stores segments as files only, leave `segmentAssetId` undefined and cleanup by deterministic path.

- [ ] **Step 5: Update row helper tests**

Modify objects in `src/lib/comic/storage-types.test.ts`:

```ts
const comic: ChapterComic = {
  // existing fields...
  videoStatus: 'ready',
  videoAssetId: 'video-asset',
  videoProviderId: 'ffmpeg',
  videoSettingsJson: '{"panelPauseMs":400}',
  videoErrorMessage: undefined,
};

const panel: ComicPanel = {
  // existing fields...
  durationSec: 0,
  ttsStatus: 'ready',
  ttsAssetId: 'tts-asset',
  ttsDurationMs: 3200,
  ttsProviderId: 'edge-tts',
  ttsVoice: 'zh-TW-HsiaoChenNeural',
};
```

- [ ] **Step 6: Run focused tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/video/timing.test.ts src/lib/comic/storage-types.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/types/index.ts src/lib/comic/video/timing.ts src/lib/comic/video/timing.test.ts src/lib/comic/storage-types.test.ts
git commit -m "Add comic video timing metadata"
```

---

### Task 2: Storyboard Prompt And Normalization

**Files:**
- Modify: `src/lib/prompt-defaults.ts`
- Modify: `src/lib/comic/storyboard.ts`
- Modify: `src/lib/comic/storyboard.test.ts`
- Modify: `src/lib/comic/storyboard-generate.test.ts`

- [ ] **Step 1: Add failing storyboard tests**

In `src/lib/comic/storyboard.test.ts`, add:

```ts
it('allows durationSec 0 for TTS-measured timing', () => {
  const result = normalizeStoryboardDraft({
    chapterTitle: '測試章',
    panels: [
      {
        panelNumber: 1,
        beat: '開場',
        action: '主角看見城市',
        narration: '城市在霧裡醒來，主角第一次聽見地下傳來的鐘聲。',
        durationSec: 0,
      },
    ],
  });

  expect(result.panels[0].durationSec).toBe(0);
  expect(result.panels[0].narration).toContain('地下傳來的鐘聲');
});
```

In `src/lib/comic/storyboard-generate.test.ts`, add an assertion to the existing prompt-rendering test:

```ts
expect(prompt).toContain('ordered panels[].narration');
expect(prompt).toContain('complete spoken chapter script');
expect(prompt).toContain('"durationSec": 0');
```

- [ ] **Step 2: Run tests to verify failures**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/storyboard.test.ts src/lib/comic/storyboard-generate.test.ts
```

Expected: FAIL because `normalizeStoryboardDraft()` clamps 0 up to 2 and the default prompt still says `durationSec: 4`.

- [ ] **Step 3: Update normalization**

Modify duration handling in `src/lib/comic/storyboard.ts`:

```ts
durationSec: normalizeDurationSec(panel.durationSec),
```

Add helper near `clamp()`:

```ts
function normalizeDurationSec(value: unknown): number {
  const duration = numberValue(value, 0);
  if (duration <= 0) return 0;
  return clamp(duration, 2, 60);
}
```

Leave existing `clamp()` for other numeric use.

- [ ] **Step 4: Update default comic storyboard template**

Modify `DEFAULT_COMIC_STORYBOARD_TEMPLATE` in `src/lib/prompt-defaults.ts` so the output requirements include:

```text
- panels[].narration 是影片旁白腳本，不是短摘要。所有 panels[].narration 依序串起來後，必須能構成完整章節念稿。
- 旁白句數依目標格數與內容密度調整：格數少時單格可承載較多旁白；格數多時分散成較短句。
- 可把純視覺描述交給 visualPrompt，但主要事件、因果、情緒轉折、關鍵線索、重要對白含義、章末 hook 必須留在 narration。
- panels[].durationSec 預設輸出 0，代表影片合成時使用 TTS 實測音訊長度；只有需要手動延長畫面時才輸出正數。
```

In the JSON schema example inside the template, change:

```json
"durationSec": 0
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/storyboard.test.ts src/lib/comic/storyboard-generate.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/prompt-defaults.ts src/lib/comic/storyboard.ts src/lib/comic/storyboard.test.ts src/lib/comic/storyboard-generate.test.ts
git commit -m "Update storyboard narration rules"
```

---

### Task 3: Storage Helpers And Migration Registration

**Files:**
- Create: `src-tauri/migrations/007_comic_tts_video_metadata.sql`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri-migrations.test.ts`
- Optional Modify: `src/lib/storage/types.ts`
- Optional Modify: `src/lib/storage/dexie-adapter.ts`
- Optional Modify: `src/lib/storage/tauri-sqlite-adapter.ts`

- [ ] **Step 1: Add failing migration test**

Modify `src/lib/tauri-migrations.test.ts`:

```ts
expect(libRs).toContain('version: 7');
expect(libRs).toContain('../migrations/007_comic_tts_video_metadata.sql');
```

- [ ] **Step 2: Run failing migration test**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/tauri-migrations.test.ts
```

Expected: FAIL because migration 7 is not registered.

- [ ] **Step 3: Add migration**

Create `src-tauri/migrations/007_comic_tts_video_metadata.sql`:

```sql
-- Comic TTS/video metadata stays in JSON data columns.
-- This index speeds chapter-level lookup of tts_audio and video MediaAsset rows.
CREATE INDEX IF NOT EXISTS idx_media_assets_chapter_kind_created
ON media_assets(chapter_id, kind, created_at);
```

- [ ] **Step 4: Register migration**

Modify `src-tauri/src/lib.rs` after version 6:

```rust
    Migration {
      version: 7,
      description: "comic TTS and video metadata indexes",
      sql: include_str!("../migrations/007_comic_tts_video_metadata.sql"),
      kind: MigrationKind::Up,
    },
```

- [ ] **Step 5: Add media helper only if implementation needs it**

If later tasks need efficient project/kind listing, extend `MediaAssetStore` in `src/lib/storage/types.ts`:

```ts
  listByProjectAndKind(projectId: string, kind: MediaAssetKind): Promise<MediaAsset[]>;
```

Dexie implementation:

```ts
listByProjectAndKind: async (projectId, kind) => {
  const assets = await db.mediaAssets.where('projectId').equals(projectId).toArray();
  return assets.filter((asset) => asset.kind === kind).sort((a, b) => a.createdAt - b.createdAt);
},
```

SQLite implementation:

```ts
listByProjectAndKind: async (projectId, kind) => {
  const db = await getDb();
  const rows = await db.select<MediaAssetRow[]>(
    `SELECT ${MEDIA_ASSET_COLS} FROM media_assets WHERE project_id=$1 AND kind=$2 ORDER BY created_at ASC`,
    [projectId, kind],
  );
  return rows.map(rowToMediaAsset);
},
```

Do not add this helper if no later code calls it.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/tauri-migrations.test.ts src/lib/comic/storage-types.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/migrations/007_comic_tts_video_metadata.sql src-tauri/src/lib.rs src/lib/tauri-migrations.test.ts src/lib/storage/types.ts src/lib/storage/dexie-adapter.ts src/lib/storage/tauri-sqlite-adapter.ts
git commit -m "Register comic video metadata migration"
```

If storage helper files were not modified, omit them from `git add`.

---

### Task 4: Desktop Command Boundary

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Create: `src/lib/comic/video/desktop-commands.ts`

- [ ] **Step 1: Add frontend command wrapper**

Create `src/lib/comic/video/desktop-commands.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';

export interface GenerateTtsAudioArgs {
  edgeTtsBin: string;
  text: string;
  voice: string;
  outputPath: string;
}

export interface ProbeAudioDurationArgs {
  ffprobeBin: string;
  inputPath: string;
}

export interface RenderSegmentArgs {
  ffmpegBin: string;
  imagePath: string;
  audioPath: string;
  outputPath: string;
  durationMs: number;
  trailingSilenceMs: number;
  width: number;
  height: number;
  fps: number;
}

export interface ConcatVideoArgs {
  ffmpegBin: string;
  concatListPath: string;
  outputPath: string;
}

export interface DeleteMediaFileArgs {
  path: string;
}

export const desktopComicVideoCommands = {
  generateTtsAudio: (args: GenerateTtsAudioArgs) => invoke<void>('generate_tts_audio', { args }),
  probeAudioDuration: (args: ProbeAudioDurationArgs) => invoke<number>('probe_audio_duration', { args }),
  renderSegment: (args: RenderSegmentArgs) => invoke<void>('render_comic_video_segment', { args }),
  concatVideo: (args: ConcatVideoArgs) => invoke<void>('concat_comic_video', { args }),
  deleteMediaFile: (args: DeleteMediaFileArgs) => invoke<void>('delete_media_file', { args }),
};
```

- [ ] **Step 2: Add Rust command structs and helpers**

Modify `src-tauri/src/lib.rs`. Add imports:

```rust
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
```

Add structs:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateTtsAudioArgs {
  edge_tts_bin: String,
  text: String,
  voice: String,
  output_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeAudioDurationArgs {
  ffprobe_bin: String,
  input_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenderSegmentArgs {
  ffmpeg_bin: String,
  image_path: String,
  audio_path: String,
  output_path: String,
  duration_ms: u64,
  trailing_silence_ms: u64,
  width: u32,
  height: u32,
  fps: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConcatVideoArgs {
  ffmpeg_bin: String,
  concat_list_path: String,
  output_path: String,
}

#[derive(Debug, Deserialize)]
struct DeleteMediaFileArgs {
  path: String,
}
```

Add helpers:

```rust
fn ensure_parent_dir(path: &str) -> Result<(), String> {
  let parent = Path::new(path)
    .parent()
    .ok_or_else(|| format!("Path has no parent: {path}"))?;
  fs::create_dir_all(parent).map_err(|err| format!("Failed to create {}: {err}", parent.display()))
}

fn run_command(mut command: Command, label: &str) -> Result<(), String> {
  let output = command.output().map_err(|err| format!("Failed to start {label}: {err}"))?;
  if output.status.success() {
    return Ok(());
  }
  let stderr = String::from_utf8_lossy(&output.stderr);
  let stdout = String::from_utf8_lossy(&output.stdout);
  Err(format!("{label} failed: {stderr}{stdout}"))
}

fn seconds_arg(ms: u64) -> String {
  format!("{:.3}", ms as f64 / 1000.0)
}
```

- [ ] **Step 3: Add Rust commands**

Add commands before `run()`:

```rust
#[tauri::command]
fn generate_tts_audio(args: GenerateTtsAudioArgs) -> Result<(), String> {
  ensure_parent_dir(&args.output_path)?;
  let mut command = Command::new(args.edge_tts_bin);
  command
    .arg("--voice")
    .arg(args.voice)
    .arg("--text")
    .arg(args.text)
    .arg("--write-media")
    .arg(args.output_path);
  run_command(command, "edge-tts")
}

#[tauri::command]
fn probe_audio_duration(args: ProbeAudioDurationArgs) -> Result<u64, String> {
  let output = Command::new(args.ffprobe_bin)
    .arg("-v")
    .arg("error")
    .arg("-show_entries")
    .arg("format=duration")
    .arg("-of")
    .arg("default=noprint_wrappers=1:nokey=1")
    .arg(args.input_path)
    .output()
    .map_err(|err| format!("Failed to start ffprobe: {err}"))?;

  if !output.status.success() {
    return Err(format!("ffprobe failed: {}", String::from_utf8_lossy(&output.stderr)));
  }

  let text = String::from_utf8_lossy(&output.stdout);
  let seconds = text.trim().parse::<f64>().map_err(|err| format!("Invalid ffprobe duration {text:?}: {err}"))?;
  Ok((seconds * 1000.0).round().max(0.0) as u64)
}

#[tauri::command]
fn render_comic_video_segment(args: RenderSegmentArgs) -> Result<(), String> {
  ensure_parent_dir(&args.output_path)?;
  let duration = seconds_arg(args.duration_ms);
  let silence = seconds_arg(args.trailing_silence_ms);
  let scale = format!(
    "[0:v]scale=w={}:h={}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v]",
    args.width, args.height, args.width, args.height
  );
  let audio = "[1:a][2:a]concat=n=2:v=0:a=1[a]";
  let filter_complex = format!("{scale};{audio}");

  let mut command = Command::new(args.ffmpeg_bin);
  command
    .arg("-y")
    .arg("-loop").arg("1")
    .arg("-t").arg(duration)
    .arg("-i").arg(args.image_path)
    .arg("-i").arg(args.audio_path)
    .arg("-f").arg("lavfi")
    .arg("-t").arg(silence)
    .arg("-i").arg("anullsrc=channel_layout=stereo:sample_rate=44100")
    .arg("-filter_complex").arg(filter_complex)
    .arg("-map").arg("[v]")
    .arg("-map").arg("[a]")
    .arg("-r").arg(args.fps.to_string())
    .arg("-c:v").arg("libx264")
    .arg("-preset").arg("veryfast")
    .arg("-pix_fmt").arg("yuv420p")
    .arg("-c:a").arg("aac")
    .arg("-shortest")
    .arg(args.output_path);
  run_command(command, "ffmpeg segment render")
}

#[tauri::command]
fn concat_comic_video(args: ConcatVideoArgs) -> Result<(), String> {
  ensure_parent_dir(&args.output_path)?;
  let mut command = Command::new(args.ffmpeg_bin);
  command
    .arg("-y")
    .arg("-f").arg("concat")
    .arg("-safe").arg("0")
    .arg("-i").arg(args.concat_list_path)
    .arg("-c").arg("copy")
    .arg(args.output_path);
  run_command(command, "ffmpeg concat")
}

#[tauri::command]
fn delete_media_file(args: DeleteMediaFileArgs) -> Result<(), String> {
  let path = PathBuf::from(args.path);
  if path.exists() {
    fs::remove_file(&path).map_err(|err| format!("Failed to delete {}: {err}", path.display()))?;
  }
  Ok(())
}
```

- [ ] **Step 4: Register invoke handler**

Modify the Tauri builder chain before `.run(...)`:

```rust
    .invoke_handler(tauri::generate_handler![
      generate_tts_audio,
      probe_audio_duration,
      render_comic_video_segment,
      concat_comic_video,
      delete_media_file,
    ])
```

- [ ] **Step 5: Run TypeScript and Rust compile checks**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: both commands exit 0. If `cargo check` is slow, still run it because this task changes Rust code.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/lib.rs src/lib/comic/video/desktop-commands.ts
git commit -m "Add comic video desktop commands"
```

---

### Task 5: TTS Provider And Concat List Helpers

**Files:**
- Create: `src/lib/comic/video/tts-provider.ts`
- Create: `src/lib/comic/video/concat-list.ts`
- Create: `src/lib/comic/video/concat-list.test.ts`

- [ ] **Step 1: Add failing concat-list tests**

Create `src/lib/comic/video/concat-list.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildConcatList } from './concat-list';

describe('buildConcatList', () => {
  it('writes one file line per segment with escaped backslashes', () => {
    expect(buildConcatList([
      'C:\\media\\chapter 1\\segment-001.mp4',
      'C:\\media\\chapter 1\\segment-002.mp4',
    ])).toBe([
      "file 'C:/media/chapter 1/segment-001.mp4'",
      "file 'C:/media/chapter 1/segment-002.mp4'",
      '',
    ].join('\n'));
  });

  it('escapes single quotes for concat demuxer paths', () => {
    expect(buildConcatList(["C:\\media\\Leo's book\\segment-001.mp4"]))
      .toBe("file 'C:/media/Leo'\\''s book/segment-001.mp4'\n");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/video/concat-list.test.ts
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Add concat-list helper**

Create `src/lib/comic/video/concat-list.ts`:

```ts
export function buildConcatList(segmentPaths: string[]): string {
  return `${segmentPaths.map((path) => `file '${escapeConcatPath(path)}'`).join('\n')}\n`;
}

export function escapeConcatPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/'/g, "'\\''");
}
```

- [ ] **Step 4: Add Edge-TTS provider adapter**

Create `src/lib/comic/video/tts-provider.ts`:

```ts
import type { MediaAsset } from '../../../types';
import type { GenerateTtsAudioArgs, ProbeAudioDurationArgs } from './desktop-commands';
import { desktopComicVideoCommands } from './desktop-commands';

export interface TTSGenerationRequest {
  projectId: string;
  chapterId: string;
  text: string;
  voice: string;
  outputPath: string;
  edgeTtsBin: string;
  ffprobeBin: string;
}

export interface TTSGenerationResult {
  asset: MediaAsset;
  durationMs: number;
  providerId: string;
  voice: string;
}

export interface TTSProvider {
  id: string;
  label: string;
  generate(request: TTSGenerationRequest): Promise<TTSGenerationResult>;
}

export const edgeTtsProvider: TTSProvider = {
  id: 'edge-tts',
  label: 'Edge-TTS',
  async generate(request) {
    const ttsArgs: GenerateTtsAudioArgs = {
      edgeTtsBin: request.edgeTtsBin,
      text: request.text,
      voice: request.voice,
      outputPath: request.outputPath,
    };
    await desktopComicVideoCommands.generateTtsAudio(ttsArgs);

    const probeArgs: ProbeAudioDurationArgs = {
      ffprobeBin: request.ffprobeBin,
      inputPath: request.outputPath,
    };
    const durationMs = await desktopComicVideoCommands.probeAudioDuration(probeArgs);
    const now = Date.now();

    return {
      asset: {
        id: crypto.randomUUID(),
        projectId: request.projectId,
        chapterId: request.chapterId,
        kind: 'tts_audio',
        path: request.outputPath,
        mimeType: 'audio/mpeg',
        providerId: 'edge-tts',
        generationParamsJson: JSON.stringify({ voice: request.voice }),
        createdAt: now,
      },
      durationMs,
      providerId: 'edge-tts',
      voice: request.voice,
    };
  },
};
```

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/video/concat-list.test.ts
.\node_modules\.bin\tsc.cmd -b
```

Expected: PASS and typecheck exit 0.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/comic/video/tts-provider.ts src/lib/comic/video/concat-list.ts src/lib/comic/video/concat-list.test.ts
git commit -m "Add comic video TTS helpers"
```

---

### Task 6: Video Renderer Orchestration

**Files:**
- Create: `src/lib/comic/video/video-renderer.ts`
- Create: `src/lib/comic/video/video-renderer.test.ts`

- [ ] **Step 1: Add renderer tests with mocked dependencies**

Create `src/lib/comic/video/video-renderer.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';
import { renderComicVideo } from './video-renderer';

const comic: ChapterComic = {
  id: 'comic',
  projectId: 'book',
  chapterId: 'chapter',
  title: 'chapter video',
  status: 'ready',
  stylePreset: 'manga',
  providerId: 'comfyui',
  visualContinuityBibleJson: '{}',
  createdAt: 1,
  updatedAt: 2,
};

const panel = (patch: Partial<ComicPanel>): ComicPanel => ({
  id: 'panel-1',
  comicId: 'comic',
  order: 1,
  beat: '開場',
  characters: [],
  location: '',
  shotType: '',
  cameraAngle: '',
  visualPrompt: '',
  negativePrompt: '',
  dialogue: '',
  narration: '完整旁白',
  durationSec: 0,
  assetId: 'image-1',
  status: 'ready',
  createdAt: 1,
  updatedAt: 2,
  ...patch,
});

describe('renderComicVideo', () => {
  it('uses max audio/manual duration plus panel pause for segment duration', async () => {
    const imageAsset: MediaAsset = {
      id: 'image-1',
      projectId: 'book',
      chapterId: 'chapter',
      kind: 'comic_panel_image',
      path: 'C:/media/image.png',
      mimeType: 'image/png',
      createdAt: 1,
    };
    const storage = {
      mediaAssets: {
        get: vi.fn(async () => imageAsset),
        add: vi.fn(async () => undefined),
      },
      comicPanels: {
        update: vi.fn(async () => undefined),
      },
      comics: {
        update: vi.fn(async () => undefined),
      },
    };
    const ttsProvider = {
      id: 'edge-tts',
      label: 'Edge-TTS',
      generate: vi.fn(async () => ({
        asset: {
          id: 'tts-1',
          projectId: 'book',
          chapterId: 'chapter',
          kind: 'tts_audio' as const,
          path: 'C:/media/audio.mp3',
          mimeType: 'audio/mpeg',
          createdAt: 2,
        },
        durationMs: 7200,
        providerId: 'edge-tts',
        voice: 'zh-TW-HsiaoChenNeural',
      })),
    };
    const commands = {
      renderSegment: vi.fn(async () => undefined),
      concatVideo: vi.fn(async () => undefined),
      probeAudioDuration: vi.fn(),
      generateTtsAudio: vi.fn(),
      deleteMediaFile: vi.fn(),
    };
    const writeTextFile = vi.fn(async () => undefined);

    await renderComicVideo({
      comic,
      panels: [panel({ durationSec: 3 })],
      storage,
      ttsProvider,
      commands,
      writeTextFile,
      settings: {
        mediaRoot: 'C:/media/book/chapter/comic-video',
        edgeTtsBin: 'edge-tts',
        ffmpegBin: 'ffmpeg',
        ffprobeBin: 'ffprobe',
        voice: 'zh-TW-HsiaoChenNeural',
        panelPauseMs: 400,
        width: 1920,
        height: 1080,
        fps: 30,
      },
    });

    expect(commands.renderSegment).toHaveBeenCalledWith(expect.objectContaining({
      durationMs: 7600,
      trailingSilenceMs: 400,
    }));
    expect(commands.concatVideo).toHaveBeenCalled();
    expect(storage.mediaAssets.add).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video' }));
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/video/video-renderer.test.ts
```

Expected: FAIL because renderer does not exist.

- [ ] **Step 3: Implement renderer**

Create `src/lib/comic/video/video-renderer.ts`:

```ts
import type { ChapterComic, ComicPanel, MediaAsset } from '../../../types';
import type { StorageAdapter } from '../../storage/types';
import type { TTSProvider } from './tts-provider';
import type { desktopComicVideoCommands } from './desktop-commands';
import { buildConcatList } from './concat-list';
import { calculatePanelTiming } from './timing';

type Commands = typeof desktopComicVideoCommands;

export interface ComicVideoSettings {
  mediaRoot: string;
  edgeTtsBin: string;
  ffmpegBin: string;
  ffprobeBin: string;
  voice: string;
  panelPauseMs: number;
  width: number;
  height: number;
  fps: number;
}

export interface RenderComicVideoInput {
  comic: ChapterComic;
  panels: ComicPanel[];
  storage: Pick<StorageAdapter, 'mediaAssets' | 'comicPanels' | 'comics'>;
  ttsProvider: TTSProvider;
  commands: Commands;
  writeTextFile: (path: string, content: string) => Promise<void>;
  settings: ComicVideoSettings;
}

export async function renderComicVideo(input: RenderComicVideoInput): Promise<MediaAsset> {
  const { comic, panels, storage, ttsProvider, commands, settings } = input;
  const segmentPaths: string[] = [];

  await storage.comics.update(comic.id, { videoStatus: 'generating_audio', videoErrorMessage: undefined, updatedAt: Date.now() });

  for (const panel of panels) {
    if (!panel.assetId) throw new Error(`Panel #${panel.order} has no image asset.`);
    if (!panel.narration.trim()) throw new Error(`Panel #${panel.order} has empty narration.`);

    const imageAsset = await storage.mediaAssets.get(panel.assetId);
    const imagePath = imageAsset?.path ?? imageAsset?.url;
    if (!imagePath) throw new Error(`Panel #${panel.order} image has no file path or URL.`);

    const audioPath = `${settings.mediaRoot}/audio/panel-${String(panel.order).padStart(3, '0')}.mp3`;
    await storage.comicPanels.update(panel.id, { ttsStatus: 'generating', ttsErrorMessage: undefined });
    const tts = await ttsProvider.generate({
      projectId: comic.projectId,
      chapterId: comic.chapterId,
      text: panel.narration,
      voice: settings.voice,
      outputPath: audioPath,
      edgeTtsBin: settings.edgeTtsBin,
      ffprobeBin: settings.ffprobeBin,
    });
    await storage.mediaAssets.add(tts.asset);
    await storage.comicPanels.update(panel.id, {
      ttsStatus: 'ready',
      ttsAssetId: tts.asset.id,
      ttsDurationMs: tts.durationMs,
      ttsProviderId: tts.providerId,
      ttsVoice: tts.voice,
      updatedAt: Date.now(),
    });

    const timing = calculatePanelTiming({
      audioDurationMs: tts.durationMs,
      durationSec: panel.durationSec,
      panelPauseMs: settings.panelPauseMs,
    });
    const segmentPath = `${settings.mediaRoot}/segments/segment-${String(panel.order).padStart(3, '0')}.mp4`;
    await storage.comics.update(comic.id, { videoStatus: 'rendering_segments', updatedAt: Date.now() });
    await commands.renderSegment({
      ffmpegBin: settings.ffmpegBin,
      imagePath,
      audioPath,
      outputPath: segmentPath,
      durationMs: timing.effectiveDurationMs,
      trailingSilenceMs: timing.trailingSilenceMs,
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
    });
    segmentPaths.push(segmentPath);
  }

  const concatListPath = `${settings.mediaRoot}/concat.txt`;
  await input.writeTextFile(concatListPath, buildConcatList(segmentPaths));
  const outputPath = `${settings.mediaRoot}/chapter-video.mp4`;
  await storage.comics.update(comic.id, { videoStatus: 'concatenating', updatedAt: Date.now() });
  await commands.concatVideo({ ffmpegBin: settings.ffmpegBin, concatListPath, outputPath });

  const videoAsset: MediaAsset = {
    id: crypto.randomUUID(),
    projectId: comic.projectId,
    chapterId: comic.chapterId,
    kind: 'video',
    path: outputPath,
    mimeType: 'video/mp4',
    providerId: 'ffmpeg',
    generationParamsJson: JSON.stringify({
      ...settings,
      sourcePanelIds: panels.map((panel) => panel.id),
    }),
    createdAt: Date.now(),
  };
  await storage.mediaAssets.add(videoAsset);
  await storage.comics.update(comic.id, {
    videoStatus: 'ready',
    videoAssetId: videoAsset.id,
    videoProviderId: 'ffmpeg',
    videoSettingsJson: videoAsset.generationParamsJson,
    videoErrorMessage: undefined,
    updatedAt: Date.now(),
  });
  return videoAsset;
}
```

This implementation intentionally uses `writeTextFile` injection. Wire it to a Tauri command or a tiny Rust command in a later step if the browser cannot write the file directly.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/video/video-renderer.test.ts src/lib/comic/video/timing.test.ts src/lib/comic/video/concat-list.test.ts
.\node_modules\.bin\tsc.cmd -b
```

Expected: PASS and typecheck exit 0.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/comic/video/video-renderer.ts src/lib/comic/video/video-renderer.test.ts
git commit -m "Add comic video renderer"
```

---

### Task 7: Panel Cleanup For Deleted Panels

**Files:**
- Create: `src/lib/comic/video/panel-cleanup.ts`
- Create: `src/lib/comic/video/panel-cleanup.test.ts`
- Modify: `src/components/comic/ComicModal.tsx`

- [ ] **Step 1: Add failing cleanup test**

Create `src/lib/comic/video/panel-cleanup.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ComicPanel, MediaAsset } from '../../../types';
import { cleanupPanelVideoArtifacts } from './panel-cleanup';

const panel: ComicPanel = {
  id: 'panel-1',
  comicId: 'comic',
  order: 2,
  beat: '刪除',
  characters: [],
  location: '',
  shotType: '',
  cameraAngle: '',
  visualPrompt: '',
  negativePrompt: '',
  dialogue: '',
  narration: '',
  durationSec: 0,
  ttsAssetId: 'tts-1',
  segmentAssetId: 'segment-1',
  status: 'draft',
  createdAt: 1,
  updatedAt: 1,
};

describe('cleanupPanelVideoArtifacts', () => {
  it('deletes panel-owned TTS and segment assets plus files', async () => {
    const assets: Record<string, MediaAsset> = {
      'tts-1': { id: 'tts-1', projectId: 'book', chapterId: 'ch', kind: 'tts_audio', path: 'C:/a.mp3', mimeType: 'audio/mpeg', createdAt: 1 },
      'segment-1': { id: 'segment-1', projectId: 'book', chapterId: 'ch', kind: 'video', path: 'C:/s.mp4', mimeType: 'video/mp4', createdAt: 1 },
    };
    const storage = {
      mediaAssets: {
        get: vi.fn(async (id: string) => assets[id]),
        delete: vi.fn(async () => undefined),
      },
    };
    const commands = { deleteMediaFile: vi.fn(async () => undefined) };

    await cleanupPanelVideoArtifacts({ panel, storage, commands });

    expect(commands.deleteMediaFile).toHaveBeenCalledWith({ path: 'C:/a.mp3' });
    expect(commands.deleteMediaFile).toHaveBeenCalledWith({ path: 'C:/s.mp4' });
    expect(storage.mediaAssets.delete).toHaveBeenCalledWith('tts-1');
    expect(storage.mediaAssets.delete).toHaveBeenCalledWith('segment-1');
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/video/panel-cleanup.test.ts
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Add cleanup helper**

Create `src/lib/comic/video/panel-cleanup.ts`:

```ts
import type { ComicPanel } from '../../../types';
import type { StorageAdapter } from '../../storage/types';
import type { desktopComicVideoCommands } from './desktop-commands';

type Commands = Pick<typeof desktopComicVideoCommands, 'deleteMediaFile'>;

export async function cleanupPanelVideoArtifacts({
  panel,
  storage,
  commands,
}: {
  panel: ComicPanel;
  storage: Pick<StorageAdapter, 'mediaAssets'>;
  commands: Commands;
}): Promise<void> {
  const assetIds = Array.from(new Set([panel.ttsAssetId, panel.segmentAssetId].filter((id): id is string => Boolean(id))));

  for (const assetId of assetIds) {
    const asset = await storage.mediaAssets.get(assetId);
    if (asset?.path) {
      await commands.deleteMediaFile({ path: asset.path });
    }
    await storage.mediaAssets.delete(assetId);
  }
}
```

- [ ] **Step 4: Wire cleanup into panel deletion**

Modify `deletePanel()` in `src/components/comic/ComicModal.tsx`:

```ts
import { desktopComicVideoCommands } from '../../lib/comic/video/desktop-commands';
import { cleanupPanelVideoArtifacts } from '../../lib/comic/video/panel-cleanup';
```

Inside `deletePanel` after image asset deletion:

```ts
await cleanupPanelVideoArtifacts({
  panel,
  storage,
  commands: desktopComicVideoCommands,
});
if (comic.videoAssetId || comic.videoStatus === 'ready') {
  const staleVideoPatch = {
    videoStatus: 'idle' as const,
    videoAssetId: undefined,
    videoErrorMessage: '分鏡已變更，請重新輸出影片。',
    updatedAt: Date.now(),
  };
  setComic((current) => current ? { ...current, ...staleVideoPatch } : current);
  await storage.comics.update(comic.id, staleVideoPatch);
}
```

If TypeScript rejects `undefined` in `Partial<ChapterComic>` for optional fields, use:

```ts
const staleVideoPatch: Partial<ChapterComic> = {
  videoStatus: 'idle',
  videoAssetId: undefined,
  videoErrorMessage: '分鏡已變更，請重新輸出影片。',
  updatedAt: Date.now(),
};
```

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/video/panel-cleanup.test.ts
.\node_modules\.bin\tsc.cmd -b
```

Expected: PASS and typecheck exit 0.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/comic/video/panel-cleanup.ts src/lib/comic/video/panel-cleanup.test.ts src/components/comic/ComicModal.tsx
git commit -m "Clean comic video artifacts on panel delete"
```

---

### Task 8: ComicModal Video UI

**Required Skill:** Use `frontend-visual-qa` before editing and before declaring this task complete.

**Files:**
- Modify: `src/components/comic/ComicModal.tsx`
- Modify: `src/index.css`
- Possibly Modify: `src/lib/comic/video/video-renderer.ts`

- [ ] **Step 1: Apply frontend visual QA diagnosis before editing**

Record this diagnosis in the implementation notes before editing:

```text
Affected surface: full-screen ComicModal.
Parent hierarchy: .comic-modal modal -> .comic-workspace grid -> .comic-detail selected panel editor and .comic-side sidebar.
Root-cause hypothesis: adding video controls into the existing editor grid can create horizontal clipping because .comic-editor-grid is a two-column grid and textareas/buttons compete for width.
Layout strategy: put video controls in a dedicated full-width section inside .comic-panel-card, use compact grid/flex rows with wrapping, and keep narration textarea full-width.
```

- [ ] **Step 2: Add state and defaults**

In `ComicModal.tsx`, add state near existing `useState` calls:

```ts
const [videoVoice, setVideoVoice] = useState('zh-TW-HsiaoChenNeural');
const [panelPauseMs, setPanelPauseMs] = useState(400);
const [videoMessage, setVideoMessage] = useState('');
const [videoAsset, setVideoAsset] = useState<MediaAsset | null>(null);
const [edgeTtsBin, setEdgeTtsBin] = useState('edge-tts');
const [ffmpegBin, setFfmpegBin] = useState('ffmpeg');
const [ffprobeBin, setFfprobeBin] = useState('ffprobe');
```

If these settings should persist, add a follow-up task to settings store. For MVP, component state is acceptable.

- [ ] **Step 3: Add narration editor and duration preview**

In selected panel card before visual prompt boxes, add:

```tsx
<section className="comic-narration-panel">
  <div className="comic-prompt-field-header">
    <span>旁白腳本</span>
    <span>{selectedPanel.ttsDurationMs ? `音訊 ${Math.round(selectedPanel.ttsDurationMs / 100) / 10}s` : '尚未產生音訊'}</span>
  </div>
  <textarea
    value={selectedPanel.narration}
    onChange={(event) => updatePanel(selectedPanel, {
      narration: event.target.value,
      ttsStatus: 'idle',
      ttsAssetId: undefined,
      ttsDurationMs: undefined,
      ttsErrorMessage: undefined,
    })}
  />
  <small>
    影片時長會使用 max(TTS 實測長度, 手動秒數) + 停頓；durationSec 為 0 時完全依音訊長度。
  </small>
</section>
```

Add a `durationSec` input if not already visible:

```tsx
<label className="comic-video-number-field">
  <FieldLabel label="手動秒數" help="0 代表使用 TTS 實測長度；正數只會延長畫面，不會截斷音訊。" />
  <input
    type="number"
    min={0}
    step={0.5}
    value={selectedPanel.durationSec}
    onChange={(event) => updatePanel(selectedPanel, { durationSec: Number(event.target.value) || 0 })}
  />
</label>
```

- [ ] **Step 4: Add export controls**

Add a full-width section near image actions:

```tsx
<section className="comic-video-export">
  <header>
    <h3>旁白影片</h3>
    <span>{comic?.videoStatus ?? 'idle'}</span>
  </header>
  <div className="comic-video-export-grid">
    <label>
      <FieldLabel label="旁白音色" help="MVP 使用單一 Edge-TTS 旁白音色。" />
      <select value={videoVoice} onChange={(event) => setVideoVoice(event.target.value)}>
        <option value="zh-TW-HsiaoChenNeural">zh-TW-HsiaoChenNeural</option>
        <option value="zh-TW-YunJheNeural">zh-TW-YunJheNeural</option>
        <option value="zh-CN-XiaoxiaoNeural">zh-CN-XiaoxiaoNeural</option>
      </select>
    </label>
    <label>
      <FieldLabel label="格間停頓" help="每格音訊後加入的靜音與畫面停留時間。" />
      <select value={panelPauseMs} onChange={(event) => setPanelPauseMs(Number(event.target.value))}>
        <option value={0}>0ms</option>
        <option value={250}>250ms</option>
        <option value={400}>400ms</option>
        <option value={600}>600ms</option>
        <option value={1000}>1000ms</option>
      </select>
    </label>
    <label>
      <FieldLabel label="Edge-TTS" help="可填 edge-tts 或完整路徑。" />
      <input value={edgeTtsBin} onChange={(event) => setEdgeTtsBin(event.target.value)} />
    </label>
    <label>
      <FieldLabel label="ffmpeg" help="可填 ffmpeg 或完整路徑。" />
      <input value={ffmpegBin} onChange={(event) => setFfmpegBin(event.target.value)} />
    </label>
  </div>
  <div className="comic-video-actions">
    <Button variant="secondary" disabled={busy || !comic || panels.length === 0} onClick={() => void renderVideo()}>
      輸出影片
    </Button>
    {videoAsset?.path && <span title={videoAsset.path}>已輸出：{videoAsset.path}</span>}
  </div>
  {videoMessage && <p className="comic-message">{videoMessage}</p>}
</section>
```

- [ ] **Step 5: Add render handler**

Import:

```ts
import { edgeTtsProvider } from '../../lib/comic/video/tts-provider';
import { desktopComicVideoCommands } from '../../lib/comic/video/desktop-commands';
import { renderComicVideo } from '../../lib/comic/video/video-renderer';
```

Add handler:

```ts
const renderVideo = async () => {
  if (!comic) return;
  const missingImage = panels.find((panel) => !panel.assetId);
  if (missingImage) {
    setVideoMessage(`分鏡 #${missingImage.order} 尚未有圖片。`);
    return;
  }
  const missingNarration = panels.find((panel) => !panel.narration.trim());
  if (missingNarration) {
    setVideoMessage(`分鏡 #${missingNarration.order} 尚未填旁白。`);
    return;
  }

  try {
    setBusy(true);
    setVideoMessage('正在輸出旁白影片...');
    const asset = await renderComicVideo({
      comic,
      panels,
      storage,
      ttsProvider: edgeTtsProvider,
      commands: desktopComicVideoCommands,
      writeTextFile: async () => {
        throw new Error('writeTextFile Tauri command 尚未接上。');
      },
      settings: {
        mediaRoot: `media/${comic.projectId}/chapters/${comic.chapterId}/comic-video`,
        edgeTtsBin,
        ffmpegBin,
        ffprobeBin,
        voice: videoVoice,
        panelPauseMs,
        width: 1920,
        height: 1080,
        fps: 30,
      },
    });
    setVideoAsset(asset);
    setVideoMessage('影片輸出完成。');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setVideoMessage(message);
    await storage.comics.update(comic.id, { videoStatus: 'failed', videoErrorMessage: message, updatedAt: Date.now() });
  } finally {
    setBusy(false);
  }
};
```

If the renderer needs a real concat-list file writer, add `write_text_file` to Task 4 Rust commands before using this UI.

- [ ] **Step 6: Add CSS with structural layout**

Modify `src/index.css`:

```css
.comic-narration-panel,
.comic-video-export {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-muted);
}

.comic-narration-panel textarea {
  min-height: 120px;
  resize: vertical;
}

.comic-video-export header,
.comic-video-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.comic-video-export-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.comic-video-export-grid label,
.comic-video-number-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.comic-video-export-grid input,
.comic-video-export-grid select,
.comic-video-number-field input {
  min-width: 0;
}

@media (max-width: 1100px) {
  .comic-video-export-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Run typecheck**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
```

Expected: PASS.

- [ ] **Step 8: Frontend visual QA**

Start dev server:

```powershell
.\node_modules\.bin\vite.cmd --host 127.0.0.1
```

Use Browser plugin to inspect `http://127.0.0.1:5173` with a comic modal open. Acceptance checklist:

- no video controls clipped in `.comic-detail`;
- narration textarea does not overlap history or prompt fields;
- export grid wraps to one column at narrower modal widths;
- loading/error text stays inside export panel;
- destructive panel delete remains visually distinct;
- no hidden horizontal overflow in `.comic-workspace`.

- [ ] **Step 9: Commit**

```powershell
git add src/components/comic/ComicModal.tsx src/index.css
git commit -m "Add comic video export UI"
```

---

### Task 9: Fill Missing File Writer And Manual Desktop Path

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/comic/video/desktop-commands.ts`
- Modify: `src/components/comic/ComicModal.tsx`

- [ ] **Step 1: Add frontend wrapper**

Add to `desktop-commands.ts`:

```ts
export interface WriteTextFileArgs {
  path: string;
  content: string;
}
```

Add method:

```ts
writeTextFile: (args: WriteTextFileArgs) => invoke<void>('write_text_file', { args }),
```

- [ ] **Step 2: Add Rust command**

Add struct:

```rust
#[derive(Debug, Deserialize)]
struct WriteTextFileArgs {
  path: String,
  content: String,
}
```

Add command:

```rust
#[tauri::command]
fn write_text_file(args: WriteTextFileArgs) -> Result<(), String> {
  ensure_parent_dir(&args.path)?;
  fs::write(&args.path, args.content)
    .map_err(|err| format!("Failed to write {}: {err}", args.path))
}
```

Register in `generate_handler!`.

- [ ] **Step 3: Wire UI writer**

Replace the placeholder `writeTextFile` in `renderVideo()`:

```ts
writeTextFile: (path, content) => desktopComicVideoCommands.writeTextFile({ path, content }),
```

- [ ] **Step 4: Use absolute media root before manual desktop test**

If relative `media/...` paths fail in Tauri, add a Rust command to resolve app data media path:

```rust
#[tauri::command]
fn resolve_media_root(app: tauri::AppHandle, project_id: String, chapter_id: String) -> Result<String, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|err| format!("Failed to resolve app data dir: {err}"))?
    .join("media")
    .join(project_id)
    .join("chapters")
    .join(chapter_id)
    .join("comic-video");
  fs::create_dir_all(&dir).map_err(|err| format!("Failed to create media root {}: {err}", dir.display()))?;
  Ok(dir.to_string_lossy().to_string())
}
```

Then add a wrapper and call it before `renderComicVideo()`.

- [ ] **Step 5: Run checks**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/lib.rs src/lib/comic/video/desktop-commands.ts src/components/comic/ComicModal.tsx
git commit -m "Wire comic video file writing"
```

---

### Task 10: Final Verification And Documentation

**Files:**
- Modify: `docs/CHANGELOG.md`
- Do not modify: `modules/10-multimedia.md` unless the user explicitly approves handling its existing dirty diff.

- [ ] **Step 1: Update changelog**

Add a top entry:

```md
## 2026-06-16 - Comic TTS video MVP

- Added panel-level narration/TTS metadata and video export status metadata.
- Updated storyboard generation so narration can cover the full chapter across ordered panels and `durationSec: 0` means TTS-measured timing.
- Added Edge-TTS/ffmpeg desktop command boundary, per-panel segment rendering, concat-list video export, and panel-owned media cleanup.
- Added ComicModal narration/video export controls with frontend visual QA.

**Verification**
- `vitest run` focused comic video/storyboard/storage tests passed.
- `tsc -b` passed.
- `cargo check --manifest-path src-tauri/Cargo.toml` passed.
- Browser visual QA checked ComicModal video controls for clipping/overflow.
```

- [ ] **Step 2: Run focused tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/video/timing.test.ts src/lib/comic/video/concat-list.test.ts src/lib/comic/video/panel-cleanup.test.ts src/lib/comic/video/video-renderer.test.ts src/lib/comic/storyboard.test.ts src/lib/comic/storyboard-generate.test.ts src/lib/comic/storage-types.test.ts src/lib/tauri-migrations.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run required project verification**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
```

Expected: PASS.

- [ ] **Step 4: Run Rust verification**

Run:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 5: Run frontend visual QA**

Use the `frontend-visual-qa` skill. If a dev server is not running:

```powershell
.\node_modules\.bin\vite.cmd --host 127.0.0.1
```

Use Browser plugin to open `http://127.0.0.1:5173`, open a book/chapter comic modal, and inspect the video export controls. Record:

- affected surface and parent layout;
- visual root cause addressed;
- structural layout fix;
- screenshot/browser observations;
- residual risk if Tauri-only video command cannot be manually executed in browser.

- [ ] **Step 6: Manual desktop smoke test**

In Tauri dev mode:

```powershell
npm run tauri dev
```

Prerequisites on PATH or configured fields:

```powershell
edge-tts --version
ffmpeg -version
ffprobe -version
```

Smoke path:

1. Open a chapter with 2-3 generated comic panels.
2. Ensure each panel has an image and narration.
3. Set one panel `durationSec = 0`.
4. Set one panel `durationSec` shorter than its narration audio.
5. Render video with `panelPauseMs = 400`.
6. Play output mp4 externally.
7. Confirm speech is not truncated and panel changes include padding.

- [ ] **Step 7: Check git status**

Run:

```powershell
git status --short
```

Expected: only intended files modified plus the pre-existing `modules/10-multimedia.md` dirty diff if still present.

- [ ] **Step 8: Commit final docs**

```powershell
git add docs/CHANGELOG.md
git commit -m "Document comic TTS video MVP"
```

---

## Self-Review Checklist

Spec coverage:

- Chapter-complete narration: Task 2 updates prompt/normalization tests.
- Edge-TTS single voice: Task 5 provider, Task 8 UI controls.
- `durationSec` rule: Task 1 timing helper, Task 6 renderer, Task 8 UI help text.
- Segment + concat list: Task 5 concat helper, Task 6 renderer, Task 4 Rust ffmpeg commands.
- No single filter graph / browser wasm MVP: file structure and tasks do not include them.
- Panel delete cleanup: Task 7.
- Tauri command boundary: Task 4 and Task 9.
- Storage metadata: Task 1 and Task 3.
- ComicModal UI and frontend visual QA: Task 8 and Task 10.
- Verification: Task 10.

Placeholder scan:

- No task uses `TBD`, `TODO`, "similar to", or unspecified edge handling.
- Each code-changing task names exact files and commands.

Type consistency:

- `ttsAssetId`, `ttsDurationMs`, `ttsProviderId`, `ttsVoice`, `ttsStatus`, and `videoStatus` names match across types, renderer, cleanup, and UI.
- `panelPauseMs` uses milliseconds everywhere.
- Rust command argument field names use camelCase in TypeScript and `#[serde(rename_all = "camelCase")]` in Rust.

Known execution risk:

- `edge-tts --text` may hit command-line length limits for unusually dense panel narration. If that happens during implementation, add a Rust command that writes narration to a temporary text file and calls Edge-TTS file input only after verifying the installed CLI supports it.
- Browser dev mode cannot fully validate Tauri commands. Use Tauri dev for the final manual smoke test.
