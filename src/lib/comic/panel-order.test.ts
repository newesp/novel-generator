import { describe, expect, it } from 'vitest';
import { movePanelById, removePanelById, reindexPanels } from './panel-order';

const panels = [
  { id: 'a', order: 1 },
  { id: 'b', order: 2 },
  { id: 'c', order: 3 },
];

describe('panel-order', () => {
  it('reindexes panels from one', () => {
    expect(reindexPanels([{ id: 'a', order: 7 }, { id: 'b', order: 11 }])).toEqual([
      { id: 'a', order: 1 },
      { id: 'b', order: 2 },
    ]);
  });

  it('moves a panel before the target panel and reindexes order', () => {
    expect(movePanelById(panels, 'c', 'a')).toEqual([
      { id: 'c', order: 1 },
      { id: 'a', order: 2 },
      { id: 'b', order: 3 },
    ]);
  });

  it('removes a panel and reindexes remaining panels', () => {
    expect(removePanelById(panels, 'b')).toEqual([
      { id: 'a', order: 1 },
      { id: 'c', order: 2 },
    ]);
  });
});
