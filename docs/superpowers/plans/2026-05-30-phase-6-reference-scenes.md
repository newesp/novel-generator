# Phase 6 Reference Images And Scenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make comic image generation use character reference images, add reusable project-level scene visual settings, add panel-level continuity reference images, and introduce a DeepInfra FLUX-2-pro image provider that can send reference images through `input_image` fields.

**Architecture:** Use the current code as source of truth. Keep existing character visual fields on `Character` for this MVP, add a small `SceneVisual` store for reusable scenes, pass resolved reference `MediaAsset[]` into image providers, and let providers degrade when they cannot use references. Do not implement the full Visual Bible entry architecture yet; this plan creates a compatible Visual Bible-lite path.

**Tech Stack:** React 19, TypeScript strict, Zustand, Dexie, Tauri SQLite adapter, Vitest, existing provider adapter interfaces in `src/lib/comic`.

---

## Current Code Reality

- `Character` already owns comic visual fields: `appearance`, `visualNegativePrompt`, `referenceAssetIds`.
- `composeComicImagePrompt()` already injects active character appearance and returns `referenceAssetIds`.
- `ComicModal` currently does not resolve those ids to `MediaAsset[]`, so providers never receive character reference images.
- `ImageGenerationRequest` has no `referenceImages`.
- `ComicPanel.location` is only free text; there is no reusable project-level scene visual setting.
- `ComfyUIProvider.capabilities.referenceImages` is `true`, but the request interface and workflow builder do not pass images yet.
- `OpenAI-compatible Image` is prompt-only and should stay generic.

## Continuity Reference Addendum

Panel continuity should be controlled per panel, not as a global preference.

- Add `ComicPanel.useContinuityReference?: boolean`.
- Each panel can enable `使用連續性參考圖`.
- When enabled, generation first tries the previous ready panel in the same comic.
- For chapter first panels, generation falls back to the latest comic from the previous chapter and uses its last ready panel image.
- If no usable image exists, generation continues and records a panel warning.
- If the provider does not support reference images, generation continues and records a provider warning.
- The continuity prompt instruction is appended only when a continuity image is actually used:

```text
Use the continuity reference image only for lighting, palette, props, and action flow.
Do not copy the exact camera angle unless this panel asks for it.
```

## File Map

- Modify `src/types/index.ts`: add `SceneVisual`, extend media kind/provider ids/configs, add optional `ComicPanel.sceneSlug`.
- Modify `src/lib/storage/types.ts`: add `SceneVisualStore`.
- Modify `src/lib/db.ts`: add Dexie table/version for `sceneVisuals`.
- Modify `src/lib/storage/dexie-adapter.ts`: implement `sceneVisuals`.
- Modify `src/lib/storage/sqlite-helpers.ts`: add scene visual row helpers.
- Modify `src/lib/storage/tauri-sqlite-adapter.ts`: implement `sceneVisuals`.
- Create `src-tauri/migrations/005_scene_visuals.sql`: SQLite table.
- Modify `src/lib/backup.ts`: include scene visuals in export/import.
- Modify `src/lib/comic/providers.ts`: add reference capability metadata and `referenceImages`.
- Modify `src/lib/comic/prompt-composer.ts`: accept scene visuals and include active scene prompt/negative/reference assets.
- Modify `src/components/comic/ComicModal.tsx`: scene visual UI, scene select per panel, panel-level continuity reference, reference asset resolution, provider warnings.
- Create `src/lib/comic/deepinfra-flux-provider.ts`: DeepInfra FLUX-2-pro provider.
- Modify `src/stores/settingsStore.ts`: add DeepInfra image config defaults.
- Modify docs after code: `docs/CHANGELOG.md`, `specs/roadmap.md`, `modules/10-multimedia.md`.

---

### Task 1: Provider Reference Image Plumbing

**Files:**
- Modify: `src/lib/comic/providers.ts`
- Modify: `src/lib/comic/prompt-composer.test.ts`
- Modify: `src/lib/comic/comfyui-provider.test.ts`
- Modify: `src/lib/comic/openai-image-provider.test.ts`
- Modify: `src/lib/comic/comfyui-provider.ts`
- Modify: `src/lib/comic/openai-image-provider.ts`

- [ ] **Step 1: Write provider interface tests**

Add this test to `src/lib/comic/comfyui-provider.test.ts`:

