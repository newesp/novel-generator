import type { ComicPanel } from '../../types';

type PanelPatch = Partial<ComicPanel>;
type PersistPanelPatch = (panelId: string, patch: PanelPatch) => Promise<void>;

export function createPanelWriteQueue(persist: PersistPanelPatch) {
  const pending = new Map<string, Promise<void>>();

  return {
    enqueue(panelId: string, patch: PanelPatch): Promise<void> {
      const previous = pending.get(panelId);
      const current = previous
        ? previous.catch(() => undefined).then(() => persist(panelId, patch))
        : persist(panelId, patch);
      pending.set(panelId, current);
      void current
        .finally(() => {
          if (pending.get(panelId) === current) pending.delete(panelId);
        })
        .catch(() => undefined);
      return current;
    },
  };
}
