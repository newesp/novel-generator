use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::fs::File;
use std::io::{BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateTtsAudioArgs {
  edge_tts_bin: String,
  text: String,
  voice: String,
  output_path: String,
  subtitle_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerateTtsAudioResult {
  subtitle_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeAudioDurationArgs {
  ffprobe_bin: String,
  input_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeVideoDurationArgs {
  ffprobe_bin: String,
  input_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeVideoHasAudioArgs {
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
  motion_effect: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenderVideoClipSegmentArgs {
  ffmpeg_bin: String,
  video_clip_paths: Vec<String>,
  audio_path: String,
  output_path: String,
  duration_ms: u64,
  trailing_silence_ms: u64,
  visual_duration_ms: u64,
  preserve_clip_audio: bool,
  loop_video: bool,
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
#[serde(rename_all = "camelCase")]
struct DeleteMediaFileArgs {
  path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaFileExistsArgs {
  path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadMediaFileBytesArgs {
  path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenMediaFileArgs {
  path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RevealMediaFileArgs {
  path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteTextFileArgs {
  path: String,
  content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteBinaryFileArgs {
  path: String,
  bytes: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveMediaRootArgs {
  project_id: String,
  chapter_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportJsonFileArgs {
  filename: String,
  content: String,
  title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportProjectArchiveArgs {
  filename: String,
  snapshot_json: String,
  title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportProjectArchiveResult {
  path: String,
  media_file_count: usize,
  missing_files: Vec<ProjectArchiveMissingFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportProjectArchiveArgs {
  title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportProjectArchiveResult {
  snapshot_json: String,
  media_file_count: usize,
  missing_files: Vec<ProjectArchiveMissingFile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectArchiveManifest {
  app: String,
  kind: String,
  schema: u32,
  exported_at: u64,
  media_root_strategy: String,
  files: Vec<ProjectArchiveFile>,
  missing_files: Vec<ProjectArchiveMissingFile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectArchiveFile {
  asset_id: String,
  original_path: String,
  relative_path: String,
  archive_path: String,
  size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectArchiveMissingFile {
  asset_id: String,
  original_path: String,
  reason: String,
}

#[derive(Debug, Clone)]
struct ProjectArchiveMediaEntry {
  archive_path: String,
  source_path: PathBuf,
}

#[derive(Debug, Clone)]
struct ZipCentralEntry {
  name: String,
  crc32: u32,
  compressed_size: u32,
  uncompressed_size: u32,
  local_header_offset: u32,
}

#[derive(Debug)]
struct ReadProjectArchiveZip {
  manifest: ProjectArchiveManifest,
  backup_json: Vec<u8>,
  entries: Vec<ZipCentralEntry>,
}

fn project_output_root() -> Result<PathBuf, String> {
  let cwd = std::env::current_dir().map_err(|err| format!("Failed to resolve current dir: {err}"))?;
  if cwd.file_name().is_some_and(|name| name == "src-tauri") {
    return cwd
      .parent()
      .map(|parent| parent.to_path_buf())
      .ok_or_else(|| format!("Failed to resolve project dir from {}", cwd.display()));
  }
  Ok(cwd)
}

fn app_media_root_path() -> Result<PathBuf, String> {
  let root = project_output_root()?.join("output").join("media");
  fs::create_dir_all(&root)
    .map_err(|err| format!("Failed to create media root {}: {err}", root.display()))?;
  Ok(root)
}

fn app_media_root() -> Result<PathBuf, String> {
  let root = app_media_root_path()?;
  root
    .canonicalize()
    .map_err(|err| format!("Failed to canonicalize media root {}: {err}", root.display()))
}

fn path_has_parent_dir(path: &Path) -> bool {
  path.components().any(|component| matches!(component, Component::ParentDir))
}

fn safe_media_file_path(
  path: &str,
  create_parent: bool,
) -> Result<PathBuf, String> {
  let input = PathBuf::from(path);
  let root_path = app_media_root_path()?;
  let canonical_root = app_media_root()?;
  if !input.is_absolute() {
    return Err(format!("Path must be absolute: {path}"));
  }
  if path_has_parent_dir(&input) {
    return Err(format!("Path escapes media root: {path}"));
  }
  if !input.starts_with(&root_path) {
    return Err(format!("Path is outside media root: {path}"));
  }

  let parent = input
    .parent()
    .ok_or_else(|| format!("Path has no parent: {path}"))?;
  if create_parent {
    fs::create_dir_all(parent)
      .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
  }

  let canonical_parent = parent
    .canonicalize()
    .map_err(|err| format!("Failed to canonicalize {}: {err}", parent.display()))?;
  if !canonical_parent.starts_with(&canonical_root) {
    return Err(format!("Path is outside media root: {path}"));
  }

  let file_name = input
    .file_name()
    .ok_or_else(|| format!("Path has no file name: {path}"))?;
  Ok(parent.join(file_name))
}

fn safe_media_query_path(path: &str) -> Result<Option<PathBuf>, String> {
  let input = PathBuf::from(path);
  let root_path = app_media_root_path()?;
  let canonical_root = app_media_root()?;
  if !input.is_absolute() {
    return Err(format!("Path must be absolute: {path}"));
  }
  if path_has_parent_dir(&input) {
    return Err(format!("Path escapes media root: {path}"));
  }
  if !input.starts_with(&root_path) {
    return Err(format!("Path is outside media root: {path}"));
  }

  let parent = input
    .parent()
    .ok_or_else(|| format!("Path has no parent: {path}"))?;
  if !parent.exists() {
    return Ok(None);
  }

  let canonical_parent = parent
    .canonicalize()
    .map_err(|err| format!("Failed to canonicalize {}: {err}", parent.display()))?;
  if !canonical_parent.starts_with(&canonical_root) {
    return Err(format!("Path is outside media root: {path}"));
  }

  let file_name = input
    .file_name()
    .ok_or_else(|| format!("Path has no file name: {path}"))?;
  Ok(Some(parent.join(file_name)))
}

fn ensure_safe_media_component(value: &str, label: &str) -> Result<(), String> {
  if value.trim().is_empty()
    || value.contains('/')
    || value.contains('\\')
    || Path::new(value).is_absolute()
    || path_has_parent_dir(Path::new(value))
  {
    return Err(format!("Invalid {label}: {value}"));
  }
  Ok(())
}

fn run_command(mut command: Command, label: &str) -> Result<(), String> {
  let output = command
    .output()
    .map_err(|err| format!("Failed to start {label}: {err}"))?;

  if output.status.success() {
    return Ok(());
  }

  let stderr = String::from_utf8_lossy(&output.stderr);
  let stdout = String::from_utf8_lossy(&output.stdout);
  Err(format!("{label} failed: {stderr}{stdout}"))
}

fn windows_path_arg(path: &Path) -> String {
  path.to_string_lossy().replace('/', "\\")
}

fn build_windows_reveal_folder_arg(path: &Path) -> Option<String> {
  path.parent().map(windows_path_arg)
}

fn seconds_arg(ms: u64) -> String {
  format!("{:.3}", ms as f64 / 1000.0)
}

fn append_audio_filter(video_filter: String) -> String {
  format!("{video_filter};[1:a][2:a]concat=n=2:v=0:a=1[a]")
}

fn append_indexed_audio_filter(video_filter: String, audio_index: usize, silence_index: usize) -> String {
  format!("{video_filter};[{audio_index}:a][{silence_index}:a]concat=n=2:v=0:a=1[a]")
}

fn narration_audio_filter(audio_index: usize, silence_index: usize, output_label: &str) -> String {
  format!(
    "[{audio_index}:a][{silence_index}:a]concat=n=2:v=0:a=1,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[{output_label}]",
  )
}

fn static_video_filter(width: u32, height: u32) -> String {
  append_audio_filter(format!(
    "[0:v]scale=w={width}:h={height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v]",
  ))
}

fn fitted_panel_filter(width: u32, height: u32) -> String {
  format!(
    "[0:v]scale=w={width}:h={height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1[fit]",
  )
}

fn fade_duration_seconds(duration_ms: u64) -> f64 {
  let duration = duration_ms as f64 / 1000.0;
  duration.min(0.5).max(0.0)
}

fn zoompan_video_filter(
  width: u32,
  height: u32,
  fps: u32,
  duration_ms: u64,
  zoom_expr: &str,
  x_expr: &str,
  y_expr: &str,
  fade: Option<&str>,
) -> String {
  let effective_fps = fps.max(1);
  let total_frames = ((duration_ms as f64 / 1000.0) * effective_fps as f64).ceil().max(1.0) as u64;
  let mut video = format!(
    "{};[fit]zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}':d={total_frames}:s={width}x{height}:fps={effective_fps}",
    fitted_panel_filter(width, height),
  );
  if let Some(fade_filter) = fade {
    video.push(',');
    video.push_str(fade_filter);
  }
  video.push_str(",setsar=1,format=yuv420p[v]");
  append_audio_filter(video)
}

fn build_video_filter(motion_effect: &str, width: u32, height: u32, fps: u32, duration_ms: u64) -> String {
  let duration_seconds = duration_ms as f64 / 1000.0;
  let total_frames = (duration_seconds * fps.max(1) as f64).ceil().max(1.0) as u64;
  let denominator = total_frames.saturating_sub(1).max(1);
  let center_x = "iw/2-(iw/zoom/2)";
  let center_y = "ih/2-(ih/zoom/2)";
  let progress = format!("on/{denominator}");
  let reverse_progress = format!("1-on/{denominator}");

  match motion_effect {
    "slow_zoom_in" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      "min(zoom+0.0015,1.08)",
      center_x,
      center_y,
      None,
    ),
    "slow_zoom_out" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      &format!("max(1.0,1.08-0.08*{progress})"),
      center_x,
      center_y,
      None,
    ),
    "pan_left" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      "1.10",
      &format!("(iw-iw/zoom)*({reverse_progress})"),
      center_y,
      None,
    ),
    "pan_right" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      "1.10",
      &format!("(iw-iw/zoom)*({progress})"),
      center_y,
      None,
    ),
    "pan_up" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      "1.10",
      center_x,
      &format!("(ih-ih/zoom)*({reverse_progress})"),
      None,
    ),
    "pan_down" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      "1.10",
      center_x,
      &format!("(ih-ih/zoom)*({progress})"),
      None,
    ),
    "ken_burns_in_left" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      &format!("1.0+0.08*{progress}"),
      "0",
      center_y,
      None,
    ),
    "ken_burns_in_right" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      &format!("1.0+0.08*{progress}"),
      "iw-iw/zoom",
      center_y,
      None,
    ),
    "ken_burns_in_top" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      &format!("1.0+0.08*{progress}"),
      center_x,
      "0",
      None,
    ),
    "ken_burns_in_bottom" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      &format!("1.0+0.08*{progress}"),
      center_x,
      "ih-ih/zoom",
      None,
    ),
    "pulse_zoom" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      &format!("1.03+0.025*sin(2*PI*{progress})"),
      center_x,
      center_y,
      None,
    ),
    "crash_zoom_in" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      &format!("min(1.14,1.0+0.14*on/{})", ((denominator as f64) * 0.2).ceil().max(1.0) as u64),
      center_x,
      center_y,
      None,
    ),
    "subtle_shake" => zoompan_video_filter(
      width,
      height,
      fps,
      duration_ms,
      "1.08",
      "iw/2-(iw/zoom/2)+8*sin(on*0.9)",
      "ih/2-(ih/zoom/2)+5*cos(on*1.1)",
      None,
    ),
    "fade_in" => {
      let fade_duration = fade_duration_seconds(duration_ms);
      zoompan_video_filter(
        width,
        height,
        fps,
        duration_ms,
        "1.0",
        center_x,
        center_y,
        Some(&format!("fade=t=in:st=0.000:d={fade_duration:.3}")),
      )
    }
    "fade_out" => {
      let fade_duration = fade_duration_seconds(duration_ms);
      let start = (duration_seconds - fade_duration).max(0.0);
      zoompan_video_filter(
        width,
        height,
        fps,
        duration_ms,
        "1.0",
        center_x,
        center_y,
        Some(&format!("fade=t=out:st={start:.3}:d={fade_duration:.3}")),
      )
    }
    _ => static_video_filter(width, height),
  }
}

fn build_video_clip_filter(
  clip_count: usize,
  width: u32,
  height: u32,
  fps: u32,
  duration_ms: u64,
  visual_duration_ms: u64,
  preserve_clip_audio: bool,
  loop_video: bool,
) -> String {
  let effective_fps = fps.max(1);
  let target_duration = duration_ms as f64 / 1000.0;
  let pad_duration = duration_ms.saturating_sub(visual_duration_ms) as f64 / 1000.0;
  let loop_size_frames = (((visual_duration_ms as f64 / 1000.0) * effective_fps as f64).ceil().max(1.0)) as u64;
  let loop_size_samples = (((visual_duration_ms as f64 / 1000.0) * 44100.0).ceil().max(1.0)) as u64;
  let mut parts: Vec<String> = Vec::new();

  for index in 0..clip_count {
    parts.push(format!(
      "[{index}:v]scale=w={width}:h={height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,fps={effective_fps},setsar=1,settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[v{index}]",
    ));
  }

  let base_label = if clip_count == 1 {
    "v0".to_string()
  } else {
    let inputs = (0..clip_count)
      .map(|index| format!("[v{index}]"))
      .collect::<Vec<_>>()
      .join("");
    parts.push(format!("{inputs}concat=n={clip_count}:v=1:a=0[vcat]"));
    "vcat".to_string()
  };

  let video_output = if pad_duration > 0.0 && loop_video {
    format!(
      "[{base_label}]loop=loop=-1:size={loop_size_frames}:start=0,trim=duration={target_duration:.3},setpts=N/({effective_fps}*TB)[v]",
    )
  } else if pad_duration > 0.0 {
    format!(
      "[{base_label}]tpad=stop_mode=clone:stop_duration={pad_duration:.3},trim=duration={target_duration:.3},setpts=PTS-STARTPTS[v]",
    )
  } else {
    format!("[{base_label}]trim=duration={target_duration:.3},setpts=PTS-STARTPTS[v]")
  };
  parts.push(video_output);

  if !preserve_clip_audio {
    return append_indexed_audio_filter(parts.join(";"), clip_count, clip_count + 1);
  }

  for index in 0..clip_count {
    parts.push(format!(
      "[{index}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a{index}]",
    ));
  }
  let clip_audio_label = if clip_count == 1 {
    "a0".to_string()
  } else {
    let inputs = (0..clip_count)
      .map(|index| format!("[a{index}]"))
      .collect::<Vec<_>>()
      .join("");
    parts.push(format!("{inputs}concat=n={clip_count}:v=0:a=1[clipa]"));
    "clipa".to_string()
  };
  let clip_audio_output = if pad_duration > 0.0 && loop_video {
    format!(
      "[{clip_audio_label}]aloop=loop=-1:size={loop_size_samples}:start=0,atrim=duration={target_duration:.3},asetpts=PTS-STARTPTS[clipaudio]",
    )
  } else {
    format!(
      "[{clip_audio_label}]apad=pad_dur={pad_duration:.3},atrim=duration={target_duration:.3},asetpts=PTS-STARTPTS[clipaudio]",
    )
  };
  parts.push(clip_audio_output);
  parts.push(narration_audio_filter(clip_count, clip_count + 1, "narration"));
  parts.push("[clipaudio][narration]amix=inputs=2:duration=longest:dropout_transition=0[a]".to_string());
  parts.join(";")
}

#[tauri::command]
fn generate_tts_audio(args: GenerateTtsAudioArgs) -> Result<GenerateTtsAudioResult, String> {
  let output_path = safe_media_file_path(&args.output_path, true)?;
  let subtitle_path = args
    .subtitle_path
    .as_deref()
    .map(|path| safe_media_file_path(path, true))
    .transpose()?;

  let mut command = Command::new(args.edge_tts_bin);
  command
    .arg("--voice")
    .arg(&args.voice)
    .arg("--text")
    .arg(args.text)
    .arg("--write-media")
    .arg(output_path);
  if let Some(path) = &subtitle_path {
    command.arg("--write-subtitles").arg(path);
  }

  if let Err(err) = run_command(command, "edge-tts") {
    if err.contains("NoAudioReceived") {
      return Err(format!(
        "Edge-TTS 沒有回傳音訊：音色「{}」可能已不可用或暫時無法服務，請改選其他旁白音色。",
        args.voice,
      ));
    }
    return Err(err);
  }
  let subtitle_text = subtitle_path
    .map(|path| fs::read_to_string(&path)
      .map_err(|err| format!("Failed to read subtitle file {}: {err}", path.display())))
    .transpose()?;
  Ok(GenerateTtsAudioResult { subtitle_text })
}

fn probe_media_duration_ms(ffprobe_bin: String, input_path: String) -> Result<u64, String> {
  let input_path = safe_media_file_path(&input_path, false)?;
  let output = Command::new(ffprobe_bin)
    .arg("-v")
    .arg("error")
    .arg("-show_entries")
    .arg("format=duration")
    .arg("-of")
    .arg("default=noprint_wrappers=1:nokey=1")
    .arg(input_path)
    .output()
    .map_err(|err| format!("Failed to start ffprobe: {err}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    return Err(format!("ffprobe failed: {stderr}{stdout}"));
  }

  let duration_seconds = String::from_utf8_lossy(&output.stdout)
    .trim()
    .parse::<f64>()
    .map_err(|err| format!("Failed to parse ffprobe duration: {err}"))?;

  if !duration_seconds.is_finite() || duration_seconds < 0.0 {
    return Err(format!("Invalid ffprobe duration: {duration_seconds}"));
  }

  Ok((duration_seconds * 1000.0).round() as u64)
}

#[tauri::command]
fn probe_audio_duration(args: ProbeAudioDurationArgs) -> Result<u64, String> {
  probe_media_duration_ms(args.ffprobe_bin, args.input_path)
}

#[tauri::command]
fn probe_video_duration(args: ProbeVideoDurationArgs) -> Result<u64, String> {
  probe_media_duration_ms(args.ffprobe_bin, args.input_path)
}

#[tauri::command]
fn probe_video_has_audio(args: ProbeVideoHasAudioArgs) -> Result<bool, String> {
  let input_path = safe_media_file_path(&args.input_path, false)?;
  let output = Command::new(args.ffprobe_bin)
    .arg("-v")
    .arg("error")
    .arg("-select_streams")
    .arg("a")
    .arg("-show_entries")
    .arg("stream=index")
    .arg("-of")
    .arg("csv=p=0")
    .arg(input_path)
    .output()
    .map_err(|err| format!("Failed to start ffprobe: {err}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    return Err(format!("ffprobe audio stream probe failed: {stderr}{stdout}"));
  }

  Ok(!String::from_utf8_lossy(&output.stdout).trim().is_empty())
}

#[tauri::command]
fn render_comic_video_segment(args: RenderSegmentArgs) -> Result<(), String> {
  let image_path = safe_media_file_path(&args.image_path, false)?;
  let audio_path = safe_media_file_path(&args.audio_path, false)?;
  let output_path = safe_media_file_path(&args.output_path, true)?;

  let duration = seconds_arg(args.duration_ms);
  let trailing_silence = seconds_arg(args.trailing_silence_ms.max(1));
  let filter = build_video_filter(&args.motion_effect, args.width, args.height, args.fps, args.duration_ms);

  let mut command = Command::new(args.ffmpeg_bin);
  command
    .arg("-y")
    .arg("-loop")
    .arg("1")
    .arg("-t")
    .arg(duration)
    .arg("-i")
    .arg(image_path)
    .arg("-i")
    .arg(audio_path)
    .arg("-f")
    .arg("lavfi")
    .arg("-t")
    .arg(trailing_silence)
    .arg("-i")
    .arg("anullsrc=channel_layout=stereo:sample_rate=44100")
    .arg("-filter_complex")
    .arg(filter)
    .arg("-map")
    .arg("[v]")
    .arg("-map")
    .arg("[a]")
    .arg("-r")
    .arg(args.fps.to_string())
    .arg("-c:v")
    .arg("libx264")
    .arg("-preset")
    .arg("veryfast")
    .arg("-pix_fmt")
    .arg("yuv420p")
    .arg("-c:a")
    .arg("aac")
    .arg("-shortest")
    .arg(output_path);

  run_command(command, "ffmpeg render segment")
}

#[tauri::command]
fn render_comic_video_clip_segment(args: RenderVideoClipSegmentArgs) -> Result<(), String> {
  if args.video_clip_paths.is_empty() {
    return Err("At least one video clip is required.".to_string());
  }
  let video_clip_paths = args
    .video_clip_paths
    .iter()
    .map(|path| safe_media_file_path(path, false))
    .collect::<Result<Vec<_>, _>>()?;
  let audio_path = safe_media_file_path(&args.audio_path, false)?;
  let output_path = safe_media_file_path(&args.output_path, true)?;

  let trailing_silence = seconds_arg(args.trailing_silence_ms.max(1));
  let filter = build_video_clip_filter(
    video_clip_paths.len(),
    args.width,
    args.height,
    args.fps,
    args.duration_ms,
    args.visual_duration_ms,
    args.preserve_clip_audio,
    args.loop_video,
  );

  let mut command = Command::new(args.ffmpeg_bin);
  command.arg("-y");
  for path in video_clip_paths {
    command.arg("-i").arg(path);
  }
  command
    .arg("-i")
    .arg(audio_path)
    .arg("-f")
    .arg("lavfi")
    .arg("-t")
    .arg(trailing_silence)
    .arg("-i")
    .arg("anullsrc=channel_layout=stereo:sample_rate=44100")
    .arg("-filter_complex")
    .arg(filter)
    .arg("-map")
    .arg("[v]")
    .arg("-map")
    .arg("[a]")
    .arg("-r")
    .arg(args.fps.to_string())
    .arg("-c:v")
    .arg("libx264")
    .arg("-preset")
    .arg("veryfast")
    .arg("-pix_fmt")
    .arg("yuv420p")
    .arg("-c:a")
    .arg("aac")
    .arg("-shortest")
    .arg(output_path);

  run_command(command, "ffmpeg render video clip segment")
}

#[tauri::command]
fn concat_comic_video(args: ConcatVideoArgs) -> Result<(), String> {
  let concat_list_path = safe_media_file_path(&args.concat_list_path, false)?;
  let output_path = safe_media_file_path(&args.output_path, true)?;

  let mut command = Command::new(args.ffmpeg_bin);
  command
    .arg("-y")
    .arg("-f")
    .arg("concat")
    .arg("-safe")
    .arg("0")
    .arg("-i")
    .arg(concat_list_path)
    .arg("-c")
    .arg("copy")
    .arg(output_path);

  run_command(command, "ffmpeg concat")
}

#[tauri::command]
fn delete_media_file(args: DeleteMediaFileArgs) -> Result<(), String> {
  let raw_path = Path::new(&args.path);
  if !raw_path.exists() {
    return Ok(());
  }
  let path = safe_media_file_path(&args.path, false)?;

  fs::remove_file(&path).map_err(|err| format!("Failed to delete {}: {err}", path.display()))
}

#[tauri::command]
fn media_file_exists(args: MediaFileExistsArgs) -> Result<bool, String> {
  let Some(path) = safe_media_query_path(&args.path)? else {
    return Ok(false);
  };
  Ok(path.is_file())
}

#[tauri::command]
fn read_media_file_bytes(args: ReadMediaFileBytesArgs) -> Result<Vec<u8>, String> {
  let path = safe_media_file_path(&args.path, false)?;
  fs::read(&path).map_err(|err| format!("Failed to read {}: {err}", path.display()))
}

#[tauri::command]
fn open_media_file(args: OpenMediaFileArgs) -> Result<(), String> {
  let path = safe_media_file_path(&args.path, false)?;
  if !path.exists() {
    return Err(format!("Media file does not exist: {}", path.display()));
  }

  #[cfg(target_os = "windows")]
  {
    let mut command = Command::new("cmd");
    command.arg("/C").arg("start").arg("").arg(path);
    run_command(command, "open media file")
  }

  #[cfg(target_os = "macos")]
  {
    let mut command = Command::new("open");
    command.arg(path);
    run_command(command, "open media file")
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    let mut command = Command::new("xdg-open");
    command.arg(path);
    run_command(command, "open media file")
  }
}

#[tauri::command]
fn reveal_media_file(args: RevealMediaFileArgs) -> Result<(), String> {
  let path = safe_media_file_path(&args.path, false)?;
  if !path.exists() {
    return Err(format!("Media file does not exist: {}", path.display()));
  }

  #[cfg(target_os = "windows")]
  {
    let parent = build_windows_reveal_folder_arg(&path)
      .ok_or_else(|| format!("Media file has no parent: {}", path.display()))?;
    let mut command = Command::new("explorer");
    command.arg(parent);
    run_command(command, "reveal media file")
  }

  #[cfg(target_os = "macos")]
  {
    let mut command = Command::new("open");
    command.arg("-R").arg(path);
    run_command(command, "reveal media file")
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    let parent = path
      .parent()
      .ok_or_else(|| format!("Media file has no parent: {}", path.display()))?;
    let mut command = Command::new("xdg-open");
    command.arg(parent);
    run_command(command, "reveal media file")
  }
}

#[tauri::command]
fn write_text_file(args: WriteTextFileArgs) -> Result<(), String> {
  let path = safe_media_file_path(&args.path, true)?;
  fs::write(&path, args.content).map_err(|err| format!("Failed to write {}: {err}", path.display()))
}

#[tauri::command]
fn write_binary_file(args: WriteBinaryFileArgs) -> Result<(), String> {
  let path = safe_media_file_path(&args.path, true)?;
  fs::write(&path, args.bytes).map_err(|err| format!("Failed to write {}: {err}", path.display()))
}

#[tauri::command]
fn resolve_media_root(
  args: ResolveMediaRootArgs,
) -> Result<String, String> {
  ensure_safe_media_component(&args.project_id, "projectId")?;
  ensure_safe_media_component(&args.chapter_id, "chapterId")?;

  let dir = app_media_root_path()?
    .join(args.project_id)
    .join("chapters")
    .join(args.chapter_id)
    .join("comic-video");

  fs::create_dir_all(&dir)
    .map_err(|err| format!("Failed to create media root {}: {err}", dir.display()))?;

  Ok(dir.to_string_lossy().to_string())
}

fn safe_export_filename_with_extension<'a>(filename: &'a str, extension: &str) -> Result<&'a str, String> {
  if filename.trim().is_empty() || filename != filename.trim() {
    return Err("Export filename must be non-empty and must not have surrounding whitespace".to_string());
  }
  if filename
    .chars()
    .any(|ch| ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'))
  {
    return Err(format!("Invalid export filename: {filename}"));
  }

  let path = Path::new(filename);
  let mut components = path.components();
  if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
    return Err(format!("Invalid export filename: {filename}"));
  }
  if path
    .extension()
    .and_then(|ext| ext.to_str())
    .map_or(true, |ext| !ext.eq_ignore_ascii_case(extension))
  {
    return Err(format!("Export filename must end with .{extension}"));
  }

  Ok(filename)
}

fn safe_export_filename(filename: &str) -> Result<&str, String> {
  safe_export_filename_with_extension(filename, "json")
}

fn safe_archive_filename(filename: &str) -> Result<&str, String> {
  safe_export_filename_with_extension(filename, "zip")
}

fn write_u16<W: Write>(writer: &mut W, value: u16) -> Result<(), String> {
  writer
    .write_all(&value.to_le_bytes())
    .map_err(|err| format!("Failed to write ZIP: {err}"))
}

fn write_u32<W: Write>(writer: &mut W, value: u32) -> Result<(), String> {
  writer
    .write_all(&value.to_le_bytes())
    .map_err(|err| format!("Failed to write ZIP: {err}"))
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, String> {
  let slice = bytes
    .get(offset..offset + 2)
    .ok_or_else(|| "Invalid ZIP: truncated u16".to_string())?;
  Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, String> {
  let slice = bytes
    .get(offset..offset + 4)
    .ok_or_else(|| "Invalid ZIP: truncated u32".to_string())?;
  Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn crc32_update(mut crc: u32, bytes: &[u8]) -> u32 {
  for byte in bytes {
    crc ^= u32::from(*byte);
    for _ in 0..8 {
      let mask = 0u32.wrapping_sub(crc & 1);
      crc = (crc >> 1) ^ (0xedb8_8320 & mask);
    }
  }
  crc
}

fn crc32_bytes(bytes: &[u8]) -> u32 {
  !crc32_update(!0, bytes)
}

fn validate_archive_path(path: &str) -> Result<(), String> {
  if path.is_empty()
    || path.starts_with('/')
    || path.contains('\\')
    || path.contains(':')
    || path.split('/').any(|part| part.is_empty() || part == "." || part == "..")
  {
    return Err(format!("Invalid archive path: {path}"));
  }
  Ok(())
}

fn media_relative_path(path: &Path, canonical_root: &Path) -> Result<String, String> {
  let canonical_path = path
    .canonicalize()
    .map_err(|err| format!("Failed to canonicalize media file {}: {err}", path.display()))?;
  if !canonical_path.starts_with(canonical_root) {
    return Err(format!("Media file is outside media root: {}", path.display()));
  }
  let relative = canonical_path
    .strip_prefix(canonical_root)
    .map_err(|err| format!("Failed to resolve relative media path {}: {err}", path.display()))?;

  let mut parts = Vec::new();
  for component in relative.components() {
    match component {
      Component::Normal(value) => {
        let part = value
          .to_str()
          .ok_or_else(|| format!("Media path is not valid UTF-8: {}", path.display()))?;
        if part.contains('/') || part.contains('\\') || part.contains(':') {
          return Err(format!("Invalid media path component: {part}"));
        }
        parts.push(part.to_string());
      }
      _ => return Err(format!("Invalid media relative path: {}", relative.display())),
    }
  }

  let relative_path = parts.join("/");
  validate_archive_path(&relative_path)?;
  Ok(relative_path)
}

fn path_from_archive_relative(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
  validate_archive_path(relative_path)?;
  if relative_path.starts_with("media/") || relative_path == "media" {
    return Err(format!("Expected media-relative path, got archive path: {relative_path}"));
  }
  let mut path = root.to_path_buf();
  for part in relative_path.split('/') {
    path.push(part);
  }
  Ok(path)
}

fn collect_archive_media(
  snapshot: &Value,
) -> Result<(Vec<ProjectArchiveFile>, Vec<ProjectArchiveMissingFile>, Vec<ProjectArchiveMediaEntry>), String> {
  let canonical_root = app_media_root()?;
  let media_assets = snapshot
    .get("mediaAssets")
    .and_then(Value::as_array)
    .ok_or_else(|| "Backup snapshot must include a mediaAssets array".to_string())?;
  let mut files = Vec::new();
  let mut missing_files = Vec::new();
  let mut entries = Vec::new();
  let mut seen_archive_paths = HashSet::new();

  for asset in media_assets {
    let asset_id = asset
      .get("id")
      .and_then(Value::as_str)
      .unwrap_or("")
      .to_string();
    let original_path = asset
      .get("path")
      .and_then(Value::as_str)
      .unwrap_or("")
      .to_string();

    if asset_id.is_empty() || original_path.is_empty() {
      continue;
    }

    let source_path = PathBuf::from(&original_path);
    if !source_path.exists() {
      missing_files.push(ProjectArchiveMissingFile {
        asset_id,
        original_path,
        reason: "file not found".to_string(),
      });
      continue;
    }
    if !source_path.is_file() {
      missing_files.push(ProjectArchiveMissingFile {
        asset_id,
        original_path,
        reason: "not a file".to_string(),
      });
      continue;
    }

    let relative_path = match media_relative_path(&source_path, &canonical_root) {
      Ok(value) => value,
      Err(err) => {
        missing_files.push(ProjectArchiveMissingFile {
          asset_id,
          original_path,
          reason: err,
        });
        continue;
      }
    };
    let archive_path = format!("media/{relative_path}");
    validate_archive_path(&archive_path)?;
    let size_bytes = source_path
      .metadata()
      .map_err(|err| format!("Failed to read metadata for {}: {err}", source_path.display()))?
      .len();
    files.push(ProjectArchiveFile {
      asset_id,
      original_path,
      relative_path,
      archive_path: archive_path.clone(),
      size_bytes,
    });
    if seen_archive_paths.insert(archive_path.clone()) {
      entries.push(ProjectArchiveMediaEntry {
        archive_path,
        source_path,
      });
    }
  }

  Ok((files, missing_files, entries))
}

fn write_zip_entry_header<W: Write>(
  writer: &mut W,
  name: &str,
  crc32: u32,
  size: u32,
) -> Result<(), String> {
  let name_bytes = name.as_bytes();
  write_u32(writer, 0x0403_4b50)?;
  write_u16(writer, 20)?;
  write_u16(writer, 0x0800)?;
  write_u16(writer, 0)?;
  write_u16(writer, 0)?;
  write_u16(writer, 0)?;
  write_u32(writer, crc32)?;
  write_u32(writer, size)?;
  write_u32(writer, size)?;
  write_u16(writer, name_bytes.len().try_into().map_err(|_| format!("ZIP path is too long: {name}"))?)?;
  write_u16(writer, 0)?;
  writer
    .write_all(name_bytes)
    .map_err(|err| format!("Failed to write ZIP entry {name}: {err}"))
}

fn write_zip_central_entry<W: Write>(
  writer: &mut W,
  entry: &ZipCentralEntry,
) -> Result<(), String> {
  let name_bytes = entry.name.as_bytes();
  write_u32(writer, 0x0201_4b50)?;
  write_u16(writer, 20)?;
  write_u16(writer, 20)?;
  write_u16(writer, 0x0800)?;
  write_u16(writer, 0)?;
  write_u16(writer, 0)?;
  write_u16(writer, 0)?;
  write_u32(writer, entry.crc32)?;
  write_u32(writer, entry.compressed_size)?;
  write_u32(writer, entry.uncompressed_size)?;
  write_u16(writer, name_bytes.len().try_into().map_err(|_| format!("ZIP path is too long: {}", entry.name))?)?;
  write_u16(writer, 0)?;
  write_u16(writer, 0)?;
  write_u16(writer, 0)?;
  write_u16(writer, 0)?;
  write_u32(writer, 0)?;
  write_u32(writer, entry.local_header_offset)?;
  writer
    .write_all(name_bytes)
    .map_err(|err| format!("Failed to write ZIP central directory: {err}"))
}

fn write_zip_bytes_entry<W: Write + Seek>(
  writer: &mut W,
  name: &str,
  bytes: &[u8],
  central_entries: &mut Vec<ZipCentralEntry>,
) -> Result<(), String> {
  validate_archive_path(name)?;
  let size: u32 = bytes
    .len()
    .try_into()
    .map_err(|_| format!("ZIP entry exceeds 4GB limit: {name}"))?;
  let crc32 = crc32_bytes(bytes);
  let offset: u32 = writer
    .stream_position()
    .map_err(|err| format!("Failed to read ZIP position: {err}"))?
    .try_into()
    .map_err(|_| "ZIP exceeds 4GB limit".to_string())?;
  write_zip_entry_header(writer, name, crc32, size)?;
  writer
    .write_all(bytes)
    .map_err(|err| format!("Failed to write ZIP entry {name}: {err}"))?;
  central_entries.push(ZipCentralEntry {
    name: name.to_string(),
    crc32,
    compressed_size: size,
    uncompressed_size: size,
    local_header_offset: offset,
  });
  Ok(())
}

fn write_zip_file_entry<W: Write + Seek>(
  writer: &mut W,
  entry: &ProjectArchiveMediaEntry,
  central_entries: &mut Vec<ZipCentralEntry>,
) -> Result<(), String> {
  validate_archive_path(&entry.archive_path)?;
  let mut source = File::open(&entry.source_path)
    .map_err(|err| format!("Failed to open {}: {err}", entry.source_path.display()))?;
  let size = source
    .metadata()
    .map_err(|err| format!("Failed to read metadata for {}: {err}", entry.source_path.display()))?
    .len();
  let size_u32: u32 = size
    .try_into()
    .map_err(|_| format!("ZIP entry exceeds 4GB limit: {}", entry.archive_path))?;
  let mut crc = !0u32;
  let mut buffer = [0u8; 64 * 1024];
  loop {
    let read = source
      .read(&mut buffer)
      .map_err(|err| format!("Failed to read {}: {err}", entry.source_path.display()))?;
    if read == 0 {
      break;
    }
    crc = crc32_update(crc, &buffer[..read]);
  }
  let crc32 = !crc;
  source
    .seek(SeekFrom::Start(0))
    .map_err(|err| format!("Failed to rewind {}: {err}", entry.source_path.display()))?;

  let offset: u32 = writer
    .stream_position()
    .map_err(|err| format!("Failed to read ZIP position: {err}"))?
    .try_into()
    .map_err(|_| "ZIP exceeds 4GB limit".to_string())?;
  write_zip_entry_header(writer, &entry.archive_path, crc32, size_u32)?;
  std::io::copy(&mut source, writer)
    .map_err(|err| format!("Failed to write ZIP entry {}: {err}", entry.archive_path))?;
  central_entries.push(ZipCentralEntry {
    name: entry.archive_path.clone(),
    crc32,
    compressed_size: size_u32,
    uncompressed_size: size_u32,
    local_header_offset: offset,
  });
  Ok(())
}

fn write_project_archive_zip(
  path: &Path,
  manifest: &ProjectArchiveManifest,
  backup_json: &[u8],
  media_entries: &[ProjectArchiveMediaEntry],
) -> Result<(), String> {
  let file = File::create(path)
    .map_err(|err| format!("Failed to create archive {}: {err}", path.display()))?;
  let mut writer = BufWriter::new(file);
  let mut central_entries = Vec::new();
  let manifest_json = serde_json::to_vec_pretty(manifest)
    .map_err(|err| format!("Failed to encode archive manifest: {err}"))?;

  write_zip_bytes_entry(&mut writer, "manifest.json", &manifest_json, &mut central_entries)?;
  write_zip_bytes_entry(&mut writer, "backup.json", backup_json, &mut central_entries)?;
  for media_entry in media_entries {
    write_zip_file_entry(&mut writer, media_entry, &mut central_entries)?;
  }

  let central_offset: u32 = writer
    .stream_position()
    .map_err(|err| format!("Failed to read ZIP position: {err}"))?
    .try_into()
    .map_err(|_| "ZIP exceeds 4GB limit".to_string())?;
  for central_entry in &central_entries {
    write_zip_central_entry(&mut writer, central_entry)?;
  }
  let central_end: u32 = writer
    .stream_position()
    .map_err(|err| format!("Failed to read ZIP position: {err}"))?
    .try_into()
    .map_err(|_| "ZIP exceeds 4GB limit".to_string())?;
  let central_size = central_end
    .checked_sub(central_offset)
    .ok_or_else(|| "Invalid ZIP central directory size".to_string())?;
  let entry_count: u16 = central_entries
    .len()
    .try_into()
    .map_err(|_| "ZIP has too many entries".to_string())?;

  write_u32(&mut writer, 0x0605_4b50)?;
  write_u16(&mut writer, 0)?;
  write_u16(&mut writer, 0)?;
  write_u16(&mut writer, entry_count)?;
  write_u16(&mut writer, entry_count)?;
  write_u32(&mut writer, central_size)?;
  write_u32(&mut writer, central_offset)?;
  write_u16(&mut writer, 0)?;
  writer
    .flush()
    .map_err(|err| format!("Failed to flush archive {}: {err}", path.display()))
}

fn find_eocd(bytes: &[u8]) -> Result<usize, String> {
  if bytes.len() < 22 {
    return Err("Invalid ZIP: missing end of central directory".to_string());
  }
  let start = bytes.len().saturating_sub(65_557);
  for index in (start..=bytes.len() - 4).rev() {
    if bytes[index..index + 4] == [0x50, 0x4b, 0x05, 0x06] {
      return Ok(index);
    }
  }
  Err("Invalid ZIP: missing end of central directory".to_string())
}

fn parse_zip_central_entries(path: &Path) -> Result<Vec<ZipCentralEntry>, String> {
  let mut file = File::open(path).map_err(|err| format!("Failed to open {}: {err}", path.display()))?;
  let file_len = file
    .metadata()
    .map_err(|err| format!("Failed to read metadata for {}: {err}", path.display()))?
    .len();
  let tail_len = file_len.min(65_557) as usize;
  file
    .seek(SeekFrom::End(-(tail_len as i64)))
    .map_err(|err| format!("Failed to seek {}: {err}", path.display()))?;
  let mut tail = vec![0u8; tail_len];
  file
    .read_exact(&mut tail)
    .map_err(|err| format!("Failed to read {}: {err}", path.display()))?;
  let eocd_offset = find_eocd(&tail)?;
  let comment_len = read_u16(&tail, eocd_offset + 20)? as usize;
  if eocd_offset + 22 + comment_len != tail.len() {
    return Err("Invalid ZIP: trailing bytes after end of central directory".to_string());
  }
  let disk_number = read_u16(&tail, eocd_offset + 4)?;
  let central_disk = read_u16(&tail, eocd_offset + 6)?;
  if disk_number != 0 || central_disk != 0 {
    return Err("ZIP multi-disk archives are not supported".to_string());
  }
  let entry_count = read_u16(&tail, eocd_offset + 10)? as usize;
  let central_size = read_u32(&tail, eocd_offset + 12)? as u64;
  let central_offset = read_u32(&tail, eocd_offset + 16)? as u64;
  if central_offset + central_size > file_len {
    return Err("Invalid ZIP: central directory is outside file".to_string());
  }

  file
    .seek(SeekFrom::Start(central_offset))
    .map_err(|err| format!("Failed to seek central directory: {err}"))?;
  let mut central = vec![0u8; central_size as usize];
  file
    .read_exact(&mut central)
    .map_err(|err| format!("Failed to read central directory: {err}"))?;

  let mut entries = Vec::new();
  let mut offset = 0usize;
  for _ in 0..entry_count {
    if read_u32(&central, offset)? != 0x0201_4b50 {
      return Err("Invalid ZIP: malformed central directory".to_string());
    }
    let flags = read_u16(&central, offset + 8)?;
    let compression_method = read_u16(&central, offset + 10)?;
    if flags & 0x0008 != 0 {
      return Err("ZIP data descriptors are not supported".to_string());
    }
    if compression_method != 0 {
      return Err("Only stored ZIP entries are supported".to_string());
    }
    let crc32 = read_u32(&central, offset + 16)?;
    let compressed_size = read_u32(&central, offset + 20)?;
    let uncompressed_size = read_u32(&central, offset + 24)?;
    let name_len = read_u16(&central, offset + 28)? as usize;
    let extra_len = read_u16(&central, offset + 30)? as usize;
    let comment_len = read_u16(&central, offset + 32)? as usize;
    let local_header_offset = read_u32(&central, offset + 42)?;
    let name_start = offset + 46;
    let name_end = name_start + name_len;
    let name_bytes = central
      .get(name_start..name_end)
      .ok_or_else(|| "Invalid ZIP: truncated entry name".to_string())?;
    let name = std::str::from_utf8(name_bytes)
      .map_err(|err| format!("Invalid ZIP entry name encoding: {err}"))?
      .to_string();
    validate_archive_path(&name)?;
    entries.push(ZipCentralEntry {
      name,
      crc32,
      compressed_size,
      uncompressed_size,
      local_header_offset,
    });
    offset = name_end + extra_len + comment_len;
  }
  if offset != central.len() {
    return Err("Invalid ZIP: central directory has unexpected trailing bytes".to_string());
  }
  Ok(entries)
}

fn zip_entry_data_offset(file: &mut File, entry: &ZipCentralEntry) -> Result<u64, String> {
  file
    .seek(SeekFrom::Start(u64::from(entry.local_header_offset)))
    .map_err(|err| format!("Failed to seek ZIP local header: {err}"))?;
  let mut header = [0u8; 30];
  file
    .read_exact(&mut header)
    .map_err(|err| format!("Failed to read ZIP local header: {err}"))?;
  if read_u32(&header, 0)? != 0x0403_4b50 {
    return Err("Invalid ZIP: malformed local header".to_string());
  }
  if read_u16(&header, 8)? != 0 {
    return Err("Only stored ZIP entries are supported".to_string());
  }
  let name_len = u64::from(read_u16(&header, 26)?);
  let extra_len = u64::from(read_u16(&header, 28)?);
  Ok(u64::from(entry.local_header_offset) + 30 + name_len + extra_len)
}

fn read_zip_entry_bytes(path: &Path, entry: &ZipCentralEntry) -> Result<Vec<u8>, String> {
  if entry.compressed_size != entry.uncompressed_size {
    return Err("Only stored ZIP entries are supported".to_string());
  }
  let mut file = File::open(path).map_err(|err| format!("Failed to open {}: {err}", path.display()))?;
  let data_offset = zip_entry_data_offset(&mut file, entry)?;
  file
    .seek(SeekFrom::Start(data_offset))
    .map_err(|err| format!("Failed to seek ZIP data: {err}"))?;
  let mut bytes = vec![0u8; entry.uncompressed_size as usize];
  file
    .read_exact(&mut bytes)
    .map_err(|err| format!("Failed to read ZIP entry {}: {err}", entry.name))?;
  let crc32 = crc32_bytes(&bytes);
  if crc32 != entry.crc32 {
    return Err(format!("ZIP entry checksum mismatch: {}", entry.name));
  }
  Ok(bytes)
}

fn extract_zip_entry_to_file(path: &Path, entry: &ZipCentralEntry, target_path: &Path) -> Result<(), String> {
  if entry.compressed_size != entry.uncompressed_size {
    return Err("Only stored ZIP entries are supported".to_string());
  }
  let mut file = File::open(path).map_err(|err| format!("Failed to open {}: {err}", path.display()))?;
  let data_offset = zip_entry_data_offset(&mut file, entry)?;
  file
    .seek(SeekFrom::Start(data_offset))
    .map_err(|err| format!("Failed to seek ZIP data: {err}"))?;
  let mut reader = file.take(u64::from(entry.uncompressed_size));
  let output = File::create(target_path)
    .map_err(|err| format!("Failed to create {}: {err}", target_path.display()))?;
  let mut writer = BufWriter::new(output);
  let mut crc = !0u32;
  let mut remaining = u64::from(entry.uncompressed_size);
  let mut buffer = [0u8; 64 * 1024];

  while remaining > 0 {
    let read = reader
      .read(&mut buffer)
      .map_err(|err| format!("Failed to read ZIP entry {}: {err}", entry.name))?;
    if read == 0 {
      return Err(format!("ZIP entry is truncated: {}", entry.name));
    }
    crc = crc32_update(crc, &buffer[..read]);
    writer
      .write_all(&buffer[..read])
      .map_err(|err| format!("Failed to write {}: {err}", target_path.display()))?;
    remaining = remaining.saturating_sub(read as u64);
  }
  writer
    .flush()
    .map_err(|err| format!("Failed to flush {}: {err}", target_path.display()))?;

  let actual_crc32 = !crc;
  if actual_crc32 != entry.crc32 {
    return Err(format!("ZIP entry checksum mismatch: {}", entry.name));
  }
  Ok(())
}

fn read_project_archive_zip(path: &Path) -> Result<ReadProjectArchiveZip, String> {
  let entries = parse_zip_central_entries(path)?;
  let manifest_entry = entries
    .iter()
    .find(|entry| entry.name == "manifest.json")
    .ok_or_else(|| "Project archive is missing manifest.json".to_string())?;
  let backup_entry = entries
    .iter()
    .find(|entry| entry.name == "backup.json")
    .ok_or_else(|| "Project archive is missing backup.json".to_string())?;
  let manifest_json = read_zip_entry_bytes(path, manifest_entry)?;
  let manifest: ProjectArchiveManifest = serde_json::from_slice(&manifest_json)
    .map_err(|err| format!("Invalid project archive manifest: {err}"))?;
  if manifest.app != "novel-generator" || manifest.kind != "project-archive" || manifest.schema != 1 {
    return Err("Unsupported project archive format".to_string());
  }
  let backup_json = read_zip_entry_bytes(path, backup_entry)?;
  Ok(ReadProjectArchiveZip {
    manifest,
    backup_json,
    entries,
  })
}

fn extract_archive_media(
  archive_path: &Path,
  archive: &ReadProjectArchiveZip,
  media_root: &Path,
) -> Result<usize, String> {
  let mut entries_by_name = HashMap::new();
  for entry in &archive.entries {
    entries_by_name.insert(entry.name.as_str(), entry);
  }

  let mut extracted = 0usize;
  let mut extracted_archive_paths = HashSet::new();
  for file_entry in &archive.manifest.files {
    validate_archive_path(&file_entry.archive_path)?;
    if !extracted_archive_paths.insert(file_entry.archive_path.as_str()) {
      continue;
    }
    let Some(zip_entry) = entries_by_name.get(file_entry.archive_path.as_str()) else {
      return Err(format!("Project archive is missing media entry {}", file_entry.archive_path));
    };
    let target_path = path_from_archive_relative(media_root, &file_entry.relative_path)?;
    if let Some(parent) = target_path.parent() {
      fs::create_dir_all(parent)
        .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
    }
    extract_zip_entry_to_file(archive_path, zip_entry, &target_path)?;
    extracted += 1;
  }
  Ok(extracted)
}

fn rewrite_snapshot_media_paths(
  snapshot: &mut Value,
  manifest: &ProjectArchiveManifest,
  media_root: &Path,
) -> Result<(), String> {
  let mut paths_by_asset_id = HashMap::new();
  for file_entry in &manifest.files {
    let target = path_from_archive_relative(media_root, &file_entry.relative_path)?;
    paths_by_asset_id.insert(file_entry.asset_id.as_str(), target.to_string_lossy().to_string());
  }

  let media_assets = snapshot
    .get_mut("mediaAssets")
    .and_then(Value::as_array_mut)
    .ok_or_else(|| "Backup snapshot must include a mediaAssets array".to_string())?;
  for asset in media_assets {
    let Some(asset_id) = asset.get("id").and_then(Value::as_str) else {
      continue;
    };
    let Some(path) = paths_by_asset_id.get(asset_id) else {
      continue;
    };
    if let Some(object) = asset.as_object_mut() {
      object.insert("path".to_string(), Value::String(path.clone()));
    }
  }
  Ok(())
}

fn powershell_single_quoted(value: &str) -> String {
  value
    .chars()
    .map(|ch| if matches!(ch, '\r' | '\n') { ' ' } else { ch })
    .collect::<String>()
    .replace('\'', "''")
}

#[cfg(target_os = "windows")]
fn pick_save_file_path(
  title: &str,
  filename: &str,
  filter: &str,
  default_ext: &str,
) -> Result<Option<PathBuf>, String> {
  let title = powershell_single_quoted(title);
  let filename = powershell_single_quoted(filename);
  let filter = powershell_single_quoted(filter);
  let default_ext = powershell_single_quoted(default_ext);
  let script = format!(
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;\n\
     Add-Type -AssemblyName System.Windows.Forms;\n\
     $dialog = New-Object System.Windows.Forms.SaveFileDialog;\n\
     $dialog.Title = '{title}';\n\
     $dialog.FileName = '{filename}';\n\
     $dialog.Filter = '{filter}';\n\
     $dialog.DefaultExt = '{default_ext}';\n\
     $dialog.AddExtension = $true;\n\
     $dialog.OverwritePrompt = $true;\n\
     $desktop = [Environment]::GetFolderPath('Desktop');\n\
     if ($desktop) {{ $dialog.InitialDirectory = $desktop; }}\n\
     if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ [Console]::WriteLine($dialog.FileName) }}"
  );

  let output = Command::new("powershell.exe")
    .arg("-NoProfile")
    .arg("-STA")
    .arg("-Command")
    .arg(script)
    .output()
    .map_err(|err| format!("Failed to open save dialog: {err}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(format!("Save dialog failed: {stderr}"));
  }

  let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if selected.is_empty() {
    return Ok(None);
  }

  Ok(Some(PathBuf::from(selected)))
}

#[cfg(not(target_os = "windows"))]
fn pick_save_file_path(
  _title: &str,
  _filename: &str,
  _filter: &str,
  _default_ext: &str,
) -> Result<Option<PathBuf>, String> {
  Err("Save dialog is currently supported only on Windows desktop builds".to_string())
}

#[cfg(target_os = "windows")]
fn pick_open_archive_path(title: &str) -> Result<Option<PathBuf>, String> {
  let title = powershell_single_quoted(title);
  let script = format!(
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;\n\
     Add-Type -AssemblyName System.Windows.Forms;\n\
     $dialog = New-Object System.Windows.Forms.OpenFileDialog;\n\
     $dialog.Title = '{title}';\n\
     $dialog.Filter = 'ZIP (*.zip)|*.zip';\n\
     $dialog.CheckFileExists = $true;\n\
     $dialog.CheckPathExists = $true;\n\
     $desktop = [Environment]::GetFolderPath('Desktop');\n\
     if ($desktop) {{ $dialog.InitialDirectory = $desktop; }}\n\
     if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ [Console]::WriteLine($dialog.FileName) }}"
  );

  let output = Command::new("powershell.exe")
    .arg("-NoProfile")
    .arg("-STA")
    .arg("-Command")
    .arg(script)
    .output()
    .map_err(|err| format!("Failed to open archive dialog: {err}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(format!("Open dialog failed: {stderr}"));
  }

  let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if selected.is_empty() {
    return Ok(None);
  }

  Ok(Some(PathBuf::from(selected)))
}

#[cfg(not(target_os = "windows"))]
fn pick_open_archive_path(_title: &str) -> Result<Option<PathBuf>, String> {
  Err("Open archive dialog is currently supported only on Windows desktop builds".to_string())
}

#[tauri::command]
fn export_json_file_to_picked_directory(args: ExportJsonFileArgs) -> Result<Option<String>, String> {
  let filename = safe_export_filename(&args.filename)?;
  let Some(path) = pick_save_file_path(&args.title, filename, "JSON (*.json)|*.json", "json")? else {
    return Ok(None);
  };
  if path
    .extension()
    .and_then(|ext| ext.to_str())
    .map_or(true, |ext| !ext.eq_ignore_ascii_case("json"))
  {
    return Err("Selected export file must end with .json".to_string());
  }
  fs::write(&path, args.content).map_err(|err| format!("Failed to write {}: {err}", path.display()))?;
  Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
fn export_project_archive_to_picked_file(
  args: ExportProjectArchiveArgs,
) -> Result<Option<ExportProjectArchiveResult>, String> {
  let filename = safe_archive_filename(&args.filename)?;
  let Some(path) = pick_save_file_path(&args.title, filename, "ZIP (*.zip)|*.zip", "zip")? else {
    return Ok(None);
  };
  if path
    .extension()
    .and_then(|ext| ext.to_str())
    .map_or(true, |ext| !ext.eq_ignore_ascii_case("zip"))
  {
    return Err("Selected project archive must end with .zip".to_string());
  }

  let snapshot: Value = serde_json::from_str(&args.snapshot_json)
    .map_err(|err| format!("Invalid backup JSON: {err}"))?;
  let (files, missing_files, media_entries) = collect_archive_media(&snapshot)?;
  let manifest = ProjectArchiveManifest {
    app: "novel-generator".to_string(),
    kind: "project-archive".to_string(),
    schema: 1,
    exported_at: std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map_err(|err| format!("System clock is before UNIX epoch: {err}"))?
      .as_millis()
      .try_into()
      .map_err(|_| "Export timestamp overflow".to_string())?,
    media_root_strategy: "relative-to-media-root".to_string(),
    files,
    missing_files,
  };

  write_project_archive_zip(&path, &manifest, args.snapshot_json.as_bytes(), &media_entries)?;

  Ok(Some(ExportProjectArchiveResult {
    path: path.to_string_lossy().to_string(),
    media_file_count: media_entries.len(),
    missing_files: manifest.missing_files,
  }))
}

#[tauri::command]
fn import_project_archive_from_picked_file(
  args: ImportProjectArchiveArgs,
) -> Result<Option<ImportProjectArchiveResult>, String> {
  let Some(path) = pick_open_archive_path(&args.title)? else {
    return Ok(None);
  };
  if path
    .extension()
    .and_then(|ext| ext.to_str())
    .map_or(true, |ext| !ext.eq_ignore_ascii_case("zip"))
  {
    return Err("Selected project archive must end with .zip".to_string());
  }

  let archive = read_project_archive_zip(&path)?;
  let media_root = app_media_root_path()?;
  let media_file_count = extract_archive_media(&path, &archive, &media_root)?;
  let mut snapshot: Value = serde_json::from_slice(&archive.backup_json)
    .map_err(|err| format!("Invalid backup JSON in project archive: {err}"))?;
  rewrite_snapshot_media_paths(&mut snapshot, &archive.manifest, &media_root)?;
  let snapshot_json = serde_json::to_string_pretty(&snapshot)
    .map_err(|err| format!("Failed to encode imported backup JSON: {err}"))?;

  Ok(Some(ImportProjectArchiveResult {
    snapshot_json,
    media_file_count,
    missing_files: archive.manifest.missing_files,
  }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let migrations = vec![
    Migration {
      version: 1,
      description: "initial schema",
      sql: include_str!("../migrations/001_initial.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "wiki_pages and wiki_log",
      sql: include_str!("../migrations/002_wiki_tables.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 3,
      description: "FTS5 chapters/wiki_pages search index",
      sql: include_str!("../migrations/003_fts.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 4,
      description: "comic image metadata",
      sql: include_str!("../migrations/004_comics.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 5,
      description: "scene visual settings",
      sql: include_str!("../migrations/005_scene_visuals.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 6,
      description: "comic panel image variants",
      sql: include_str!("../migrations/006_comic_panel_image_variants.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 7,
      description: "comic TTS and video metadata indexes",
      sql: include_str!("../migrations/007_comic_tts_video_metadata.sql"),
      kind: MigrationKind::Up,
    },
  ];

  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      generate_tts_audio,
      probe_audio_duration,
      probe_video_duration,
      probe_video_has_audio,
      render_comic_video_segment,
      render_comic_video_clip_segment,
      concat_comic_video,
      delete_media_file,
      media_file_exists,
      read_media_file_bytes,
      open_media_file,
      reveal_media_file,
      write_text_file,
      write_binary_file,
      resolve_media_root,
      export_json_file_to_picked_directory,
      export_project_archive_to_picked_file,
      import_project_archive_from_picked_file,
    ])
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:novel-generator.db", migrations)
        .build(),
    )
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn windows_reveal_folder_arg_opens_parent_directory() {
    let path = PathBuf::from(r"C:\Leo\Project\novel-generator\output\media\book\chapters\chapter\comic-video/segments/segment-001.mp4");

    assert_eq!(
      build_windows_reveal_folder_arg(&path).as_deref(),
      Some(r"C:\Leo\Project\novel-generator\output\media\book\chapters\chapter\comic-video\segments"),
    );
  }

  #[test]
  fn media_file_exists_reports_existing_safe_media_file() {
    let dir = app_media_root_path()
      .unwrap()
      .join(format!("rust-test-media-file-exists-{}", std::process::id()));
    let path = dir.join("segment-001.mp4");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, b"video").unwrap();

    let exists = media_file_exists(MediaFileExistsArgs {
      path: path.to_string_lossy().to_string(),
    });

    let _ = fs::remove_file(&path);
    let _ = fs::remove_dir(&dir);
    assert_eq!(exists, Ok(true));
  }

  #[test]
  fn export_filename_rejects_path_components() {
    assert!(safe_export_filename(r"..\backup.json").is_err());
    assert!(safe_export_filename("backup.txt").is_err());
    assert_eq!(safe_export_filename("novel-generator-backup.json"), Ok("novel-generator-backup.json"));
  }

  #[test]
  fn zip_stored_roundtrip_reads_manifest_and_backup() {
    let archive_path = std::env::temp_dir().join(format!(
      "novel-generator-archive-test-{}.zip",
      std::process::id(),
    ));
    let manifest = ProjectArchiveManifest {
      app: "novel-generator".to_string(),
      kind: "project-archive".to_string(),
      schema: 1,
      exported_at: 123,
      media_root_strategy: "relative-to-media-root".to_string(),
      files: Vec::new(),
      missing_files: Vec::new(),
    };

    write_project_archive_zip(
      &archive_path,
      &manifest,
      br#"{"app":"novel-generator","schema":2,"mediaAssets":[]}"#,
      &[],
    )
    .unwrap();

    let archive = read_project_archive_zip(&archive_path).unwrap();
    fs::remove_file(&archive_path).unwrap();

    assert_eq!(archive.manifest.app, "novel-generator");
    assert_eq!(
      String::from_utf8(archive.backup_json).unwrap(),
      r#"{"app":"novel-generator","schema":2,"mediaAssets":[]}"#,
    );
  }

  #[test]
  fn archive_path_rejects_traversal() {
    assert!(validate_archive_path("media/book/image.png").is_ok());
    assert!(validate_archive_path("../backup.json").is_err());
    assert!(validate_archive_path("media/../backup.json").is_err());
    assert!(validate_archive_path(r"media\book\image.png").is_err());
    assert!(validate_archive_path("C:/temp/image.png").is_err());
  }

  #[test]
  fn project_archive_rewrites_media_paths() {
    let root = PathBuf::from(r"C:\Imported\output\media");
    let mut snapshot: Value = serde_json::from_str(
      r#"{
        "app": "novel-generator",
        "schema": 2,
        "mediaAssets": [
          { "id": "asset-1", "path": "C:\\Old\\output\\media\\book\\image.png" },
          { "id": "asset-2", "path": "C:\\Old\\output\\media\\missing.png" }
        ]
      }"#,
    )
    .unwrap();
    let manifest = ProjectArchiveManifest {
      app: "novel-generator".to_string(),
      kind: "project-archive".to_string(),
      schema: 1,
      exported_at: 123,
      media_root_strategy: "relative-to-media-root".to_string(),
      files: vec![ProjectArchiveFile {
        asset_id: "asset-1".to_string(),
        original_path: r"C:\Old\output\media\book\image.png".to_string(),
        relative_path: "book/image.png".to_string(),
        archive_path: "media/book/image.png".to_string(),
        size_bytes: 4,
      }],
      missing_files: Vec::new(),
    };

    rewrite_snapshot_media_paths(&mut snapshot, &manifest, &root).unwrap();

    assert_eq!(
      snapshot["mediaAssets"][0]["path"],
      Value::String(root.join("book").join("image.png").to_string_lossy().to_string()),
    );
    assert_eq!(
      snapshot["mediaAssets"][1]["path"],
      Value::String(r"C:\Old\output\media\missing.png".to_string()),
    );
  }

  #[test]
  fn motion_video_filter_uses_zoompan_for_slow_zoom_in() {
    let filter = build_video_filter("slow_zoom_in", 1920, 1080, 30, 5000);

    assert!(filter.contains("zoompan="));
    assert!(filter.contains("force_original_aspect_ratio=decrease"));
    assert!(filter.contains("pad=1920:1080:(ow-iw)/2:(oh-ih)/2"));
    assert!(!filter.contains("force_original_aspect_ratio=increase"));
    assert!(filter.contains("min(zoom+0.0015,1.08)"));
    assert!(filter.contains("s=1920x1080:fps=30"));
    assert!(filter.contains("format=yuv420p[v]"));
  }

  #[test]
  fn motion_video_filter_applies_fade_out() {
    let filter = build_video_filter("fade_out", 1920, 1080, 30, 3000);

    assert!(filter.contains("fade=t=out:st=2.500:d=0.500"));
    assert!(filter.contains("zoompan="));
  }

  #[test]
  fn clip_video_filter_loops_video_when_requested() {
    let filter = build_video_clip_filter(1, 1920, 1080, 30, 12400, 9000, false, true);

    assert!(filter.contains("loop=loop=-1:size=270:start=0"));
    assert!(filter.contains("trim=duration=12.400"));
    assert!(!filter.contains("tpad=stop_mode=clone"));
  }

  #[test]
  fn clip_video_filter_mixes_original_clip_audio_when_requested() {
    let filter = build_video_clip_filter(2, 1920, 1080, 30, 18400, 18000, true, false);

    assert!(filter.contains("[0:a]aresample=44100"));
    assert!(filter.contains("[1:a]aresample=44100"));
    assert!(filter.contains("[a0][a1]concat=n=2:v=0:a=1[clipa]"));
    assert!(filter.contains("[clipaudio][narration]amix=inputs=2"));
  }
}
