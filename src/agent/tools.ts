import type {ToolDef} from '../providers/types';
import * as repo from '../db/repository';
import {chunkDocument} from '../utils/chunking';
import {extractAndLinkEntities} from '../utils/entity-extractor';

// Stored by configureTools so the sync executeTool can fire async extraction
let _apiKey = '';
let _model = '';

/** Called by the agent loop before each run so entity extraction has credentials. */
export function configureTools(apiKey: string, model: string): void {
  _apiKey = apiKey;
  _model = model;
}

export function getToolDefinitions(): ToolDef[] {
  return [
    {
      name: 'memory_save',
      description:
        'Save an important fact to long-term memory for future conversations.',
      parameters: {
        type: 'object',
        properties: {
          fact: {type: 'string', description: 'The fact to remember'},
          category: {
            type: 'string',
            description: 'Category of the fact (use category_list to see available)',
          },
        },
        required: ['fact'],
      },
    },
    {
      name: 'memory_search',
      description: 'Search long-term memory for previously saved facts.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {type: 'string', description: 'Keyword to search for'},
        },
        required: ['keyword'],
      },
    },
    {
      name: 'memory_list',
      description: 'List all saved facts from long-term memory.',
      parameters: {
        type: 'object',
        properties: {
          category: {type: 'string', description: 'Optional category filter'},
        },
      },
    },
    {
      name: 'memory_delete',
      description: 'Delete a fact from long-term memory by its ID.',
      parameters: {
        type: 'object',
        properties: {
          id: {type: 'integer', description: 'The fact ID to delete'},
        },
        required: ['id'],
      },
    },
    {
      name: 'category_list',
      description: 'List all available memory categories.',
      parameters: {type: 'object', properties: {}},
    },
    {
      name: 'category_add',
      description: 'Create a new custom memory category.',
      parameters: {
        type: 'object',
        properties: {
          name: {type: 'string', description: 'Category name to create'},
        },
        required: ['name'],
      },
    },
    {
      name: 'category_delete',
      description: 'Delete an empty memory category.',
      parameters: {
        type: 'object',
        properties: {
          name: {type: 'string', description: 'Category name to delete'},
        },
        required: ['name'],
      },
    },
    {
      name: 'knowledge_save',
      description:
        'Save a document to the knowledge base for future reference.',
      parameters: {
        type: 'object',
        properties: {
          title: {type: 'string', description: 'Title of the document'},
          content: {type: 'string', description: 'Full content of the document'},
          source: {type: 'string', description: 'Source URL or reference'},
          tags: {type: 'string', description: 'Comma-separated tags'},
        },
        required: ['title', 'content'],
      },
    },
    {
      name: 'knowledge_search',
      description:
        'Search the knowledge base. Returns relevant document snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: {type: 'string', description: 'Search query'},
        },
        required: ['query'],
      },
    },
    {
      name: 'knowledge_list',
      description: 'List all saved documents in the knowledge base.',
      parameters: {type: 'object', properties: {}},
    },
    {
      name: 'knowledge_get',
      description: 'Get full content of a knowledge document by its ID.',
      parameters: {
        type: 'object',
        properties: {
          doc_id: {type: 'integer', description: 'Document ID'},
        },
        required: ['doc_id'],
      },
    },
    {
      name: 'knowledge_patch',
      description:
        'Patch a knowledge document by replacing specific text. Use this instead of delete+save when updating existing docs.',
      parameters: {
        type: 'object',
        properties: {
          doc_id: {type: 'integer', description: 'Document ID to patch'},
          old_text: {
            type: 'string',
            description: 'Text to find in the document',
          },
          new_text: {type: 'string', description: 'Replacement text'},
        },
        required: ['doc_id', 'old_text', 'new_text'],
      },
    },
    {
      name: 'knowledge_delete',
      description:
        'Delete a knowledge document and all its chunks by ID. Use knowledge_list to find the ID first.',
      parameters: {
        type: 'object',
        properties: {
          doc_id: {type: 'integer', description: 'Document ID to delete'},
        },
        required: ['doc_id'],
      },
    },
    {
      name: 'entity_search',
      description:
        'Search for entities (people, projects, technologies) in the knowledge graph. Shows which documents and facts mention them.',
      parameters: {
        type: 'object',
        properties: {
          query: {type: 'string', description: 'Entity name to search for'},
        },
        required: ['query'],
      },
    },
    {
      name: 'get_datetime',
      description:
        'Get current date and time in UTC and common timezones (Vietnam, US Eastern).',
      parameters: {type: 'object', properties: {}},
    },
  ];
}

