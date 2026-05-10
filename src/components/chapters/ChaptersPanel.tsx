import { useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Button } from '../common/Button';

export function ChaptersPanel() {
  const { project, chapters, loadChapters, createChapter } = useProjectStore();
  const { selectedChapterId, setSelectedChapterId } = useUIStore();

  useEffect(() => {
    if (project) loadChapters(project.id);
  }, [project?.id]);

  if (!project) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
        請先建立專案
      </div>
    );
  }

  const handleNewChapter = async () => {
    const title = `第 ${chapters.length + 1} 章`;
    const id = await createChapter(project.id, title);
    setSelectedChapterId(id);
  };

  return (
    <div className="tab-panel">
      <div className="section">
        <Button
          variant="primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={handleNewChapter}
        >
          ➕ 新增章節
        </Button>
      </div>

      <div className="section">
        <div className="section-title">章節列表（{chapters.length}）</div>
        {chapters.map((ch) => (
          <div
            key={ch.id}
            className={`chapter-item${selectedChapterId === ch.id ? ' active' : ''}`}
            onClick={() => setSelectedChapterId(ch.id)}
          >
            <div className="chapter-item-title">{ch.title}</div>
            <div className="chapter-item-meta">
              <span>{ch.content ? `約 ${ch.content.length} 字` : '待生成'}</span>
              {ch.beat && <span className="badge badge-gray">{ch.beat.split(' ')[0]}</span>}
              {!ch.wikiSyncedAt && ch.content && (
                <span className="badge badge-warn">⚠️ 未存入</span>
              )}
            </div>
          </div>
        ))}
        {chapters.length === 0 && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '8px 0' }}>
            尚未建立章節，點擊上方按鈕新增
          </div>
        )}
      </div>
    </div>
  );
}
