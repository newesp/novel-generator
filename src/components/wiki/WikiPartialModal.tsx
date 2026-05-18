import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import type { Chapter } from '../../types';

export interface PartialAction {
  label: string;
  onClick: () => void;
}

interface Props {
  chapter: Chapter;
  actions: PartialAction[];
  onClose: () => void;
}

export function WikiPartialModal({ chapter, actions, onClose }: Props) {
  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`「${chapter.title}」Wiki 處理`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary, #888)', marginBottom: 8 }}>
          status: {chapter.wikiSyncStatus}
        </div>
        {actions.map((a) => (
          <Button key={a.label} variant="secondary" onClick={a.onClick}>
            {a.label}
          </Button>
        ))}
      </div>
    </Modal>
  );
}