const TOOL_ICONS: Record<string, string> = {
  memory_save: '🧠',
  memory_search: '🧠',
  memory_list: '🧠',
  memory_delete: '🧠',
  category_list: '📋',
  category_add: '📋',
  category_delete: '📋',
  knowledge_save: '📚',
  knowledge_search: '📚',
  knowledge_list: '📚',
  knowledge_get: '📚',
  knowledge_patch: '📚',
  knowledge_delete: '📚',
  entity_search: '🔗',
  get_datetime: '🕐',
};

export function getToolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '🔧';
}

function formatFactWithLinks(f: repo.MemoryFact): string {
  let line = `[#${f.id}] [${f.category}] ${f.fact}`;
  try {
    const links = repo.getFactLinks(f.id);
    if (links.length > 0) {
      line += ` → ${links.map(l => `#${l.docId} ${l.title}`).join(', ')}`;
    }
  } catch {}
  return line;
}

export function executeTool(toolName: string, argsJson: string): string {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJson);
  } catch {
    args = {};
  }

  switch (toolName) {
    case 'memory_save': {
      const fact = (args.fact as string) ?? '';
      const category = (args.category as string) ?? 'general';
      if (!fact) {
        return 'Error: fact cannot be empty';
      }

      // Auto-supersede: find and delete existing facts in the same category that match
      let deletedMsg = '';
      try {
        const oldFacts = repo.searchFacts(fact);
        const deleted: string[] = [];
        for (const old of oldFacts) {
          if (old.category !== category) {
            continue;
          }
          if (repo.deleteFact(old.id)) {
            deleted.push(`#${old.id} ${old.fact}`);
          }
          if (deleted.length >= 3) {
            break;
          }
        }
        if (deleted.length > 0) {
          deletedMsg = `\nSuperseded: ${deleted.join(', ')}`;
        }
      } catch {}

      const id = repo.saveFact(fact, category);

      // Auto-link to knowledge docs that contain relevant chunks
      let linkedMsg = '';
      try {
        const chunks = repo.searchChunks(fact);
        const docIds = new Set<number>();
        for (const c of chunks) {
          if (docIds.size >= 3) {
            break;
          }
          if (!docIds.has(c.docId)) {
            docIds.add(c.docId);
            repo.linkFactToDoc(id, c.docId);
          }
        }
        if (docIds.size > 0) {
          linkedMsg = `\nLinked to ${docIds.size} document(s).`;
        }
      } catch {}

      return `Saved memory #${id} [${category}]: ${fact}${deletedMsg}${linkedMsg}`;
    }

    case 'memory_search': {
      const keyword = (args.keyword as string) ?? '';
      if (!keyword) {
        return 'Error: keyword cannot be empty';
      }
      const results = repo.searchFacts(keyword);
      if (results.length === 0) {
        return `No memories found for "${keyword}".`;
      }
      return results.map(formatFactWithLinks).join('\n');
    }

    case 'memory_list': {
      const cat = args.category as string | undefined;
      const results = repo.listFacts(cat);
      if (results.length === 0) {
        return cat
          ? `No memories in category "${cat}".`
          : 'No memories saved yet.';
      }
      return results.map(formatFactWithLinks).join('\n');
    }

    case 'memory_delete': {
      const id = args.id as number;
      if (!id) {
        return 'Error: id is required';
      }
      return repo.deleteFact(id)
        ? `Deleted memory #${id}.`
        : `Memory #${id} not found.`;
    }

    case 'category_list':
      return repo.listCategories().join(', ') || 'No categories found.';

    case 'category_add': {
      const name = (args.name as string) ?? '';
      if (!name) {
        return 'Error: name cannot be empty';
      }
      try {
        repo.addCategory(name);
        return `Category '${name}' created.`;
      } catch (e: any) {
        return `Error: ${e.message}`;
      }
    }

    case 'category_delete': {
      const name = (args.name as string) ?? '';
      if (!name) {
        return 'Error: name cannot be empty';
      }
      try {
        return repo.deleteCategory(name)
          ? `Category '${name}' deleted.`
          : `Category '${name}' not found.`;
      } catch (e: any) {
        return `Error: ${e.message}`;
      }
    }

    case 'knowledge_save': {
      const title = (args.title as string) ?? '';
      const content = (args.content as string) ?? '';
      if (!title || !content) {
        return 'Error: title and content are required';
      }
      const docId = repo.saveDocument(
        title,
        content,
        args.source as string | undefined,
        args.tags as string | undefined,
      );

      const chunks = chunkDocument(content);
      const chunkIds = repo.saveChunks(docId, chunks);

      // Auto-link related memory facts by searching on the document title
      let linkedMsg = '';
      try {
        const relatedFacts = repo.searchFacts(title);
        for (const f of relatedFacts.slice(0, 5)) {
          repo.linkFactToDoc(f.id, docId);
        }
        if (relatedFacts.length > 0) {
          linkedMsg = `\nAuto-linked ${Math.min(relatedFacts.length, 5)} memory fact(s).`;
        }
      } catch {}

      // Fire-and-forget entity extraction — non-blocking so tool returns immediately
      if (_apiKey && _model) {
        extractAndLinkEntities(_apiKey, _model, 'document', docId, title + ' ' + content).catch(
          () => {},
        );
      }

      return `Saved document #${docId}: "${title}" — ${chunkIds.length} chunks${linkedMsg}`;
    }

    case 'knowledge_search': {
      const query = (args.query as string) ?? '';
      if (!query) {
        return 'Error: query cannot be empty';
      }
      const chunks = repo.searchChunks(query);
      if (chunks.length === 0) {
        return `No documents found for "${query}".`;
      }
      return chunks
        .map(
          c =>
            `[doc #${c.docId}] ${c.title} (lines ${c.startLine}-${c.endLine})${c.source ? ` — ${c.source}` : ''}\n  ${c.content}`,
        )
        .join('\n\n');
    }

    case 'knowledge_list': {
      const docs = repo.listDocuments();
      if (docs.length === 0) {
        return 'No documents in knowledge base.';
      }
      return docs
        .map(
          d =>
            `[#${d.id}] ${d.title}${d.source ? ` (${d.source})` : ''} — ${d.created_at}`,
        )
        .join('\n');
    }

    case 'knowledge_get': {
      const docId = args.doc_id as number;
      if (!docId) {
        return 'Error: doc_id is required';
      }
      const doc = repo.getDocument(docId);
      if (!doc) {
        return `Document #${docId} not found.`;
      }
      let out = `# ${doc.title}\nSource: ${doc.source ?? 'none'}\nTags: ${doc.tags ?? 'none'}\n\n${doc.content}`;
      const linked = repo.getDocLinkedFacts(docId);
      if (linked.length > 0) {
        out += '\n\nLinked memories:';
        for (const f of linked) {
          out += `\n- [#${f.id}] ${f.fact}`;
        }
      }
      return out;
    }

    case 'knowledge_patch': {
      const docId = args.doc_id as number;
      const oldText = (args.old_text as string) ?? '';
      const newText = (args.new_text as string) ?? '';
      if (!docId) {
        return 'Error: doc_id is required';
      }
      if (!oldText) {
        return 'Error: old_text cannot be empty';
      }
      return repo.patchDocument(docId, oldText, newText);
    }

    case 'knowledge_delete': {
      const docId = args.doc_id as number;
      if (!docId) {
        return 'Error: doc_id is required';
      }
      return repo.deleteDocument(docId)
        ? `Deleted document #${docId} and all its chunks.`
        : `Document #${docId} not found.`;
    }

    case 'entity_search': {
      const query = (args.query as string) ?? '';
      if (!query) {
        return 'Error: query cannot be empty';
      }
      const entities = repo.searchEntities(query);
      if (entities.length === 0) {
        return `No entities found for "${query}".`;
      }
      return entities
        .map(e => {
          const header = `${e.name} (${e.entityType}) — ${e.mentions.length} mention(s)`;
          if (e.mentions.length === 0) {
            return header;
          }
          const mentionLines = e.mentions
            .map(m => {
              const ctx = m.context ? ` "…${m.context}…"` : '';
              return `  • ${m.sourceType} #${m.sourceId}${ctx}`;
            })
            .join('\n');
          return `${header}\n${mentionLines}`;
        })
        .join('\n\n');
    }

    case 'get_datetime': {
      const now = new Date();
      const utc = now.toISOString();
      const vn = now.toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'});
      const us = now.toLocaleString('en-US', {timeZone: 'America/New_York'});
      return `UTC: ${utc}\nVietnam (GMT+7): ${vn}\nUS Eastern: ${us}`;
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}