```ts
it('adds reference images to configured ComfyUI reference nodes', () => {
  const workflow = {
    '1': { inputs: {} },
    '2': { inputs: {} },
    '3': { inputs: {} },
  };

  const result = buildComfyWorkflow(workflow, {
    promptNodeId: '1',
    negativePromptNodeId: '',
    seedNodeId: '',
    widthNodeId: '',
    heightNodeId: '',
    outputNodeId: '',
    referenceImageNodeIds: ['2', '3'],
  }, {
    prompt: 'Afei in workshop',
    width: 1024,
    height: 1024,
    referenceImages: [
      { id: 'asset-1', projectId: 'p1', kind: 'character_reference_image', url: 'data:image/png;base64,aaa', mimeType: 'image/png', createdAt: 1 },
      { id: 'asset-2', projectId: 'p1', kind: 'character_reference_image', url: 'data:image/png;base64,bbb', mimeType: 'image/png', createdAt: 1 },
    ],
  });

  expect(result['2'].inputs?.image).toBe('data:image/png;base64,aaa');
  expect(result['3'].inputs?.image).toBe('data:image/png;base64,bbb');
});
```

Add this test to `src/lib/comic/openai-image-provider.test.ts`:

```ts
it('keeps generic OpenAI-compatible image provider prompt-only even when references are present', async () => {
  const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
    void args;
    return new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  await openAICompatibleImageProvider.generateImage({
    panelId: 'panel-1',
    prompt: 'Afei',
    width: 1024,
    height: 1024,
    referenceImages: [
      { id: 'asset-1', projectId: 'p1', kind: 'character_reference_image', url: 'data:image/png;base64,aaa', mimeType: 'image/png', createdAt: 1 },
    ],
    providerConfig: {
      providerId: 'openai-compatible-image',
      baseUrl: 'https://example.test/v1',
      apiKey: 'key',
      model: 'image-model',
    },
  });

  const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
  const body = JSON.parse(String(requestInit.body));
  expect(body.input_image).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/comfyui-provider.test.ts src/lib/comic/openai-image-provider.test.ts
```

Expected: FAIL because `referenceImageNodeIds` and `referenceImages` are not part of the current types/build request.

- [ ] **Step 3: Extend provider types**

In `src/lib/comic/providers.ts`, update the capability/request types:

```ts
import type { ImageProviderConfig, MediaAsset } from '../../types';

export type ReferenceImageMode = 'none' | 'single-input-image' | 'multi-reference';

export interface ImageProviderCapabilities {
  negativePrompt: boolean;
  seed: boolean;
  referenceImages: boolean;
  referenceMode: ReferenceImageMode;
  maxReferenceImages?: number;
  batch: boolean;
  polling: boolean;
  outputFormats: Array<'png' | 'jpg' | 'webp'>;
  freeformSize: boolean;
  maxPromptChars?: number;
}

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  referenceImages?: MediaAsset[];
  panelId: string;
  providerConfig: ImageProviderConfig;
}
```

- [ ] **Step 4: Extend ComfyUI config and workflow builder**

In `src/types/index.ts`, extend `ComfyUIImageProviderConfig`:

```ts
export interface ComfyUIImageProviderConfig {
  providerId: 'comfyui';
  baseUrl: string;
  workflowJson: string;
  promptNodeId: string;
  negativePromptNodeId: string;
  seedNodeId: string;
  widthNodeId: string;
  heightNodeId: string;
  outputNodeId: string;
  referenceImageNodeIds?: string[];
}
```

In `src/lib/comic/comfyui-provider.ts`, update config/request picks:

```ts
interface ComfyBuildRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  referenceImages?: MediaAsset[];
}
```

Update `buildComfyWorkflow()`:

```ts
  config.referenceImageNodeIds?.forEach((nodeId, index) => {
    const image = request.referenceImages?.[index];
    if (image?.url) setInput(next, nodeId, 'image', image.url);
  });
```

Set ComfyUI capabilities:

```ts
referenceImages: true,
referenceMode: 'multi-reference',
maxReferenceImages: 4,
```

Set OpenAI-compatible capabilities:

```ts
referenceImages: false,
referenceMode: 'none',
maxReferenceImages: 0,
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/comfyui-provider.test.ts src/lib/comic/openai-image-provider.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/types/index.ts src/lib/comic/providers.ts src/lib/comic/comfyui-provider.ts src/lib/comic/comfyui-provider.test.ts src/lib/comic/openai-image-provider.ts src/lib/comic/openai-image-provider.test.ts
git commit -m "Add image provider reference plumbing"
```

---

### Task 2: Scene Visual Data Model And Storage

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/storage/types.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/lib/storage/dexie-adapter.ts`
- Modify: `src/lib/storage/sqlite-helpers.ts`
- Modify: `src/lib/storage/tauri-sqlite-adapter.ts`
- Create: `src-tauri/migrations/004_scene_visuals.sql`
- Modify: `src/lib/backup.ts`
- Create: `src/lib/scene-visuals.test.ts`

- [ ] **Step 1: Write storage tests**

Create `src/lib/scene-visuals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SceneVisual } from '../types';
import { createDefaultSceneVisual } from './scene-visuals';

