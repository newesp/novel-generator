/**
 * Auto-sync glue：監聽 projectStore，把書本變動 debounced 寫到連結資料夾。
 *
 * 流程：
 *   1. App 啟動 → initAutoSync()
 *      - 若有連結資料夾且權限仍 granted（不主動 prompt）：
 *          - 本機 DB 為空 → 從資料夾還原一次
 *          - 否則 → push 一次（確保資料夾的檔案是新的）
 *      - 訂閱 projectStore 變動 → debounced push
 *   2. 使用者按「連結資料夾」/「立刻同步」時，由 UI 直接呼叫 fs-sync 的方法
 *
 * 注意：subscribe 監聽的是 in-memory state，所以所有寫 DB 的 store action
 * 都會反映到 books / chapters / characters，這幾個都會觸發推送。
 */
import { useProjectStore } from '../stores/projectStore';
import { pushSnapshotNow, getLinkedFolderHandle, pullSnapshotNow } from './fs-sync';

let pushTimer: ReturnType<typeof setTimeout> | null = null;
const PUSH_DEBOUNCE_MS = 2000;

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    pushTimer = null;
    try {
      await pushSnapshotNow();
    } catch (err) {
      console.warn('[auto-sync] push failed:', err);
    }
  }, PUSH_DEBOUNCE_MS);
}

let initialized = false;

export async function initAutoSync(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // 先檢查資料夾連結狀態（不 prompt）
  const handle = await getLinkedFolderHandle();
  if (handle) {
    // 啟動時：若本機 books 是空的，從資料夾還原一次
    try {
      const { loadAllBooks } = useProjectStore.getState();
      await loadAllBooks();
      const empty = useProjectStore.getState().books.length === 0;
      if (empty) {
        const pulled = await pullSnapshotNow();
        if (pulled) {
          await loadAllBooks();
          console.info('[auto-sync] 從同步資料夾還原資料');
        }
      } else {
        // 本機有資料 → push 一次，覆寫資料夾的舊備份
        await pushSnapshotNow().catch((e) => console.warn('[auto-sync] initial push failed:', e));
      }
    } catch (err) {
      console.warn('[auto-sync] init failed:', err);
    }
  }

  // 訂閱 store 變動 → debounced push
  useProjectStore.subscribe((state, prev) => {
    if (
      state.books !== prev.books ||
      state.chapters !== prev.chapters ||
      state.characters !== prev.characters ||
      state.currentChapterVersions !== prev.currentChapterVersions
    ) {
      schedulePush();
    }
  });
}
