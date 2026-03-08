import {open, type DB} from '@op-engineering/op-sqlite';
import {initializeDatabase} from './schema';
import {bufferToFloat32, cosineSimilarity} from '../utils/vector-search';

let db: DB | null = null;

export function getDb(): DB {
  if (!db) {
    db = open({name: 'memory-assistant.db'});
    initializeDatabase(db);
  }
  return db;
}

// --- Memory Facts ---

export function saveFact(fact: string, category = 'general'): number {
  const result = getDb().executeSync(
    'INSERT INTO memory_facts (fact, category) VALUES (?, ?)',
    [fact, category],
  );
  return result.insertId ?? 0;
}

export interface MemoryFact {
  id: number;
  fact: string;
  category: string;
}

export function searchFacts(keyword: string): MemoryFact[] {
  const d = getDb();
  const escaped = `"${keyword.replace(/"/g, '""')}"`;

  try {
    const result = d.executeSync(
      `SELECT mf.id, mf.fact, mf.category FROM memory_facts mf
       JOIN memory_facts_fts fts ON mf.id = fts.rowid
       WHERE fts.fact MATCH ? ORDER BY rank LIMIT 20`,
      [escaped],
    );
    const facts = rowsToFacts(result.rows ?? []);
    for (const f of facts) {
      d.executeSync(
        "UPDATE memory_facts SET access_count = access_count + 1, last_accessed_at = datetime('now') WHERE id = ?",
        [f.id],
      );
    }
    return facts;
  } catch {
    const result = d.executeSync(
      "SELECT id, fact, category FROM memory_facts WHERE fact LIKE '%' || ? || '%' ORDER BY created_at DESC LIMIT 20",
      [keyword],
    );
    return rowsToFacts(result.rows ?? []);
  }
}

export function listFacts(category?: string): MemoryFact[] {
  const d = getDb();
  if (category) {
    const result = d.executeSync(
      'SELECT id, fact, category FROM memory_facts WHERE category = ? ORDER BY created_at DESC LIMIT 30',
      [category],
    );
    return rowsToFacts(result.rows ?? []);
  }
  const result = d.executeSync(
    'SELECT id, fact, category FROM memory_facts ORDER BY created_at DESC LIMIT 30',
  );
  return rowsToFacts(result.rows ?? []);
}

export function deleteFact(factId: number): boolean {
  const result = getDb().executeSync(
    'DELETE FROM memory_facts WHERE id = ?',
    [factId],
  );
  return (result.rowsAffected ?? 0) > 0;
}

// --- Categories ---

export function listCategories(): string[] {
  const result = getDb().executeSync(
    'SELECT name FROM categories ORDER BY name',
  );
  return (result.rows ?? []).map((r: any) => r.name as string);
}

export function addCategory(name: string): void {
  getDb().executeSync('INSERT INTO categories (name) VALUES (?)', [name]);
}

export function deleteCategory(name: string): boolean {
  const d = getDb();
  const countResult = d.executeSync(
    'SELECT COUNT(*) as cnt FROM memory_facts WHERE category = ?',
    [name],
  );
  const count = (countResult.rows?.[0] as any)?.cnt ?? 0;
  if (count > 0) {
    throw new Error(
      `Cannot delete category '${name}': ${count} fact(s) still use it.`,
    );
  }
  const result = d.executeSync('DELETE FROM categories WHERE name = ?', [name]);
  return (result.rowsAffected ?? 0) > 0;
}

// --- Sessions ---

export function getOrCreateSession(): string {
  const d = getDb();
  const existing = d.executeSync(
    'SELECT id FROM sessions ORDER BY last_active_at DESC LIMIT 1',
  );
  if (existing.rows && existing.rows.length > 0) {
    const id = (existing.rows[0] as any).id as string;
    d.executeSync(
      "UPDATE sessions SET last_active_at = datetime('now') WHERE id = ?",
      [id],
    );
    return id;
  }
  const id = `session-${Date.now()}`;
  d.executeSync('INSERT INTO sessions (id) VALUES (?)', [id]);
  return id;
}