describe('scene visuals', () => {
  it('creates a reusable project-level scene visual from a title and location prompt', () => {
    const scene = createDefaultSceneVisual({
      projectId: 'project-1',
      title: 'Afei room',
      prompt: 'cramped wooden room, old tools, warm oil lamp, worn blanket',
    });

    expect(scene).toMatchObject({
      projectId: 'project-1',
      slug: 'afei-room',
      title: 'Afei room',
      prompt: 'cramped wooden room, old tools, warm oil lamp, worn blanket',
      negativePrompt: '',
      referenceAssetIds: [],
    } satisfies Partial<SceneVisual>);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/scene-visuals.test.ts
```

Expected: FAIL because `SceneVisual` and `createDefaultSceneVisual()` do not exist.

- [ ] **Step 3: Add SceneVisual type**

In `src/types/index.ts`, add near comic image types:

```ts
export interface SceneVisual {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  prompt: string;
  negativePrompt: string;
  referenceAssetIds: string[];
  createdAt: number;
  updatedAt: number;
}
```

Extend `MediaAssetKind`:

```ts
export type MediaAssetKind =
  | 'comic_panel_image'
  | 'character_reference_image'
  | 'scene_reference_image'
  | 'tts_audio'
  | 'video';
```

Extend `ComicPanel`:

```ts
sceneSlug?: string;
```

- [ ] **Step 4: Add scene helper**

Create `src/lib/scene-visuals.ts`:

```ts
import { v4 as uuid } from 'uuid';
import type { SceneVisual } from '../types';

interface CreateDefaultSceneVisualInput {
  projectId: string;
  title: string;
  prompt: string;
}

export function createDefaultSceneVisual(input: CreateDefaultSceneVisualInput): SceneVisual {
  const now = Date.now();
  return {
    id: uuid(),
    projectId: input.projectId,
    slug: slugifySceneTitle(input.title),
    title: input.title.trim(),
    prompt: input.prompt.trim(),
    negativePrompt: '',
    referenceAssetIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function slugifySceneTitle(title: string): string {
  const normalized = title.trim().toLowerCase();
  const ascii = normalized
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (ascii) return ascii;
  return normalized
    .split('')
    .map((char) => char.charCodeAt(0).toString(36))
    .join('-')
    .slice(0, 64) || 'scene';
}
```

- [ ] **Step 5: Add storage interface**

In `src/lib/storage/types.ts`, import `SceneVisual` and add:

```ts
export interface SceneVisualStore {
  list(projectId: string): Promise<SceneVisual[]>;
  get(id: string): Promise<SceneVisual | undefined>;
  getBySlug(projectId: string, slug: string): Promise<SceneVisual | undefined>;
  add(scene: SceneVisual): Promise<void>;
  update(id: string, data: Partial<SceneVisual>): Promise<void>;
  delete(id: string): Promise<void>;
}
```

Add to `StorageAdapter`:

```ts
sceneVisuals: SceneVisualStore;
```

Add to backup snapshot:

```ts
sceneVisuals?: SceneVisual[];
```

- [ ] **Step 6: Implement Dexie store**

In `src/lib/db.ts`, add table:

```ts
sceneVisuals!: Table<SceneVisual>;
```

Add a new version:

```ts
this.version(8).stores({
  sceneVisuals: 'id, projectId, slug, updatedAt',
});
```

In `src/lib/storage/dexie-adapter.ts`, add:

```ts
const sceneVisuals: SceneVisualStore = {
  list: (projectId) => db.sceneVisuals.where('projectId').equals(projectId).sortBy('title'),
  get: (id) => db.sceneVisuals.get(id),
  async getBySlug(projectId, slug) {
    return db.sceneVisuals.where({ projectId, slug }).first();
  },
  add: (scene) => db.sceneVisuals.add(scene).then(() => undefined),
  update: (id, data) => db.sceneVisuals.update(id, data).then(() => undefined),
  delete: (id) => db.sceneVisuals.delete(id),
};
```

Return it from the adapter:

```ts
sceneVisuals,
```

- [ ] **Step 7: Implement SQLite storage**

Create `src-tauri/migrations/004_scene_visuals.sql`:

```sql
CREATE TABLE IF NOT EXISTS scene_visuals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scene_visuals_project_id ON scene_visuals(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_visuals_project_slug ON scene_visuals(project_id, slug);
```

In `src/lib/storage/sqlite-helpers.ts`, add row helpers:

```ts
export interface SceneVisualRow {
  id: string;
  project_id: string;
  slug: string;
  title: string;
  data: string;
  updated_at: number;
}

export function sceneVisualToRow(scene: SceneVisual): SceneVisualRow {
  return {
    id: scene.id,
    project_id: scene.projectId,
    slug: scene.slug,
    title: scene.title,
    data: JSON.stringify(scene),
    updated_at: scene.updatedAt,
  };
}

export function rowToSceneVisual(row: SceneVisualRow): SceneVisual {
  return JSON.parse(row.data) as SceneVisual;
}
```

In `src/lib/storage/tauri-sqlite-adapter.ts`, add CRUD methods mirroring `mediaAssets`, using:

```ts
const SCENE_VISUAL_COLS = 'id, project_id, slug, title, data, updated_at';
```

- [ ] **Step 8: Include scene visuals in backup**

In `src/lib/backup.ts`, add export:

```ts
sceneVisuals: await storage.sceneVisuals.list(project.id),
```

Add import:

```ts
for (const scene of snapshot.sceneVisuals ?? []) {
  await storage.sceneVisuals.add(scene);
}
```

Update snapshot description count:

```ts
sceneVisuals: snapshot.sceneVisuals?.length ?? 0,
```

- [ ] **Step 9: Run tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/scene-visuals.test.ts src/lib/comic/storage-types.test.ts
.\node_modules\.bin\tsc.cmd -b
```

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add src/types/index.ts src/lib/scene-visuals.ts src/lib/scene-visuals.test.ts src/lib/storage/types.ts src/lib/db.ts src/lib/storage/dexie-adapter.ts src/lib/storage/sqlite-helpers.ts src/lib/storage/tauri-sqlite-adapter.ts src-tauri/migrations/004_scene_visuals.sql src/lib/backup.ts
git commit -m "Add project scene visual storage"
```

---

### Task 3: Prompt Composer Uses Scene Visuals And Reference Assets

**Files:**
- Modify: `src/lib/comic/prompt-composer.ts`
- Modify: `src/lib/comic/prompt-composer.test.ts`

- [ ] **Step 1: Write composer tests**

Add to `src/lib/comic/prompt-composer.test.ts`:

```ts
it('includes the active scene visual prompt and reference image ids', () => {
  const result = composeComicImagePrompt({
    panel: {
      ...basePanel,
      sceneSlug: 'afei-room',
      location: '阿飛的房間',
    },
    stylePreset: 'manga',
    characters: [],
    scenes: [{
      id: 'scene-1',
      projectId: 'book',
      slug: 'afei-room',
      title: '阿飛的房間',
      prompt: 'cramped wooden workshop bedroom, warm oil lamp, old tools on the wall',
      negativePrompt: 'modern apartment, clean hotel room',
      referenceAssetIds: ['scene-ref-1'],
      createdAt: 1,
      updatedAt: 1,
    }],
  });

  expect(result.prompt).toContain('Scene visual reference');
  expect(result.prompt).toContain('cramped wooden workshop bedroom');
  expect(result.negativePrompt).toContain('modern apartment');
  expect(result.referenceAssetIds).toContain('scene-ref-1');
});

it('warns when a panel sceneSlug has no matching scene visual', () => {
  const result = composeComicImagePrompt({
    panel: { ...basePanel, sceneSlug: 'missing-scene' },
    stylePreset: 'manga',
    characters: [],
    scenes: [],
  });

  expect(result.warnings).toContain('Panel 1 references missing scene visual: missing-scene');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/prompt-composer.test.ts
```

Expected: FAIL because `scenes` input and scene prompt composition do not exist.

- [ ] **Step 3: Extend composer input**

In `src/lib/comic/prompt-composer.ts`:

```ts
import type { Character, ComicPanel, ComicPanelExtraGroup, SceneVisual } from '../../types';

export interface ComposeComicImagePromptInput {
  panel: ComicPanel;
  stylePreset: string;
  characters?: Character[];
  scenes?: SceneVisual[];
}
```

- [ ] **Step 4: Select active scene**

Add helper:

```ts
function selectActiveScene(panel: ComicPanel, scenes: SceneVisual[]): SceneVisual | undefined {
  if (!panel.sceneSlug) return undefined;
  return scenes.find((scene) => scene.slug === panel.sceneSlug);
}
```

Inside `composeComicImagePrompt()`:

```ts
const activeScene = selectActiveScene(input.panel, input.scenes ?? []);
if (input.panel.sceneSlug && !activeScene) {
  warnings.push(`Panel ${input.panel.order} references missing scene visual: ${input.panel.sceneSlug}`);
}
const scenePrompt = activeScene?.prompt.trim();
const sceneNegativePrompt = activeScene?.negativePrompt.trim();
const referenceAssetIds = Array.from(new Set([
  ...activeCharacters.flatMap((character) => character.referenceAssetIds ?? []),
  ...(activeScene?.referenceAssetIds ?? []),
]));
```

Update prompt parts:

```ts
scenePrompt ? `Scene visual reference (${activeScene?.title}):\n${scenePrompt}` : '',
```

Update negative prompt:

```ts
negativePrompt: [input.panel.negativePrompt, ...characterNegativePrompts, sceneNegativePrompt].filter(Boolean).join('\n'),
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/prompt-composer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/comic/prompt-composer.ts src/lib/comic/prompt-composer.test.ts
git commit -m "Compose comic prompts with scene visuals"
```

---

### Task 4: ComicModal Scene UI And Reference Resolution

**Files:**
- Modify: `src/components/comic/ComicModal.tsx`
- Modify: `src/index.css`
- Create: `src/lib/comic/reference-assets.ts`
- Create: `src/lib/comic/reference-assets.test.ts`

- [ ] **Step 1: Write reference asset resolver tests**

Create `src/lib/comic/reference-assets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MediaAsset } from '../../types';
import { resolveReferenceAssets } from './reference-assets';

const asset = (id: string): MediaAsset => ({
  id,
  projectId: 'book',
  kind: 'character_reference_image',
  url: `data:image/png;base64,${id}`,
  mimeType: 'image/png',
  createdAt: 1,
});

describe('resolveReferenceAssets', () => {
  it('dedupes reference ids and skips missing assets with warnings', async () => {
    const result = await resolveReferenceAssets(['a', 'a', 'missing'], async (id) => id === 'missing' ? undefined : asset(id));

    expect(result.assets.map((item) => item.id)).toEqual(['a']);
    expect(result.warnings).toEqual(['Missing reference asset: missing']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/reference-assets.test.ts
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Add resolver helper**

Create `src/lib/comic/reference-assets.ts`:

```ts
import type { MediaAsset } from '../../types';

export interface ResolveReferenceAssetsResult {
  assets: MediaAsset[];
  warnings: string[];
}

export async function resolveReferenceAssets(
  ids: string[],
  getAsset: (id: string) => Promise<MediaAsset | undefined>,
): Promise<ResolveReferenceAssetsResult> {
  const warnings: string[] = [];
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const assets: MediaAsset[] = [];
  for (const id of uniqueIds) {
    const asset = await getAsset(id);
    if (asset) {
      assets.push(asset);
    } else {
      warnings.push(`Missing reference asset: ${id}`);
    }
  }
  return { assets, warnings };
}
```

- [ ] **Step 4: Load scenes in ComicModal**

In `src/components/comic/ComicModal.tsx`, add state:

```ts
const [scenes, setScenes] = useState<SceneVisual[]>([]);
```

Add effect:

```ts
useEffect(() => {
  if (!open) return;
  let cancelled = false;
  void storage.sceneVisuals.list(project.id).then((items) => {
    if (!cancelled) setScenes(items);
  });
  return () => {
    cancelled = true;
  };
}, [open, project.id]);
```

- [ ] **Step 5: Add scene creation/edit helpers**

Inside `ComicModal.tsx`:

```ts
const addSceneFromLocation = async (location: string) => {
  const title = location.trim() || '未命名場景';
  const scene = createDefaultSceneVisual({
    projectId: project.id,
    title,
    prompt: title,
  });
  await storage.sceneVisuals.add(scene);
  setScenes((current) => [...current, scene].sort((a, b) => a.title.localeCompare(b.title)));
  return scene;
};

const updateScene = async (scene: SceneVisual, patch: Partial<SceneVisual>) => {
  const next = { ...scene, ...patch, updatedAt: Date.now() };
  await storage.sceneVisuals.update(scene.id, next);
  setScenes((current) => current.map((item) => item.id === scene.id ? next : item));
};
```

- [ ] **Step 6: Pass scenes and reference images into generation**

In `generateImages()` and `regeneratePanelImage()`, call composer with scenes:

```ts
const composed = composeComicImagePrompt({
  panel,
  stylePreset: comic.stylePreset || imageGenerationPrefs.stylePreset,
  characters,
  scenes,
});
const resolved = await resolveReferenceAssets(composed.referenceAssetIds, (id) => storage.mediaAssets.get(id));
```

Update queued panel error message:

```ts
errorMessage: [...composed.warnings, ...resolved.warnings].length
  ? [...composed.warnings, ...resolved.warnings].join('\n')
  : panel.errorMessage,
```

Pass to provider:

```ts
referenceImages: provider.capabilities.referenceImages ? resolved.assets : [],
```

For prompt-only providers, add warning:

```ts
if (!provider.capabilities.referenceImages && resolved.assets.length) {
  composed.warnings.push(`${provider.label} does not support reference images; using prompt-only generation.`);
}
```

- [ ] **Step 7: Add scene UI**

In each panel card, add a select:

```tsx
<label>
  <span>場景</span>
  <select
    value={panel.sceneSlug ?? ''}
    onChange={(event) => updatePanel(panel, { sceneSlug: event.target.value || undefined })}
  >
    <option value="">依照分鏡 location</option>
    {scenes.map((scene) => (
      <option key={scene.id} value={scene.slug}>{scene.title}</option>
    ))}
  </select>
</label>
```

Add a button near panel location:

```tsx
<Button variant="secondary" onClick={async () => {
  const scene = await addSceneFromLocation(panel.location);
  await updatePanel(panel, { sceneSlug: scene.slug });
}}>
  從此場景建立設定
</Button>
```

Add a scene editor section above panels:

```tsx
<details className="comic-scene-settings">
  <summary>場景視覺設定</summary>
  {scenes.map((scene) => (
    <div className="comic-scene-row" key={scene.id}>
      <Input value={scene.title} onChange={(value) => updateScene(scene, { title: value })} />
      <Textarea value={scene.prompt} onChange={(value) => updateScene(scene, { prompt: value })} />
      <Textarea value={scene.negativePrompt} onChange={(value) => updateScene(scene, { negativePrompt: value })} />
    </div>
  ))}
</details>
```

- [ ] **Step 8: Add CSS**

In `src/index.css`:

```css
.comic-scene-settings {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  background: var(--surface-2);
}

.comic-scene-row {
  display: grid;
  gap: 8px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 9: Run tests and build**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/reference-assets.test.ts src/lib/comic/prompt-composer.test.ts
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\vite.cmd build
```

Expected: PASS. Vite may still show existing chunk-size warning.

- [ ] **Step 10: Commit**

```powershell
git add src/components/comic/ComicModal.tsx src/index.css src/lib/comic/reference-assets.ts src/lib/comic/reference-assets.test.ts
git commit -m "Use scene visuals and reference assets in comic generation"
```

---

### Task 5: DeepInfra FLUX-2-pro Provider

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/stores/settingsStore.ts`
- Modify: `src/lib/comic/providers.ts`
- Create: `src/lib/comic/deepinfra-flux-provider.ts`
- Create: `src/lib/comic/deepinfra-flux-provider.test.ts`
- Modify: `src/components/Toolbar.tsx`

- [ ] **Step 1: Write DeepInfra provider tests**

Create `src/lib/comic/deepinfra-flux-provider.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildDeepInfraFluxRequest, deepInfraFluxProvider } from './deepinfra-flux-provider';
import type { MediaAsset } from '../../types';

const ref = (id: string, base64: string): MediaAsset => ({
  id,
  projectId: 'book',
  kind: 'character_reference_image',
  url: `data:image/png;base64,${base64}`,
  mimeType: 'image/png',
  createdAt: 1,
});

describe('deepInfraFluxProvider', () => {
  it('maps reference images to input_image fields without data URI prefix', () => {
    const body = buildDeepInfraFluxRequest({
      model: 'black-forest-labs/FLUX-2-pro',
      prompt: 'Reference image 1 is Afei. Draw Afei in a workshop.',
      width: 1024,
      height: 1024,
      referenceImages: [ref('a', 'aaa'), ref('b', 'bbb')],
    });

    expect(body.input_image).toBe('aaa');
    expect(body.input_image_2).toBe('bbb');
  });

  it('posts to DeepInfra images endpoint and normalizes b64 response', async () => {
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(JSON.stringify({ data: [{ b64_json: 'result' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deepInfraFluxProvider.generateImage({
      panelId: 'panel-1',
      prompt: 'Afei',
      width: 1024,
      height: 1024,
      referenceImages: [ref('a', 'aaa')],
      providerConfig: {
        providerId: 'deepinfra-flux',
        baseUrl: 'https://api.deepinfra.com/v1/openai',
        apiKey: 'key',
        model: 'black-forest-labs/FLUX-2-pro',
      },
    });

    expect(result.url).toBe('data:image/png;base64,result');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/deepinfra-flux-provider.test.ts
```

Expected: FAIL because provider does not exist.

- [ ] **Step 3: Add provider types**

In `src/types/index.ts`:

```ts
export type ImageProviderId = 'comfyui' | 'openai-compatible-image' | 'deepinfra-flux';

export interface DeepInfraFluxImageProviderConfig {
  providerId: 'deepinfra-flux';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type ImageProviderConfig =
  | ComfyUIImageProviderConfig
  | OpenAICompatibleImageProviderConfig
  | DeepInfraFluxImageProviderConfig;
```

- [ ] **Step 4: Implement DeepInfra provider**

Create `src/lib/comic/deepinfra-flux-provider.ts`:

```ts
import type { DeepInfraFluxImageProviderConfig, ImageProviderConfig, MediaAsset } from '../../types';
import { normalizeOpenAIImageResponse } from './openai-image-provider';
import type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from './providers';

interface BuildDeepInfraFluxRequestInput {
  model: string;
  prompt: string;
  width: number;
  height: number;
  referenceImages?: MediaAsset[];
}

export function buildDeepInfraFluxRequest(input: BuildDeepInfraFluxRequestInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    size: `${input.width}x${input.height}`,
    n: 1,
    response_format: 'b64_json',
  };
  input.referenceImages?.slice(0, 8).forEach((asset, index) => {
    const key = index === 0 ? 'input_image' : `input_image_${index + 1}`;
    body[key] = stripDataUriPrefix(asset.url ?? '');
  });
  return body;
}

function stripDataUriPrefix(value: string): string {
  return value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

export const deepInfraFluxProvider: ImageGenerationProvider = {
  id: 'deepinfra-flux',
  label: 'DeepInfra FLUX-2 Pro',
  kind: 'online',
  capabilities: {
    negativePrompt: false,
    seed: false,
    referenceImages: true,
    referenceMode: 'multi-reference',
    maxReferenceImages: 8,
    batch: false,
    polling: false,
    outputFormats: ['png', 'jpg', 'webp'],
    freeformSize: false,
  },
  async validateConfig(config: ImageProviderConfig) {
    if (config.providerId !== 'deepinfra-flux') return { ok: false, message: 'Provider 設定類型不符' };
    if (!config.baseUrl.trim()) return { ok: false, message: '缺少 DeepInfra Base URL' };
    if (!config.apiKey.trim()) return { ok: false, message: '缺少 DeepInfra API Key' };
    if (!config.model.trim()) return { ok: false, message: '缺少 Model' };
    return { ok: true, message: '設定可用' };
  },
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const config = request.providerConfig as DeepInfraFluxImageProviderConfig;
    if (config.providerId !== 'deepinfra-flux') throw new Error('Provider 設定類型不符');
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(buildDeepInfraFluxRequest({
        model: config.model,
        prompt: request.prompt,
        width: request.width,
        height: request.height,
        referenceImages: request.referenceImages,
      })),
    });
    if (!response.ok) throw new Error(`DeepInfra FLUX error ${response.status}: ${await response.text()}`);
    const normalized = normalizeOpenAIImageResponse(await response.json());
    return {
      ...normalized,
      providerId: this.id,
      generationParamsJson: JSON.stringify({
        model: config.model,
        width: request.width,
        height: request.height,
        referenceImageCount: request.referenceImages?.length ?? 0,
      }),
    };
  },
};
```

- [ ] **Step 5: Register provider**

In `src/lib/comic/providers.ts`:

```ts
import { deepInfraFluxProvider } from './deepinfra-flux-provider';

const PROVIDERS: ImageGenerationProvider[] = [
  comfyUIProvider,
  openAICompatibleImageProvider,
  deepInfraFluxProvider,
];
```

- [ ] **Step 6: Add settings defaults**

In `src/stores/settingsStore.ts`, extend `ImageGenerationPrefs`:

```ts
deepinfraFlux: {
  baseUrl: string;
  apiKey: string;
  model: string;
};
```

Default:

```ts
deepinfraFlux: {
  baseUrl: 'https://api.deepinfra.com/v1/openai',
  apiKey: '',
  model: 'black-forest-labs/FLUX-2-pro',
},
```

Merge:

```ts
deepinfraFlux: {
  ...DEFAULT_IMAGE_GENERATION_PREFS.deepinfraFlux,
  ...(p.imageGenerationPrefs?.deepinfraFlux ?? {}),
},
```

- [ ] **Step 7: Wire provider config UI**

In `src/components/Toolbar.tsx`, add DeepInfra option to image provider settings select:

```tsx
<option value="deepinfra-flux">DeepInfra FLUX-2 Pro</option>
```

When selected, show base URL, API key, model inputs bound to `imageGenerationPrefs.deepinfraFlux`.

In `ComicModal.providerConfig()`, add:

```ts
if (imageGenerationPrefs.providerId === 'deepinfra-flux') {
  return {
    providerId: 'deepinfra-flux',
    ...imageGenerationPrefs.deepinfraFlux,
  };
}
```

- [ ] **Step 8: Run tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/comic/deepinfra-flux-provider.test.ts src/lib/comic/providers.test.ts
.\node_modules\.bin\tsc.cmd -b
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/types/index.ts src/stores/settingsStore.ts src/lib/comic/providers.ts src/lib/comic/deepinfra-flux-provider.ts src/lib/comic/deepinfra-flux-provider.test.ts src/components/Toolbar.tsx
git commit -m "Add DeepInfra FLUX image provider"
```

---

### Task 6: Documentation Sync

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `specs/roadmap.md`
- Modify: `modules/10-multimedia.md`
- Modify: `docs/superpowers/specs/2026-05-29-phase-6-visual-bible-design.md`

- [ ] **Step 1: Update roadmap**

In `specs/roadmap.md`, update Phase 6 item 8 from partial Visual Bible wording to:

```md
8. 🟡 **Visual Bible-lite / Prompt Composer**：角色視覺 prompt 與角色 reference 圖沿用 `Character`；場景視覺設定新增 `SceneVisual` project-level store；Prompt Composer 已可注入 active characters + active scene + reference assets；完整 Visual Bible entry/snapshot migration 仍屬 Advanced polish。
```

- [ ] **Step 2: Update multimedia module**

In `modules/10-multimedia.md`, add under provider support:

```md
- **DeepInfra FLUX-2 Pro**：新增 provider-specific adapter，支援 `input_image` / `input_image_2...` reference images；角色圖與場景圖會先解析為 `MediaAsset[]`，再依 capability 傳入 provider。
```

- [ ] **Step 3: Update Visual Bible design note**

At top of `docs/superpowers/specs/2026-05-29-phase-6-visual-bible-design.md`, add:

```md
> 2026-05-30 implementation note: current MVP uses a Visual Bible-lite path. Character visual prompt/reference images remain on `Character` for compatibility, while project-level `SceneVisual` covers reusable scenes. Full `VisualBibleEntry` migration remains planned but not required for the current reference-image/scene MVP.
```

- [ ] **Step 4: Update changelog**

Add new top entry to `docs/CHANGELOG.md`:

```md
## 2026-05-30 — Phase 6 Reference Images / Scene Visuals Plan

- Planned Visual Bible-lite implementation based on current code reality rather than older design docs.
- Character reference images will flow from `Character.referenceAssetIds` into image provider requests.
- Added project-level `SceneVisual` direction for reusable scene prompts and scene reference images.
- Planned DeepInfra FLUX-2-pro provider-specific adapter for `input_image` / multi-reference support.
```

- [ ] **Step 5: Run docs check**

Run:

```powershell
rg -n "Visual Bible-lite|SceneVisual|DeepInfra FLUX" docs specs modules
git diff --check
```

Expected: `rg` finds the new notes and `git diff --check` reports no whitespace errors.

- [ ] **Step 6: Commit**

```powershell
git add docs/CHANGELOG.md specs/roadmap.md modules/10-multimedia.md docs/superpowers/specs/2026-05-29-phase-6-visual-bible-design.md
git commit -m "Document reference image and scene visual plan"
```

---

## Verification Before Completion

- [ ] Run unit tests:

```powershell
.\node_modules\.bin\vitest.cmd run
```

Expected: all tests pass.

- [ ] Run typecheck:

```powershell
.\node_modules\.bin\tsc.cmd -b
```

Expected: no TypeScript errors.

- [ ] Run focused lint:

```powershell
.\node_modules\.bin\eslint.cmd src/lib/comic src/lib/scene-visuals.ts src/lib/scene-visuals.test.ts src/components/comic/ComicModal.tsx src/stores/settingsStore.ts src/types/index.ts
```

Expected: no lint errors in touched source files.

- [ ] Run production build:

```powershell
.\node_modules\.bin\vite.cmd build
```

Expected: build passes; existing chunk-size warning is acceptable.

---

## Self-Review

**Spec coverage:** This plan covers character reference image flow, scene visual planning, provider capability, DeepInfra FLUX-2-pro adapter, and docs sync.

**Scope check:** Full Visual Bible entry migration, snapshot version comparison, ComfyUI IP-Adapter workflow helper, and scene reference image upload UI beyond metadata are intentionally left for Advanced polish.

**Type consistency:** The plan uses `SceneVisual`, `sceneSlug`, `referenceImages`, `referenceMode`, and `deepinfra-flux` consistently across types, storage, prompt composer, providers, UI, and docs.
