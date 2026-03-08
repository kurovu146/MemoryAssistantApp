import type {ToolDef} from '../providers/types';
import * as repo from '../db/repository';
import {chunkDocument} from '../utils/chunking';
import {extractAndLinkEntities} from '../utils/entity-extractor';
import {readImageFromFile} from '../tools/image-read';
import {embedTexts} from '../utils/voyage-client';
import {float32ToBuffer} from '../utils/vector-search';

export type ToolResult =
  | {type: 'text'; content: string}
  | {type: 'image'; base64: string; mediaType: string; description: string};

// Stored by configureTools so the sync executeTool can fire async extraction
let _apiKey = '';
let _model = '';
let _voyageApiKey = '';

/** Called by the agent loop before each run so entity extraction has credentials. */
export function configureTools(apiKey: string, model: string, voyageApiKey?: string): void {
  _apiKey = apiKey;
  _model = model;
  if (voyageApiKey !== undefined) {
    _voyageApiKey = voyageApiKey;
  }
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
    {
      name: 'image_read',
      description:
        'Read and analyze an uploaded image file. Returns the image for visual analysis. Use this when user asks to describe, analyze, or extract info from an uploaded image.',
      parameters: {
        type: 'object',
        properties: {
          file_id: {type: 'integer', description: 'ID of the uploaded file to read'},
        },
        required: ['file_id'],
      },
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
  image_read: '🖼️',
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

export async function executeTool(toolName: string, argsJson: string): Promise<ToolResult> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJson);
  } catch {
    return {type: 'text', content: 'Error: malformed tool arguments (invalid JSON)'};
  }

  switch (toolName) {
    case 'memory_save': {
      const fact = (args.fact as string) ?? '';
      const category = (args.category as string) ?? 'general';
      if (!fact) {
        return {type: 'text', content: 'Error: fact cannot be empty'};
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

      return {type: 'text', content: `Saved memory #${id} [${category}]: ${fact}${deletedMsg}${linkedMsg}`};
    }

    case 'memory_search': {
      const keyword = (args.keyword as string) ?? '';
      if (!keyword) {
        return {type: 'text', content: 'Error: keyword cannot be empty'};
      }
      const results = repo.searchFacts(keyword);
      if (results.length === 0) {
        return {type: 'text', content: `No memories found for "${keyword}".`};
      }
      return {type: 'text', content: results.map(formatFactWithLinks).join('\n')};
    }

    case 'memory_list': {
      const cat = args.category as string | undefined;
      const results = repo.listFacts(cat);
      if (results.length === 0) {
        return {
          type: 'text',
          content: cat ? `No memories in category "${cat}".` : 'No memories saved yet.',
        };
      }
      return {type: 'text', content: results.map(formatFactWithLinks).join('\n')};
    }

    case 'memory_delete': {
      const id = args.id as number;
      if (id == null) {
        return {type: 'text', content: 'Error: id is required'};
      }
      return {
        type: 'text',
        content: repo.deleteFact(id) ? `Deleted memory #${id}.` : `Memory #${id} not found.`,
      };
    }

    case 'category_list':
      return {type: 'text', content: repo.listCategories().join(', ') || 'No categories found.'};

    case 'category_add': {
      const name = (args.name as string) ?? '';
      if (!name) {
        return {type: 'text', content: 'Error: name cannot be empty'};
      }
      try {
        repo.addCategory(name);
        return {type: 'text', content: `Category '${name}' created.`};
      } catch (e: any) {
        return {type: 'text', content: `Error: ${e.message}`};
      }
    }

    case 'category_delete': {
      const name = (args.name as string) ?? '';
      if (!name) {
        return {type: 'text', content: 'Error: name cannot be empty'};
      }
      try {
        return {
          type: 'text',
          content: repo.deleteCategory(name)
            ? `Category '${name}' deleted.`
            : `Category '${name}' not found.`,
        };
      } catch (e: any) {
        return {type: 'text', content: `Error: ${e.message}`};
      }
    }

    case 'knowledge_save': {
      const title = (args.title as string) ?? '';
      const content = (args.content as string) ?? '';
      if (!title || !content) {
        return {type: 'text', content: 'Error: title and content are required'};
      }
      const source = (args.source as string) ?? undefined;
      const docId = repo.saveDocument(
        title,
        content,
        source,
        args.tags as string | undefined,
      );

      const chunks = chunkDocument(content);
      const chunkIds = repo.saveChunks(docId, chunks);

      // Fire-and-forget embedding — non-blocking so tool returns immediately
      if (_voyageApiKey && chunkIds.length > 0) {
        const chunkTexts = chunks.map(c => c.content);
        const voyageKey = _voyageApiKey;
        embedTexts(voyageKey, chunkTexts, 'document').then(embeddings => {
          for (let i = 0; i < chunkIds.length; i++) {
            if (embeddings[i]) {
              try {
                repo.saveChunkEmbedding(chunkIds[i], float32ToBuffer(embeddings[i]));
              } catch (e) {
                console.warn('[tools] saveChunkEmbedding failed for chunk', chunkIds[i], e);
              }
            }
          }
        }).catch(e => {
          console.warn('[tools] Embedding failed for doc', docId, e);
        });
      }

      // Auto-link uploaded file if source matches "file:{id}" pattern
      let fileMsg = '';
      if (source) {
        const fileMatch = source.match(/^file:(\d+)$/);
        if (fileMatch) {
          try {
            repo.linkFileToDocument(Number(fileMatch[1]), docId);
            fileMsg = '\nLinked to uploaded file.';
          } catch {}
        }
      }

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
        const capturedKey = _apiKey;
        const capturedModel = _model;
        extractAndLinkEntities(capturedKey, capturedModel, 'document', docId, title + ' ' + content).catch(
          () => {},
        );
      }

      return {type: 'text', content: `Saved document #${docId}: "${title}" — ${chunkIds.length} chunks${fileMsg}${linkedMsg}`};
    }

    case 'knowledge_search': {
      const query = (args.query as string) ?? '';
      if (!query) {
        return {type: 'text', content: 'Error: query cannot be empty'};
      }
      const chunks = repo.searchChunks(query);
      if (chunks.length === 0) {
        return {type: 'text', content: `No documents found for "${query}".`};
      }
      return {
        type: 'text',
        content: chunks
          .map(
            c =>
              `[doc #${c.docId}] ${c.title} (lines ${c.startLine}-${c.endLine})${c.source ? ` — ${c.source}` : ''}\n  ${c.content}`,
          )
          .join('\n\n'),
      };
    }

    case 'knowledge_list': {
      const docs = repo.listDocuments();
      if (docs.length === 0) {
        return {type: 'text', content: 'No documents in knowledge base.'};
      }
      return {
        type: 'text',
        content: docs
          .map(
            d =>
              `[#${d.id}] ${d.title}${d.source ? ` (${d.source})` : ''} — ${d.created_at}`,
          )
          .join('\n'),
      };
    }

    case 'knowledge_get': {
      const docId = args.doc_id as number;
      if (docId == null) {
        return {type: 'text', content: 'Error: doc_id is required'};
      }
      const doc = repo.getDocument(docId);
      if (!doc) {
        return {type: 'text', content: `Document #${docId} not found.`};
      }
      let out = `# ${doc.title}\nSource: ${doc.source ?? 'none'}\nTags: ${doc.tags ?? 'none'}\n\n${doc.content}`;
      const linked = repo.getDocLinkedFacts(docId);
      if (linked.length > 0) {
        out += '\n\nLinked memories:';
        for (const f of linked) {
          out += `\n- [#${f.id}] ${f.fact}`;
        }
      }
      return {type: 'text', content: out};
    }

    case 'knowledge_patch': {
      const docId = args.doc_id as number;
      const oldText = (args.old_text as string) ?? '';
      const newText = (args.new_text as string) ?? '';
      if (docId == null) {
        return {type: 'text', content: 'Error: doc_id is required'};
      }
      if (!oldText) {
        return {type: 'text', content: 'Error: old_text cannot be empty'};
      }
      return {type: 'text', content: repo.patchDocument(docId, oldText, newText)};
    }

    case 'knowledge_delete': {
      const docId = args.doc_id as number;
      if (docId == null) {
        return {type: 'text', content: 'Error: doc_id is required'};
      }
      return {
        type: 'text',
        content: repo.deleteDocument(docId)
          ? `Deleted document #${docId} and all its chunks.`
          : `Document #${docId} not found.`,
      };
    }

    case 'entity_search': {
      const query = (args.query as string) ?? '';
      if (!query) {
        return {type: 'text', content: 'Error: query cannot be empty'};
      }
      const entities = repo.searchEntities(query);
      if (entities.length === 0) {
        return {type: 'text', content: `No entities found for "${query}".`};
      }
      return {
        type: 'text',
        content: entities
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
          .join('\n\n'),
      };
    }

    case 'get_datetime': {
      const now = new Date();
      const utc = now.toISOString();
      const vn = now.toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'});
      const us = now.toLocaleString('en-US', {timeZone: 'America/New_York'});
      return {type: 'text', content: `UTC: ${utc}\nVietnam (GMT+7): ${vn}\nUS Eastern: ${us}`};
    }

    case 'image_read': {
      const fileId = args.file_id as number;
      if (fileId == null) {
        return {type: 'text', content: 'Error: file_id is required'};
      }
      return readImageFromFile(fileId);
    }

    default:
      return {type: 'text', content: `Unknown tool: ${toolName}`};
  }
}