export function createNewSession(): string {
  const id = `session-${Date.now()}`;
  getDb().executeSync('INSERT INTO sessions (id) VALUES (?)', [id]);
  return id;
}

export function loadHistory(
  sessionId: string,
  maxPairs = 6,
): {role: string; content: string}[] {
  const limit = maxPairs * 2;
  const result = getDb().executeSync(
    'SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?',
    [sessionId, limit],
  );
  const rows = (result.rows ?? []).map((r: any) => ({
    role: r.role as string,
    content: r.content as string,
  }));
  rows.reverse();
  return rows;
}

export function appendMessage(
  sessionId: string,
  role: string,
  content: string,
) {
  getDb().executeSync(
    'INSERT INTO session_messages (session_id, role, content) VALUES (?, ?, ?)',
    [sessionId, role, content],
  );
}

// --- Knowledge Documents ---

export function saveDocument(
  title: string,
  content: string,
  source?: string,
  tags?: string,
): number {
  const result = getDb().executeSync(
    'INSERT INTO knowledge_documents (title, content, source, tags) VALUES (?, ?, ?, ?)',
    [title, content, source ?? null, tags ?? null],
  );
  return result.insertId ?? 0;
}

export function searchDocuments(
  query: string,
): {id: number; title: string; snippet: string; source: string | null}[] {
  const d = getDb();
  try {
    const result = d.executeSync(
      `SELECT kd.id, kd.title, snippet(knowledge_docs_fts, 1, '**', '**', '...', 40), kd.source
       FROM knowledge_documents kd
       JOIN knowledge_docs_fts fts ON kd.id = fts.rowid
       WHERE knowledge_docs_fts MATCH ? ORDER BY rank LIMIT 10`,
      [query],
    );
    return (result.rows ?? []).map((r: any) => ({
      id: r['kd.id'] ?? r.id,
      title: r['kd.title'] ?? r.title,
      snippet: r['snippet(knowledge_docs_fts, 1, \'**\', \'**\', \'...\', 40)'] ?? '',
      source: r['kd.source'] ?? r.source ?? null,
    }));
  } catch {
    const result = d.executeSync(
      "SELECT id, title, substr(content, 1, 200) as snippet, source FROM knowledge_documents WHERE title LIKE '%' || ? || '%' OR content LIKE '%' || ? || '%' ORDER BY created_at DESC LIMIT 10",
      [query, query],
    );
    return (result.rows ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      snippet: r.snippet ?? '',
      source: r.source ?? null,
    }));
  }
}

export function getDocument(
  docId: number,
): {title: string; content: string; source: string | null; tags: string | null} | null {
  const result = getDb().executeSync(
    'SELECT title, content, source, tags FROM knowledge_documents WHERE id = ?',
    [docId],
  );
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  const r = result.rows[0] as any;
  return {title: r.title, content: r.content, source: r.source, tags: r.tags};
}

export function deleteDocument(docId: number): boolean {
  const d = getDb();
  d.executeSync('BEGIN');
  try {
    cleanupDocumentEntities(docId);
    const result = d.executeSync(
      'DELETE FROM knowledge_documents WHERE id = ?',
      [docId],
    );
    d.executeSync('COMMIT');
    return (result.rowsAffected ?? 0) > 0;
  } catch (e) {
    d.executeSync('ROLLBACK');
    throw e;
  }
}

export function patchDocument(
  docId: number,
  oldText: string,
  newText: string,
): string {
  const doc = getDocument(docId);
  if (!doc) {
    return `Document #${docId} not found.`;
  }
  if (!doc.content.includes(oldText)) {
    return `Text not found in document #${docId}.`;
  }
  const updated = doc.content.replace(oldText, newText);
  getDb().executeSync(
    'UPDATE knowledge_documents SET content = ? WHERE id = ?',
    [updated, docId],
  );
  return `Patched document #${docId}: replaced ${oldText.length} chars → ${newText.length} chars.`;
}

