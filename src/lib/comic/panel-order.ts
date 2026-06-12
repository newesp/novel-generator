export interface OrderedPanel {
  id: string;
  order: number;
}

export function reindexPanels<T extends OrderedPanel>(panels: T[]): T[] {
  return panels.map((panel, index) => ({ ...panel, order: index + 1 }));
}

export function movePanelById<T extends OrderedPanel>(panels: T[], panelId: string, targetPanelId: string): T[] {
  if (panelId === targetPanelId) return reindexPanels(panels);

  const fromIndex = panels.findIndex((panel) => panel.id === panelId);
  const toIndex = panels.findIndex((panel) => panel.id === targetPanelId);
  if (fromIndex < 0 || toIndex < 0) return reindexPanels(panels);

  const nextPanels = [...panels];
  const [movedPanel] = nextPanels.splice(fromIndex, 1);
  nextPanels.splice(toIndex, 0, movedPanel);
  return reindexPanels(nextPanels);
}

export function removePanelById<T extends OrderedPanel>(panels: T[], panelId: string): T[] {
  return reindexPanels(panels.filter((panel) => panel.id !== panelId));
}
