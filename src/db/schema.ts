import type {DB} from '@op-engineering/op-sqlite';

const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS memory_facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, fact TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    access_count INTEGER NOT NULL DEFAULT 0, last_accessed_at TEXT)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS memory_facts_fts USING fts5(fact, content='memory_facts', content_rowid='id')`,
  `CREATE TRIGGER IF NOT EXISTS memory_facts_ai AFTER INSERT ON memory_facts BEGIN INSERT INTO memory_facts_fts(rowid, fact) VALUES (new.id, new.fact); END`,
  `CREATE TRIGGER IF NOT EXISTS memory_facts_ad AFTER DELETE ON memory_facts BEGIN INSERT INTO memory_facts_fts(memory_facts_fts, rowid, fact) VALUES('delete', old.id, old.fact); END`,
  `CREATE TABLE IF NOT EXISTS knowledge_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL,
    source TEXT, tags TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_docs_fts USING fts5(title, content, content='knowledge_documents', content_rowid='id')`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_docs_ai AFTER INSERT ON knowledge_documents BEGIN INSERT INTO knowledge_docs_fts(rowid, title, content) VALUES (new.id, new.title, new.content); END`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_docs_ad AFTER DELETE ON knowledge_documents BEGIN INSERT INTO knowledge_docs_fts(knowledge_docs_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content); END`,
  `CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, entity_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(name, entity_type))`,
  `CREATE TABLE IF NOT EXISTS entity_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, entity_id INTEGER NOT NULL REFERENCES entities(id),
    source_type TEXT NOT NULL, source_id INTEGER NOT NULL, context TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL,
    content TEXT NOT NULL, embedding BLOB, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(doc_id, chunk_index))`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(content, content='knowledge_chunks', content_rowid='id')`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ai AFTER INSERT ON knowledge_chunks BEGIN INSERT INTO knowledge_chunks_fts(rowid, content) VALUES (new.id, new.content); END`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_chunks_ad AFTER DELETE ON knowledge_chunks BEGIN INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content) VALUES('delete', old.id, old.content); END`,
  `CREATE TRIGGER IF NOT EXISTS knowledge_chunks_au AFTER UPDATE OF content ON knowledge_chunks BEGIN INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content) VALUES('delete', old.id, old.content); INSERT INTO knowledge_chunks_fts(rowid, content) VALUES (new.id, new.content); END`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(name))`,
  `CREATE TABLE IF NOT EXISTS memory_kb_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fact_id INTEGER NOT NULL REFERENCES memory_facts(id) ON DELETE CASCADE,
    doc_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(fact_id, doc_id))`,
  `CREATE TABLE IF NOT EXISTS uploaded_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    stored_path TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    doc_id INTEGER REFERENCES knowledge_documents(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_files_hash ON uploaded_files(content_hash)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS session_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id),
    role TEXT NOT NULL, content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
];

const DEFAULT_CATEGORIES = [
  'preference',
  'decision',
  'personal',
  'technical',
  'project',
  'workflow',
  'general',
];

export function initializeDatabase(db: DB) {
  db.executeSync('PRAGMA journal_mode=WAL');
  db.executeSync('PRAGMA busy_timeout=5000');
  db.executeSync('PRAGMA foreign_keys=ON');
  for (const stmt of SCHEMA_STATEMENTS) {
    db.executeSync(stmt);
  }
  for (const cat of DEFAULT_CATEGORIES) {
    db.executeSync(
      'INSERT OR IGNORE INTO categories (name) VALUES (?)',
      [cat],
    );
  }
}
