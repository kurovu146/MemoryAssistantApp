import {open, type DB} from '@op-engineering/op-sqlite';
import {initializeDatabase} from './schema';

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
  const result = getDb().executeSync(
    'DELETE FROM knowledge_documents WHERE id = ?',
    [docId],
  );
  return (result.rowsAffected ?? 0) > 0;
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

// --- Helpers ---

function rowsToFacts(rows: any[]): MemoryFact[] {
  return rows.map((r: any) => ({
    id: r.id as number,
    fact: r.fact as string,
    category: r.category as string,
  }));
}
