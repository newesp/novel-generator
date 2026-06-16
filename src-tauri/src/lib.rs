use serde::Deserialize;
use std::fs;
use std::path::Path;
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

fn ensure_parent_dir(path: &str) -> Result<(), String> {
  let parent = Path::new(path)
    .parent()
    .ok_or_else(|| format!("Path has no parent: {path}"))?;

  fs::create_dir_all(parent)
    .map_err(|err| format!("Failed to create {}: {err}", parent.display()))
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

fn seconds_arg(ms: u64) -> String {
  format!("{:.3}", ms as f64 / 1000.0)
}

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
  ensure_parent_dir(&args.output_path)?;

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
    .arg(args.image_path)
    .arg("-i")
    .arg(args.audio_path)
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
    .arg(args.output_path);

  run_command(command, "ffmpeg render segment")
}

#[tauri::command]
fn concat_comic_video(args: ConcatVideoArgs) -> Result<(), String> {
  ensure_parent_dir(&args.output_path)?;

  let mut command = Command::new(args.ffmpeg_bin);
  command
    .arg("-y")
    .arg("-f")
    .arg("concat")
    .arg("-safe")
    .arg("0")
    .arg("-i")
    .arg(args.concat_list_path)
    .arg("-c")
    .arg("copy")
    .arg(args.output_path);

  run_command(command, "ffmpeg concat")
}

#[tauri::command]
fn delete_media_file(args: DeleteMediaFileArgs) -> Result<(), String> {
  let path = Path::new(&args.path);
  if !path.exists() {
    return Ok(());
  }

  fs::remove_file(path).map_err(|err| format!("Failed to delete {}: {err}", path.display()))
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
