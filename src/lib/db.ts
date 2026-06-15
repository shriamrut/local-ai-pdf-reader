import Dexie, { type EntityTable } from 'dexie';

export interface LocalPDF {
  id?: number;
  hash: string;
  name: string;
  data: ArrayBuffer;
  addedAt: number;
  lastOpenedAt: number;
  lastPage: number;
  summary?: string;
  totalPages?: number;
}

export interface StoredMessage {
  id?: number;
  pdfId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface VisualHighlight {
  id?: number;
  pdfId: number;
  pageNumber: number;
  text?: string;
  rects: { x: number; y: number; width: number; height: number }[];
  color: string;
}

export interface StickyNote {
  id?: number;
  pdfId: number;
  pageNumber: number;
  x: number;
  y: number;
  text: string;
  createdAt: number;
}

const db = new Dexie('LAIPRDatabase') as Dexie & {
  pdfs: EntityTable<LocalPDF, 'id'>;
  messages: EntityTable<StoredMessage, 'id'>;
  stickyNotes: EntityTable<StickyNote, 'id'>;
  visualHighlights: EntityTable<VisualHighlight, 'id'>;
};

db.version(1).stores({
  pdfs: '++id, hash, addedAt, lastOpenedAt',
  messages: '++id, pdfId, timestamp',
  highlights: '++id, pdfId, pageNumber',
  stickyNotes: '++id, pdfId, pageNumber'
});

db.version(2).stores({
  pdfs: '++id, hash, addedAt, lastOpenedAt',
  messages: '++id, pdfId, timestamp',
  highlights: null,
  stickyNotes: '++id, pdfId, pageNumber'
});

db.version(3).stores({
  pdfs: '++id, hash, addedAt, lastOpenedAt',
  messages: '++id, pdfId, timestamp',
  stickyNotes: '++id, pdfId, pageNumber',
  visualHighlights: '++id, pdfId, pageNumber'
});

export { db };
