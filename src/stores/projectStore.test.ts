import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore, normalizeProjectLanguage } from './projectStore';
import { useSettingsStore } from './settingsStore';
import { importSnapshot, type BackupSnapshot } from '../lib/backup';
import type { Project } from '../types';

const projectsMap = new Map<string, Project>();

vi.mock('../lib/storage', () => ({
  storage: {
    projects: {
      listAllByUpdatedDesc: vi.fn(async () => Array.from(projectsMap.values())),
      get: vi.fn(async (id: string) => projectsMap.get(id)),
      add: vi.fn(async (project: Project) => { projectsMap.set(project.id, project); }),
      update: vi.fn(async (id: string, patch: Partial<Project>) => {
        const existing = projectsMap.get(id);
        if (existing) {
          projectsMap.set(id, { ...existing, ...patch });
        }
      }),
      delete: vi.fn(async (id: string) => { projectsMap.delete(id); }),
    },
    chapters: {
      listByProject: vi.fn(async () => []),
      deleteByProject: vi.fn(async () => {}),
    },
    versions: { deleteByChapters: vi.fn(async () => {}) },
    characters: { deleteByProject: vi.fn(async () => {}) },
    wikiPages: { deleteByBook: vi.fn(async () => {}) },
    wikiLog: { deleteByBook: vi.fn(async () => {}) },
    comics: { listAll: vi.fn(async () => []), deleteByProject: vi.fn(async () => {}) },
    comicPanels: { deleteByComic: vi.fn(async () => {}) },
    mediaAssets: { deleteByProject: vi.fn(async () => {}) },
    sceneVisuals: { deleteByProject: vi.fn(async () => {}) },
    replaceAll: vi.fn(async (bundle: { projects?: Project[] }) => {
      projectsMap.clear();
      for (const p of bundle.projects ?? []) projectsMap.set(p.id, p);
    }),
  },
}));

describe('Immutable Book Writing Language (Ticket #17)', () => {
  beforeEach(async () => {
    projectsMap.clear();
    useSettingsStore.setState({
      generalPrefs: {
        interfaceLocale: 'zh-TW',
        defaultWritingLanguage: 'zh-Hant',
      },
    });
  });

  describe('normalizeProjectLanguage', () => {
    it('normalizes missing or legacy project writingLanguage to zh-Hant', () => {
      const legacyProject = {
        id: 'p1',
        title: '舊作品',
        genre: '玄幻',
        style: '熱血',
        worldSetting: '',
        mainPlot: '',
        chapterOutline: '',
        createdAt: 1000,
        updatedAt: 1000,
      } as unknown as Project;

      const normalized = normalizeProjectLanguage(legacyProject);
      expect(normalized.writingLanguage).toBe('zh-Hant');
    });

    it('preserves explicit English writingLanguage', () => {
      const englishProject = {
        id: 'p2',
        title: 'English Book',
        genre: 'Sci-Fi',
        style: 'Dark',
        worldSetting: '',
        mainPlot: '',
        chapterOutline: '',
        writingLanguage: 'en',
        createdAt: 1000,
        updatedAt: 1000,
      } as Project;

      const normalized = normalizeProjectLanguage(englishProject);
      expect(normalized.writingLanguage).toBe('en');
    });
  });

  describe('ProjectStore Writing Language Lifetime', () => {
    it('prefills writingLanguage from generalPrefs.defaultWritingLanguage on creation', async () => {
      useSettingsStore.setState({
        generalPrefs: {
          interfaceLocale: 'en',
          defaultWritingLanguage: 'en',
        },
      });

      const store = useProjectStore.getState();
      const id = await store.createProject({
        title: 'Auto English Book',
        genre: '',
        style: '',
        worldSetting: '',
        mainPlot: '',
        chapterOutline: '',
      });

      await store.loadProject(id);
      expect(useProjectStore.getState().project?.writingLanguage).toBe('en');
    });

    it('allows overriding default writingLanguage before book creation', async () => {
      useSettingsStore.setState({
        generalPrefs: {
          interfaceLocale: 'zh-TW',
          defaultWritingLanguage: 'zh-Hant',
        },
      });

      const store = useProjectStore.getState();
      const id = await store.createProject({
        title: 'Explicit English Book',
        genre: '',
        style: '',
        worldSetting: '',
        mainPlot: '',
        chapterOutline: '',
        writingLanguage: 'en',
      });

      await store.loadProject(id);
      expect(useProjectStore.getState().project?.writingLanguage).toBe('en');
    });

    it('locks writingLanguage and ignores updateProject mutation attempts', async () => {
      const store = useProjectStore.getState();
      const id = await store.createProject({
        title: 'Immutable Language Book',
        genre: '',
        style: '',
        worldSetting: '',
        mainPlot: '',
        chapterOutline: '',
        writingLanguage: 'en',
      });

      // Attempt to overwrite writingLanguage via updateProject
      await store.updateProject(id, {
        title: 'Updated Title',
        writingLanguage: 'zh-Hant' as any,
      });

      await store.loadProject(id);
      const project = useProjectStore.getState().project;
      expect(project?.title).toBe('Updated Title');
      expect(project?.writingLanguage).toBe('en'); // Remains 'en'
    });
  });

  describe('Backup Round Trip & Normalization', () => {
    it('normalizes legacy projects without writingLanguage during snapshot import', async () => {
      const mockSnapshot: BackupSnapshot = {
        schema: 2,
        exportedAt: Date.now(),
        app: 'novel-generator',
        projects: [
          {
            id: 'legacy-p1',
            title: '舊備份小說',
            genre: '仙俠',
            style: '輕鬆',
            worldSetting: '',
            mainPlot: '',
            chapterOutline: '',
            createdAt: 5000,
            updatedAt: 5000,
          } as unknown as Project,
        ],
        chapters: [],
        versions: [],
        characters: [],
      };

      await importSnapshot(mockSnapshot, 'replace');
      const loadedProject = projectsMap.get('legacy-p1');
      expect(loadedProject).toBeTruthy();
      expect(loadedProject?.writingLanguage).toBe('zh-Hant');
    });
  });
});
