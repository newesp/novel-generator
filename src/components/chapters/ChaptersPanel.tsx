import { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { generateChapterDrafts, type ExistingChapterSummary } from '../../lib/ai-tasks';
import { isLLMReady } from '../../lib/llm';
import { formatCharacters } from '../../lib/context-budget';

export function ChaptersPanel() {
  const { project, chapters, characters, loadChapters, createChapter, updateChapter, deleteChapter, reorderChapters } = useProjectStore();
  const { selectedChapterId, setSelectedChapterId } = useUIStore();
  const { llmConfig } = useSettingsStore();
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiCount, setAiCount] = useState<number | ''>(5);
  const [isGenerating, setIsGenerating] = useState(false);

  // —— 多選刪除 ——
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());

  // —— Drag-and-drop ——
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  /** 'before' = 拖到目標上半部 → 插入到目標前面；'after' = 拖到下半部 → 插入到後面 */
  const [dropPosition, setDropPosition] = useState<'before' | 'after'>('before');

  useEffect(() => {
    if (project) loadChapters(project.id);
  }, [project?.id]);

  // 章節列表變更時，清掉已不存在的 id 在選取集裡的殘留
  useEffect(() => {
    setSelectedForDelete((prev) => {
      const valid = new Set(chapters.map((c) => c.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [chapters]);

  if (!project) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
        請先建立專案
      </div>
    );
  }

  const apiReady = isLLMReady(llmConfig);
  const outlineReady = !!(project.worldSetting || project.mainPlot);

  const handleNewChapter = async () => {
    // 編號由 UI 從 order 自動推導，title 只放主題（保留空白讓用戶輸入）
    const id = await createChapter(project.id, '新章節');
    setSelectedChapterId(id);
  };

  const handleAIGenerate = async () => {
    setIsGenerating(true);
    try {
      const existingChapters: ExistingChapterSummary[] = chapters.map((c, i) => ({
        index: i + 1,
        title: c.title,
        beat: c.beat,
        points: c.points,
      }));
      const drafts = await generateChapterDrafts({
        count: typeof aiCount === 'number' ? aiCount : 1,
        worldSetting: project.worldSetting,
        mainPlot: project.mainPlot,
        existingChapters,
        charactersList: formatCharacters(characters),
      });

      if (drafts.length === 0) {
        alert('AI 未產出任何章節，請檢查 LLM 是否回傳預期格式');
        return;
      }

      let firstId: string | undefined;
      for (const draft of drafts) {
        const id = await createChapter(project.id, draft.title);
        await updateChapter(id, { beat: draft.beat, points: draft.points });
        if (!firstId) firstId = id;
      }
      if (firstId) setSelectedChapterId(firstId);
      setShowAIModal(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  // —— 多選 ——
  const toggleSelect = (id: string) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = chapters.length > 0 && selectedForDelete.size === chapters.length;
  const someSelected = selectedForDelete.size > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedForDelete(new Set());
    else setSelectedForDelete(new Set(chapters.map((c) => c.id)));
  };

  const handleDeleteSelected = async () => {
    if (selectedForDelete.size === 0) return;
    if (!confirm(`刪除選取的 ${selectedForDelete.size} 個章節？\n相關正文與版本歷史將一併移除，此操作不可復原。`)) return;
    for (const id of selectedForDelete) {
      await deleteChapter(id);
      if (selectedChapterId === id) setSelectedChapterId(null);
    }
    setSelectedForDelete(new Set());
  };

  // —— Drag and drop ——
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox 需要 setData 才會觸發拖曳
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // 依滑鼠在目標中的 y 位置判斷上半/下半
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const pos: 'before' | 'after' = offsetY < rect.height / 2 ? 'before' : 'after';

    if (targetId !== dragOverId || pos !== dropPosition) {
      setDragOverId(targetId);
      setDropPosition(pos);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // 只在真的離開卡片（而非進入子元素）時清除
    if (e.currentTarget === e.target) {
      // 不立即清除，避免閃爍；交由 dragend 處理
    }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = chapters.findIndex((c) => c.id === draggedId);
    let toIdx = chapters.findIndex((c) => c.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;

    // 重排序
    const arr = [...chapters];
    const [moved] = arr.splice(fromIdx, 1);
    // splice 之後 toIdx 可能要調整：若原本在前面被移除了，toIdx 要 -1
    if (fromIdx < toIdx) toIdx -= 1;
    const insertAt = dropPosition === 'after' ? toIdx + 1 : toIdx;
    arr.splice(insertAt, 0, moved);

    setDraggedId(null);
    setDragOverId(null);
    await reorderChapters(arr.map((c) => c.id));
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="tab-panel">
      <div className="section">
        <Button
          variant="primary"
          style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
          onClick={() => setShowAIModal(true)}
          disabled={!apiReady || !outlineReady}
          title={
            !apiReady ? '請先設定 API'
            : !outlineReady ? '請先在大綱頁填寫世界觀或主線劇情'
            : ''
          }
        >
          ✨ AI 生成章節
        </Button>
        <Button
          variant="secondary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={handleNewChapter}
        >
          ➕ 新增章節
        </Button>
      </div>

      <div className="section">
        <div className="section-title chapter-list-header">
          <span>章節列表（{chapters.length}）</span>
          {chapters.length > 0 && (
            <label className="select-all-label" title="全選 / 取消全選">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleSelectAll}
              />
              <span>全選</span>
            </label>
          )}
        </div>

        {selectedForDelete.size > 0 && (
          <div className="bulk-actions">
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              已選 {selectedForDelete.size} 項
            </span>
            <div style={{ flex: 1 }} />
            <Button
              variant="text"
              style={{ height: 26, fontSize: 12, padding: '0 8px' }}
              onClick={() => setSelectedForDelete(new Set())}
            >
              取消選取
            </Button>
            <Button
              variant="secondary"
              style={{ height: 26, fontSize: 12, padding: '0 10px', color: '#f87171', borderColor: '#7f1d1d' }}
              onClick={handleDeleteSelected}
            >
              🗑 刪除 {selectedForDelete.size} 項
            </Button>
          </div>
        )}

        {chapters.map((ch, i) => {
          const isDragged = draggedId === ch.id;
          const isDragOver = dragOverId === ch.id && draggedId !== ch.id;
          const cls = [
            'chapter-item',
            'chapter-item-with-num',
            selectedChapterId === ch.id ? 'active' : '',
            isDragged ? 'dragging' : '',
            isDragOver ? `drag-over drag-over-${dropPosition}` : '',
          ].filter(Boolean).join(' ');
          return (
            <div
              key={ch.id}
              className={cls}
              draggable
              onDragStart={(e) => handleDragStart(e, ch.id)}
              onDragOver={(e) => handleDragOver(e, ch.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, ch.id)}
              onDragEnd={handleDragEnd}
              onClick={() => setSelectedChapterId(ch.id)}
            >
              <div
                className="chapter-select-box"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                draggable={false}
              >
                <input
                  type="checkbox"
                  checked={selectedForDelete.has(ch.id)}
                  onChange={() => toggleSelect(ch.id)}
                />
              </div>
              <div className="chapter-num" aria-label={`第 ${i + 1} 章`}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="chapter-item-body">
                <div className="chapter-item-title">{ch.title || '(未命名)'}</div>
                <div className="chapter-item-meta">
                  <span>{ch.content ? `約 ${ch.content.length} 字` : '待生成'}</span>
                  {ch.beat && <span className="badge badge-gray">{ch.beat.split(' ')[0]}</span>}
                  {!ch.wikiSyncedAt && ch.content && (
                    <span className="badge badge-warn">⚠️ 未存入</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {chapters.length === 0 && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '8px 0' }}>
            尚未建立章節，使用上方按鈕新增或讓 AI 生成
          </div>
        )}
      </div>

      <Modal
        open={showAIModal}
        onClose={() => !isGenerating && setShowAIModal(false)}
        title="✨ AI 生成章節"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAIModal(false)} disabled={isGenerating}>
              取消
            </Button>
            <Button variant="primary" onClick={handleAIGenerate} disabled={isGenerating || typeof aiCount !== 'number' || aiCount < 1}>
              {isGenerating ? '生成中...' : `生成 ${aiCount} 章`}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
          AI 將根據目前的世界觀與主線劇情，自動規劃章節並填入：標題、故事節拍、章節要點。
          {chapters.length > 0 && (
            <><br /><span style={{ color: 'var(--accent)' }}>✦ 接續模式</span>：已偵測到 {chapters.length} 個現有章節，AI 將從第 {chapters.length + 1} 章起接續生成。</>
          )}
          <br />
          （正文仍需在編輯器中個別點擊「生成本章」）
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13 }}>章節數量：</label>
          <input
            type="number"
            className="form-input"
            min={1}
            max={20}
            value={aiCount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') { setAiCount(''); return; }
              const n = parseInt(v, 10);
              if (!isNaN(n)) setAiCount(Math.min(20, n));
            }}
            onBlur={() => {
              const n = typeof aiCount === 'number' ? aiCount : parseInt(String(aiCount), 10);
              setAiCount(isNaN(n) ? 1 : Math.max(1, Math.min(20, n)));
            }}
            style={{ width: 80 }}
            disabled={isGenerating}
          />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>（建議 3 - 10 章）</span>
        </div>
      </Modal>
    </div>
  );
}
