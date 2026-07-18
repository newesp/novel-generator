# Novel Generator

[繁體中文](README.md)

> Version: 1.11 (Mantine v2 local workspace UI)
>
> Updated: 2026-07-18

A local-first Chinese novel writing tool available as a browser Web App and a Windows desktop app built with Tauri. The core workflow covers book management, outlines, characters, chapter drafting, versions, LLM Wiki, full-text search, knowledge graph, comic image generation, and desktop comic TTS / MP4 / SRT output, including single-panel video rerendering, motion effects, and a chapter-level video library.

- Target language: Chinese novels first
- Usage: local browser or Windows desktop app
- Current data layer: IndexedDB (Dexie) in browser; SQLite (`tauri-plugin-sql`) on desktop
- Export formats: full-book `.txt` / `.html` / `.epub` export is implemented
- Current UI: Mantine Gray theme with independent Outline, Character, Scene, Chapter, Wiki, Comic, and Video workspaces; v1 remains available at tag `v1.0.0` and branch `release/v1`

---

## Quick Start

### Browser App

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. On first use, open Preferences and fill in the LLM provider plus API key. Supported text providers include OpenAI-compatible APIs, Google Gemini, and Grok.

### Desktop App (Windows, Phase 5b)

The desktop app wraps the same React app with Tauri and stores data in SQLite at `%AppData%\com.novelgenerator.app\novel-generator.db`, avoiding browser private-mode cleanup and storage quota issues.

Prerequisites: [Rust toolchain](https://rustup.rs/), Visual Studio Build Tools (Desktop C++), and WebView2 Runtime. Windows 10/11 usually includes WebView2 already.

```bash
# Development (starts Vite + Tauri webview)
npm run tauri dev

# Build an MSI installer
npm run tauri build
# Output: src-tauri/target/release/bundle/msi/*.msi
```

Browser data can be moved to the desktop app through "export JSON -> import in desktop".

---

## CI/CD

GitHub Actions uses `.github/workflows/ci-cd.yml`:

- Pull Requests run `npm ci`, `npm run lint`, `npm run test`, and `npm run build` on `ubuntu-latest`.
- Pushes to `main` run the same CI first; after it passes, `windows-latest` builds the Tauri Windows MSI and uploads it as a workflow artifact.
- GitHub Pages is not deployed. Static Pages cannot provide Tauri SQLite, native file dialogs, ffmpeg / Edge-TTS sidecars, or the Vite dev-only `/llm-proxy`, so the installable desktop artifact is the current CD target.

---

## System Layers

1. **UI layer** - React 19 + TypeScript strict + Vite 8 + Mantine Gray theme; existing custom components remain as a compatibility layer.
2. **Business logic layer** - outlines, characters, chapters, versions, LLM Wiki, Context Budget, Lint, Graph, and comic images.
3. **LLM adapter layer** - custom OpenAI-compatible, Google Gemini, and Grok for text; ComfyUI, OpenAI-compatible image, DeepInfra FLUX, and Google Gemini Image for images.
4. **Storage layer** - unified `StorageAdapter`; browser uses Dexie / IndexedDB, desktop uses Tauri SQLite + FTS5.

---

## Module Index

| File | Module | Phase | Depends On |
|------|--------|-------|------------|
| [00-book.md](modules/00-book.md) | Book management (root container for all data) | 1 | - |
| [01-outline.md](modules/01-outline.md) | Outline generation system | 1 | 00, 02, 07, 08 |
| [02-characters.md](modules/02-characters.md) | Character system | 2 | 00, 04 |
| [03-chapters.md](modules/03-chapters.md) | Chapter manager | 1 | 00, 04, 05, 07 |
| [04-knowledge.md](modules/04-knowledge.md) | Knowledge management (Wiki, FTS5, Lint, Graph, Ask Wiki) | 2 / 2.5 | 00, 07 |
| [05-versions.md](modules/05-versions.md) | Chapter version management | 1 | 00 |
| [06-polish.md](modules/06-polish.md) | Content polish editor (not implemented) | 3 | 00, 08 |
| [07-context-budget.md](modules/07-context-budget.md) | Context Budget Manager (Wiki summaries + pick-pages + summary quality) | 1 / 2.5 | 04 |
| [08-llm-adapter.md](modules/08-llm-adapter.md) | LLM adapter layer | 1 / 2 | tech-stack |
| [09-multi-agent.md](modules/09-multi-agent.md) | Multi-Agent collaboration engine (not implemented) | 4 (optional) | 04, 07 |
| [10-multimedia.md](modules/10-multimedia.md) | Multimedia generation (comic images, TTS, MP4, SRT, motion effects, chapter video library) | 6 / 4 (optional) | 00, tech-stack |

---

## Specs

| File | Description |
|------|-------------|
| [tech-stack.md](specs/tech-stack.md) | Technology choices; `package.json` is the source of truth for package versions |
| [roadmap.md](specs/roadmap.md) | Phase 1-7 roadmap and remaining work |
| [UI.md](specs/UI.md) | Visual spec: colors, typography, components, motion |
| [UI-layout.md](specs/UI-layout.md) | Main editor layout |
| [output-formats.md](specs/output-formats.md) | Output format specs |
| [deployment.md](specs/deployment.md) | Deployment modes |

---

## Remaining Work

- Phase 2.5 polish: manual batch summary rebuild, LLM pick-pages, advanced Graph event extraction / causal reasoning.
- Phase 3: full content polish editor; the v2 workspace foundation is complete, with focused UI/UX polish continuing.
- Phase 4 / 6: Multi-Agent, cover image generation, full Visual Bible management, provider reference weighting, full-book media library, batch image/video export, video orphan cleanup, multi-character/dialogue TTS, Web fallback for video features.
- Phase 5 / 7: macOS / Linux packaging, code signing, automatic first-launch IndexedDB -> SQLite migration (currently manual JSON), `WaSqliteAdapter` / `WebMediaAdapter`, and PWA redeployment.

See [specs/roadmap.md](specs/roadmap.md) for the detailed status.

---

## License

This project is licensed under the GNU Affero General Public License v3.0 only (SPDX: `AGPL-3.0-only`). See [LICENSE](LICENSE) for the license summary.

---

## Documentation Maintenance

- `package.json` is the source of truth for package versions.
- `src/types/index.ts` and `src/lib/storage/types.ts` are the source of truth for the data model and storage interface.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` are historical design and implementation records. They are not backfilled as current-state docs. Current state is tracked in this README, `modules/`, `specs/`, `docs/CHANGELOG.md`, and the code.

