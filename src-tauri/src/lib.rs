use serde::Deserialize;
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
#[serde(rename_all = "camelCase")]
struct DeleteMediaFileArgs {
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

fn build_windows_reveal_arg(path: &Path) -> String {
  format!(r#"/select,"{}""#, windows_path_arg(path))
}

fn seconds_arg(ms: u64) -> String {
  format!("{:.3}", ms as f64 / 1000.0)
}

#[tauri::command]
fn generate_tts_audio(args: GenerateTtsAudioArgs) -> Result<(), String> {
  let output_path = safe_media_file_path(&args.output_path, true)?;

  let mut command = Command::new(args.edge_tts_bin);
  command
    .arg("--voice")
    .arg(args.voice)
    .arg("--text")
    .arg(args.text)
    .arg("--write-media")
    .arg(output_path);

  run_command(command, "edge-tts")
}

#[tauri::command]
fn probe_audio_duration(args: ProbeAudioDurationArgs) -> Result<u64, String> {
  let input_path = safe_media_file_path(&args.input_path, false)?;
  let output = Command::new(args.ffprobe_bin)
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
fn render_comic_video_segment(args: RenderSegmentArgs) -> Result<(), String> {
  let image_path = safe_media_file_path(&args.image_path, false)?;
  let audio_path = safe_media_file_path(&args.audio_path, false)?;
  let output_path = safe_media_file_path(&args.output_path, true)?;

  let duration = seconds_arg(args.duration_ms);
  let trailing_silence = seconds_arg(args.trailing_silence_ms.max(1));
  let filter = format!(
    "[0:v]scale=w={}:h={}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v];[1:a][2:a]concat=n=2:v=0:a=1[a]",
    args.width, args.height, args.width, args.height
  );

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
    let mut command = Command::new("explorer");
    command.arg(build_windows_reveal_arg(&path));
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
      render_comic_video_segment,
      concat_comic_video,
      delete_media_file,
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
  fn windows_reveal_arg_quotes_selected_path() {
    let path = PathBuf::from(r"C:\Leo\Project\novel-generator\output\media\book\chapters\chapter\comic-video\segments\segment-001.mp4");

    assert_eq!(
      build_windows_reveal_arg(&path),
      r#"/select,"C:\Leo\Project\novel-generator\output\media\book\chapters\chapter\comic-video\segments\segment-001.mp4""#,
    );
  }

  #[test]
  fn windows_reveal_arg_normalizes_mixed_separators() {
    let path = PathBuf::from(r"C:\Leo\Project\novel-generator\output\media\book\chapters\chapter\comic-video/segments/segment-001.mp4");

    assert_eq!(
      build_windows_reveal_arg(&path),
      r#"/select,"C:\Leo\Project\novel-generator\output\media\book\chapters\chapter\comic-video\segments\segment-001.mp4""#,
    );
  }
}