export function listDocuments(): {
  id: number;
  title: string;
  source: string | null;
  created_at: string;
}[] {
  const result = getDb().executeSync(
    'SELECT id, title, source, created_at FROM knowledge_documents ORDER BY created_at DESC LIMIT 50',
  );
  return (result.rows ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    source: r.source ?? null,
    created_at: r.created_at,
  }));
}

// --- Entities ---

export function saveEntity(name: string, entityType: string): number {
  const d = getDb();
  try {
    const result = d.executeSync(
      'INSERT INTO entities (name, entity_type) VALUES (?, ?) ON CONFLICT(name, entity_type) DO UPDATE SET name=name',
      [name, entityType],
    );
    // ON CONFLICT DO UPDATE returns insertId=0 for existing rows; fall through to SELECT
    if (result.insertId && result.insertId > 0) {
      return result.insertId;
    }
    const existing = d.executeSync(
      'SELECT id FROM entities WHERE name = ? AND entity_type = ?',
      [name, entityType],
    );
    return (existing.rows?.[0] as any)?.id ?? 0;
  } catch {
    const existing = d.executeSync(
      'SELECT id FROM entities WHERE name = ? AND entity_type = ?',
      [name, entityType],
    );
    return (existing.rows?.[0] as any)?.id ?? 0;
  }
}

export function addEntityMention(
  entityId: number,
  sourceType: string,
  sourceId: number,
  context?: string,
): void {
  try {
    getDb().executeSync(
      'INSERT INTO entity_mentions (entity_id, source_type, source_id, context) VALUES (?, ?, ?, ?)',
      [entityId, sourceType, sourceId, context ?? null],
    );
  } catch {}
}

export function searchEntities(query: string): {
  name: string;
  entityType: string;
  mentions: {sourceType: string; sourceId: number; context: string | null}[];
}[] {
  const d = getDb();
  const result = d.executeSync(
    `SELECT e.id, e.name, e.entity_type FROM entities e
     WHERE e.name LIKE '%' || ? || '%' ORDER BY e.name LIMIT 20`,
    [query],
  );
  return (result.rows ?? []).map((r: any) => {
    const mentionResult = d.executeSync(
      'SELECT source_type, source_id, context FROM entity_mentions WHERE entity_id = ? ORDER BY created_at DESC LIMIT 10',
      [r.id],
    );
    return {
      name: r.name as string,
      entityType: r.entity_type as string,
      mentions: (mentionResult.rows ?? []).map((m: any) => ({
        sourceType: m.source_type as string,
        sourceId: m.source_id as number,
        context: m.context as string | null,
      })),
    };
  });
}

// --- Memory Context ---

export function buildMemoryContext(): string {
  const facts = listFacts();
  if (facts.length === 0) {
    return '';
  }
  const grouped: Record<string, string[]> = {};
  for (const f of facts) {
    if (!grouped[f.category]) {
      grouped[f.category] = [];
    }
    grouped[f.category].push(f.fact);
  }
  let ctx = '\n--- MEMORY ---\n';
  for (const [cat, items] of Object.entries(grouped)) {
    ctx += `\n[${cat}]\n`;
    for (const item of items) {
      ctx += `- ${item}\n`;
    }
  }
  ctx += '\n--- END MEMORY ---\n';
  return ctx;
}

// --- Knowledge Chunks ---

export function saveChunkEmbedding(chunkId: number, embedding: ArrayBuffer): void {
  getDb().executeSync(
    'UPDATE knowledge_chunks SET embedding = ? WHERE id = ?',
    [new Uint8Array(embedding), chunkId],
  );
}

