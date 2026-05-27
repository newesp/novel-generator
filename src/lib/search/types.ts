export type SearchScope = 'chapter' | 'wikiPage' | 'both';

export interface SearchOptions {
  /** 預設 'both' */
  scope?: SearchScope;
  /** 預設 50 */
  limit?: number;
}

export interface SearchHit {
  scope: 'chapter' | 'wikiPage';
  id: string;
  /** 章節為章節 title；wiki 頁為 "type/slug — 顯示 title" */
  title: string;
  /** FTS snippet() 結果，含 <<<...>>> 標記 */
  snippet: string;
  /** bm25() 分數，越小越相關 */
  score: number;
  /** 章節 only：order_idx，方便顯示「第 N 章」 */
  chapterOrder?: number;
}

export interface SearchStore {
  search(bookId: string, query: string, opts?: SearchOptions): Promise<SearchHit[]>;
}
