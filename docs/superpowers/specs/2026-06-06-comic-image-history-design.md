# Comic Image History Design

## Goal

Add a version history for comic image generation so each panel can keep every generated image, let the user select one image as the current panel image, and safely delete old rejected images.

This design follows the static UI mockup and user feedback from June 6, 2026.

## Decisions

- `ComicPanel.assetId` remains the current selected image for the panel.
- A new `ComicPanelImageVariant` record stores each generation attempt/result.
- Regenerating a single panel keeps history and creates a new variant.
- Batch image generation creates new variants and makes successful new images current.
- Regenerating storyboard deletes old panels, old panel variants, and their generated comic panel image assets.
- Reference image picker initially continues to list only each panel's current selected image, not all historical variants.
- Current selected variants cannot be deleted in MVP. The user must first select another variant.
- Excluded for MVP: A/B comparison, rating, automatic best-image selection, batch delete, history diff.

## Data Model

```ts
export type ComicPanelImageVariantStatus = 'ready' | 'failed';

export interface ComicPanelImageVariant {
  id: string;
  projectId: string;
  chapterId: string;
  comicId: string;
  panelId: string;
  assetId?: string;
  status: ComicPanelImageVariantStatus;
  providerId: string;
  promptSnapshot: string;
  negativePromptSnapshot?: string;
  referenceAssetIds: string[];
  referenceImageLabels: string[];
  seed?: number;
  generationParamsJson?: string;
  errorMessage?: string;
  createdAt: number;
}
```

`MediaAsset` remains the image body/metadata store. `ComicPanelImageVariant` stores why and how that image was generated.

## Storage

Add `comicPanelImageVariants` to both adapters.

Dexie:

- Add DB version `8`.
- Indexes: `id, projectId, chapterId, comicId, panelId, createdAt, status`.

SQLite:

- Add migration `006_comic_panel_image_variants.sql`.
- Table columns: `id`, `project_id`, `chapter_id`, `comic_id`, `panel_id`, `asset_id`, `status`, `created_at`, `data`.
- Store the full variant JSON in `data`, consistent with `comic_panels`.

Backup/import:

- Add `comicPanelImageVariants?: ComicPanelImageVariant[]`.
- `replaceAll` clears and restores variants with the rest of comic media metadata.

## Generation Flow

### Single Panel Regeneration

1. Prepare prompt and references.
2. Generate image.
3. Create `MediaAsset`.
4. Create `ComicPanelImageVariant` with status `ready`.
5. Update `ComicPanel.assetId` to the new asset.
6. Keep previous variants and previous assets.

On failure, create a failed variant only if prompt preparation completed. Store prompt snapshots and error message.

### Batch Generation

Same as single panel regeneration, per panel. Each successful image creates a variant and becomes current.

### Storyboard Regeneration

Before deleting old panels:

1. Load old panel IDs for the current comic.
2. Load variants for those panels or comic.
3. Delete variant assets.
4. Delete variants.
5. Delete old current `panel.assetId` assets not already deleted.
6. Delete old panels.
7. Create new panels.

## UI

### Full-Screen Comic Modal

The comic modal becomes a full-screen work area:

- Left: chapter dropdown and panel list.
- Center: selected/current panel editor.
- Right: shared selectors for characters, reference images, and scene visuals.
- Footer: separated batch/destructive actions.

### Panel Image History

Each panel shows:

- Current selected image.
- History count.
- Collapsible or modal history grid.
- Variant thumbnail.
- Provider/model and creation time.
- Icon button to set as current.
- Icon button to delete.
- Hover titles in Chinese.

Deleting a current selected variant is blocked in MVP.

### Prompt Expansion

All panel prompt fields receive an expand button:

- Visual prompt.
- Negative prompt.
- Extra groups JSON.
- Final prompt snapshot as read-only.

Expanded editing opens a large modal/overlay with cancel/apply controls.

### Selectors

Characters, reference images, and scene visuals use dropdown picker UI:

- Character options show a thumbnail from the first character reference image.
- Scene options show a thumbnail from the first scene reference image.
- Reference image options show generated panel thumbnails.
- A shared search input filters all three selector groups.

Reference image picker lists current panel images only for MVP.

### Scene Visual Settings

Scene visual cards/list support delete:

- If no panels use the scene, delete immediately after confirmation.
- If panels use the scene, confirmation clears those panels' `sceneSlug` then deletes the scene.
- Scene reference assets are deleted only when not referenced elsewhere.

## Button Placement

To reduce accidental clicks:

- `重生此格` stays inside the panel card.
- `開始生圖` is in a batch generation area.
- `重新生成分鏡` is separated as a destructive storyboard management action and requires confirmation.

## Testing

Required tests:

- Creating a ready variant from a generated image.
- Regenerating one panel keeps existing variants.
- Selecting a variant updates `ComicPanel.assetId`.
- Deleting a non-current variant deletes its asset and variant row.
- Deleting current variant is blocked.
- Regenerating storyboard deletes old panel variants and generated assets.
- Reference picker still uses only current `ComicPanel.assetId`.
- Scene deletion clears panel `sceneSlug`.
- Thumbnail helper selects first reference asset.

## Implementation Order

1. Storage/types for `ComicPanelImageVariant`.
2. Variant helper functions and tests.
3. Generation flow integration.
4. History UI.
5. Full-screen modal and selector UI.
6. Scene deletion.
7. Prompt expansion.
8. Docs/changelog update.
