import type {ToolDef} from '../providers/types';
import * as repo from '../db/repository';

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
      name: 'knowledge_delete',
      description: 'Delete a knowledge document by ID.',
      parameters: {
        type: 'object',
        properties: {
          doc_id: {type: 'integer', description: 'Document ID to delete'},
        },
        required: ['doc_id'],
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
  knowledge_delete: '📚',
  get_datetime: '🕐',
};

export function getToolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '🔧';
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
      const id = repo.saveFact(fact, category);
      return `Saved memory #${id} [${category}]: ${fact}`;
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
      return results
        .map(f => `[#${f.id}] [${f.category}] ${f.fact}`)
        .join('\n');
    }

    case 'memory_list': {
      const cat = args.category as string | undefined;
      const results = repo.listFacts(cat);
      if (results.length === 0) {
        return cat
          ? `No memories in category "${cat}".`
          : 'No memories saved yet.';
      }
      return results
        .map(f => `[#${f.id}] [${f.category}] ${f.fact}`)
        .join('\n');
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
      return `Saved document #${docId}: "${title}" (${content.length} chars)`;
    }

    case 'knowledge_search': {
      const query = (args.query as string) ?? '';
      if (!query) {
        return 'Error: query cannot be empty';
      }
      const results = repo.searchDocuments(query);
      if (results.length === 0) {
        return `No documents found for "${query}".`;
      }
      return results
        .map(d => `[#${d.id}] ${d.title}\n  ${d.snippet}`)
        .join('\n\n');
    }

    case 'knowledge_list': {
      const d = repo.getDb();
      const result = d.executeSync(
        'SELECT id, title, source, created_at FROM knowledge_documents ORDER BY created_at DESC LIMIT 50',
      );
      const rows = result.rows ?? [];
      if (rows.length === 0) {
        return 'No documents in knowledge base.';
      }
      return rows
        .map(
          (r: any) =>
            `[#${r.id}] ${r.title}${r.source ? ` (${r.source})` : ''} — ${r.created_at}`,
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
      return `# ${doc.title}\nSource: ${doc.source ?? 'none'}\nTags: ${doc.tags ?? 'none'}\n\n${doc.content}`;
    }

    case 'knowledge_delete': {
      const docId = args.doc_id as number;
      if (!docId) {
        return 'Error: doc_id is required';
      }
      return repo.deleteDocument(docId)
        ? `Deleted document #${docId}.`
        : `Document #${docId} not found.`;
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
