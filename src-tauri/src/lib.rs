use serde::{Deserialize, Serialize};
use std::fs;
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
    .arg(args.voice)
    .arg("--text")
    .arg(args.text)
    .arg("--write-media")
    .arg(output_path);
  if let Some(path) = &subtitle_path {
    command.arg("--write-subtitles").arg(path);
  }

  run_command(command, "edge-tts")?;
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
      open_media_file,
      reveal_media_file,
      write_text_file,
      write_binary_file,
      resolve_media_root,
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
    let path = app_media_root_path()
      .unwrap()
      .join("rust-test-media-file-exists")
      .join("segment-001.mp4");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, b"video").unwrap();

    let exists = media_file_exists(MediaFileExistsArgs {
      path: path.to_string_lossy().to_string(),
    });

    fs::remove_file(&path).unwrap();
    assert_eq!(exists, Ok(true));
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