export function getChunksWithEmbeddings(): {
  id: number;
  docId: number;
  title: string;
  content: string;
  startLine: number;
  endLine: number;
  source: string | null;
  embedding: ArrayBuffer;
}[] {
  const result = getDb().executeSync(
    `SELECT kc.id, kc.doc_id, kd.title, kc.content, kc.start_line, kc.end_line, kd.source, kc.embedding
     FROM knowledge_chunks kc
     JOIN knowledge_documents kd ON kc.doc_id = kd.id
     WHERE kc.embedding IS NOT NULL`,
  );
  return (result.rows ?? []).map((r: any) => ({
    id: r.id ?? r['kc.id'],
    docId: r.doc_id ?? r['kc.doc_id'],
    title: r.title ?? r['kd.title'],
    content: r.content ?? r['kc.content'],
    startLine: r.start_line ?? r['kc.start_line'],
    endLine: r.end_line ?? r['kc.end_line'],
    source: r.source ?? r['kd.source'] ?? null,
    embedding: r.embedding as ArrayBuffer,
  }));
}

export function hybridSearch(
  query: string,
  queryEmbedding: Float32Array | null,
  limit = 10,
): {docId: number; title: string; content: string; startLine: number; endLine: number; source: string | null; score: number}[] {
  const d = getDb();
  const escaped = `"${query.replace(/"/g, '""')}"`;

  // Step 1: FTS search
  type FtsRow = {id: number; docId: number; title: string; content: string; startLine: number; endLine: number; source: string | null; rank: number};
  const ftsRows: FtsRow[] = [];
  try {
    const ftsResult = d.executeSync(
      `SELECT kc.id, kc.doc_id, kd.title, kc.content, kc.start_line, kc.end_line, kd.source, rank
       FROM knowledge_chunks kc
       JOIN knowledge_documents kd ON kc.doc_id = kd.id
       JOIN knowledge_chunks_fts fts ON kc.id = fts.rowid
       WHERE knowledge_chunks_fts MATCH ? ORDER BY rank LIMIT 50`,
      [escaped],
    );
    for (const r of ftsResult.rows ?? []) {
      const row = r as any;
      ftsRows.push({
        id: row.id ?? row['kc.id'],
        docId: row.doc_id ?? row['kc.doc_id'],
        title: row.title ?? row['kd.title'],
        content: row.content ?? row['kc.content'],
        startLine: row.start_line ?? row['kc.start_line'],
        endLine: row.end_line ?? row['kc.end_line'],
        source: row.source ?? row['kd.source'] ?? null,
        rank: row.rank,
      });
    }
  } catch {}

  // Step 2: Vector search (only if embedding provided)
  type VecRow = {id: number; docId: number; title: string; content: string; startLine: number; endLine: number; source: string | null; similarity: number};
  const vecRows: VecRow[] = [];
  if (queryEmbedding) {
    const chunksWithEmb = getChunksWithEmbeddings();
    for (const c of chunksWithEmb) {
      const vec = bufferToFloat32(c.embedding);
      const sim = cosineSimilarity(queryEmbedding, vec);
      vecRows.push({
        id: c.id,
        docId: c.docId,
        title: c.title,
        content: c.content,
        startLine: c.startLine,
        endLine: c.endLine,
        source: c.source,
        similarity: sim,
      });
    }
  }

  // Step 3: Normalize scores to [0, 1]
  const ftsScores = new Map<number, number>();
  if (ftsRows.length > 0) {
    // FTS rank is negative (lower = better in SQLite FTS5), invert and normalize
    const ranks = ftsRows.map(r => r.rank);
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    const range = maxRank - minRank;
    for (const r of ftsRows) {
      ftsScores.set(r.id, range === 0 ? 0.5 : (maxRank - r.rank) / range);
    }
  }

  const vecScores = new Map<number, number>();
  if (vecRows.length > 0) {
    const sims = vecRows.map(r => r.similarity);
    const minSim = Math.min(...sims);
    const maxSim = Math.max(...sims);
    const range = maxSim - minSim;
    for (const r of vecRows) {
      vecScores.set(r.id, range === 0 ? r.similarity : (r.similarity - minSim) / range);
    }
  }

  // Step 4 & 5: Combine, deduplicate, sort
  const combined = new Map<number, {docId: number; title: string; content: string; startLine: number; endLine: number; source: string | null; score: number}>();

  for (const r of ftsRows) {
    const fts = ftsScores.get(r.id) ?? 0;
    const vec = vecScores.get(r.id) ?? 0;
    const score = queryEmbedding ? 0.4 * fts + 0.6 * vec : fts;
    combined.set(r.id, {docId: r.docId, title: r.title, content: r.content, startLine: r.startLine, endLine: r.endLine, source: r.source, score});
  }

  for (const r of vecRows) {
    if (!combined.has(r.id)) {
      const fts = ftsScores.get(r.id) ?? 0;
      const vec = vecScores.get(r.id) ?? 0;
      const score = 0.4 * fts + 0.6 * vec;
      combined.set(r.id, {docId: r.docId, title: r.title, content: r.content, startLine: r.startLine, endLine: r.endLine, source: r.source, score});
    }
  }

  return [...combined.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function saveChunks(
  docId: number,
  chunks: {
    chunkIndex: number;
    startLine: number;
    endLine: number;
    content: string;
  }[],
): number[] {
  const d = getDb();
  const ids: number[] = [];
  for (const c of chunks) {
    const result = d.executeSync(
      'INSERT INTO knowledge_chunks (doc_id, chunk_index, start_line, end_line, content) VALUES (?, ?, ?, ?, ?)',
      [docId, c.chunkIndex, c.startLine, c.endLine, c.content],
    );
    ids.push(result.insertId ?? 0);
  }
  return ids;
}

export function searchChunks(query: string): {
  docId: number;
  title: string;
  content: string;
  startLine: number;
  endLine: number;
  source: string | null;
}[] {
  const d = getDb();
  const escaped = `"${query.replace(/"/g, '""')}"`;
  try {
    const result = d.executeSync(
      `SELECT kc.doc_id, kd.title, kc.content, kc.start_line, kc.end_line, kd.source
       FROM knowledge_chunks kc
       JOIN knowledge_documents kd ON kc.doc_id = kd.id
       JOIN knowledge_chunks_fts fts ON kc.id = fts.rowid
       WHERE knowledge_chunks_fts MATCH ? ORDER BY rank LIMIT 10`,
      [escaped],
    );
    return (result.rows ?? []).map((r: any) => ({
      docId: r.doc_id ?? r['kc.doc_id'],
      title: r.title ?? r['kd.title'],
      content: r.content ?? r['kc.content'],
      startLine: r.start_line ?? r['kc.start_line'],
      endLine: r.end_line ?? r['kc.end_line'],
      source: r.source ?? r['kd.source'] ?? null,
    }));
  } catch {
    return [];
  }
}

// --- Memory-KB Links ---

export function linkFactToDoc(factId: number, docId: number): void {
  try {
    getDb().executeSync(
      'INSERT OR IGNORE INTO memory_kb_links (fact_id, doc_id) VALUES (?, ?)',
      [factId, docId],
    );
  } catch {}
}

export function getFactLinks(factId: number): {docId: number; title: string}[] {
  const result = getDb().executeSync(
    `SELECT kd.id, kd.title FROM memory_kb_links mkl
     JOIN knowledge_documents kd ON mkl.doc_id = kd.id
     WHERE mkl.fact_id = ?`,
    [factId],
  );
  return (result.rows ?? []).map((r: any) => ({
    docId: r.id,
    title: r.title,
  }));
}

export function getDocLinkedFacts(docId: number): MemoryFact[] {
  const result = getDb().executeSync(
    `SELECT mf.id, mf.fact, mf.category FROM memory_kb_links mkl
     JOIN memory_facts mf ON mkl.fact_id = mf.id
     WHERE mkl.doc_id = ?`,
    [docId],
  );
  return rowsToFacts(result.rows ?? []);
}

// --- Uploaded Files ---

export interface UploadedFile {
  id: number;
  filename: string;
  storedPath: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  docId: number | null;
  createdAt: string;
}

export function findFileByHash(hash: string): UploadedFile | null {
  const result = getDb().executeSync(
    'SELECT id, filename, stored_path, mime_type, size_bytes, content_hash, doc_id, created_at FROM uploaded_files WHERE content_hash = ?',
    [hash],
  );
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  return rowToUploadedFile(result.rows[0] as any);
}

export function saveUploadedFile(
  filename: string,
  storedPath: string,
  mimeType: string,
  sizeBytes: number,
  contentHash: string,
): number {
  const result = getDb().executeSync(
    'INSERT INTO uploaded_files (filename, stored_path, mime_type, size_bytes, content_hash) VALUES (?, ?, ?, ?, ?)',
    [filename, storedPath, mimeType, sizeBytes, contentHash],
  );
  return result.insertId ?? 0;
}

export function listUploadedFiles(): UploadedFile[] {
  const result = getDb().executeSync(
    'SELECT id, filename, stored_path, mime_type, size_bytes, content_hash, doc_id, created_at FROM uploaded_files ORDER BY created_at DESC LIMIT 100',
  );
  return (result.rows ?? []).map((r: any) => rowToUploadedFile(r));
}

export function getUploadedFileById(fileId: number): UploadedFile | null {
  const result = getDb().executeSync(
    'SELECT id, filename, stored_path, mime_type, size_bytes, content_hash, doc_id, created_at FROM uploaded_files WHERE id = ?',
    [fileId],
  );
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  return rowToUploadedFile(result.rows[0] as any);
}

export function getUploadedFileInfo(fileId: number): {storedPath: string; docId: number | null} | null {
  const result = getDb().executeSync(
    'SELECT stored_path, doc_id FROM uploaded_files WHERE id = ?',
    [fileId],
  );
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0] as any;
  return {storedPath: row.stored_path as string, docId: row.doc_id as number | null};
}

export function linkFileToDocument(fileId: number, docId: number): void {
  getDb().executeSync(
    'UPDATE uploaded_files SET doc_id = ? WHERE id = ?',
    [docId, fileId],
  );
}

export function deleteUploadedFileRecord(fileId: number): {
  storedPath: string;
  docId: number | null;
} | null {
  const d = getDb();
  const result = d.executeSync(
    'SELECT stored_path, doc_id FROM uploaded_files WHERE id = ?',
    [fileId],
  );
  if (!result.rows || result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0] as any;
  const storedPath = row.stored_path as string;
  const docId = row.doc_id as number | null;

  d.executeSync('BEGIN');
  try {
    if (docId) {
      cleanupDocumentEntities(docId);
      d.executeSync('DELETE FROM knowledge_documents WHERE id = ?', [docId]);
    }
    d.executeSync('DELETE FROM uploaded_files WHERE id = ?', [fileId]);
    d.executeSync('COMMIT');
  } catch (e) {
    d.executeSync('ROLLBACK');
    throw e;
  }
  return {storedPath, docId};
}

/** Clean up entity_mentions + orphan entities for a document. Reused by deleteDocument. */
function cleanupDocumentEntities(docId: number): void {
  const d = getDb();
  const mentions = d.executeSync(
    "SELECT DISTINCT entity_id FROM entity_mentions WHERE source_type = 'document' AND source_id = ?",
    [docId],
  );
  const entityIds = (mentions.rows ?? []).map((r: any) => r.entity_id as number);

  d.executeSync(
    "DELETE FROM entity_mentions WHERE source_type = 'document' AND source_id = ?",
    [docId],
  );

  for (const eid of entityIds) {
    const remaining = d.executeSync(
      'SELECT COUNT(*) as cnt FROM entity_mentions WHERE entity_id = ?',
      [eid],
    );
    if (((remaining.rows?.[0] as any)?.cnt ?? 0) === 0) {
      d.executeSync('DELETE FROM entities WHERE id = ?', [eid]);
    }
  }
}

function rowToUploadedFile(r: any): UploadedFile {
  return {
    id: r.id,
    filename: r.filename,
    storedPath: r.stored_path,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    contentHash: r.content_hash,
    docId: r.doc_id ?? null,
    createdAt: r.created_at,
  };
}

// --- Helpers ---

function rowsToFacts(rows: any[]): MemoryFact[] {
  return rows.map((r: any) => ({
    id: r.id as number,
    fact: r.fact as string,
    category: r.category as string,
  }));
}
