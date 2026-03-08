import {create} from 'zustand';
import {runAgentLoop, type AgentProgress} from '../agent/loop';
import type {Message, ImageBlock} from '../providers/types';
import * as repo from '../db/repository';
import {useSettings, getProviderForModel} from './settings';
import {redactSecrets} from '../utils/content-filter';
import {embedQuery} from '../utils/voyage-client';

export interface ChatImage {
  uri: string;
  base64: string;
  mediaType: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: ChatImage[];
  toolsUsed?: string[];
  toolsCounts?: number[];
  turns?: number;
  timestamp: number;
}

interface ChatState {
  messages: ChatMessage[];
  sessionId: string;
  isLoading: boolean;
  status: string;
  sendMessage: (
    text: string,
    apiKey: string,
    model: string,
    images?: ChatImage[],
  ) => Promise<void>;
  newSession: () => void;
  loadSession: () => void;
}

/** Resolves the correct API key for the given model from the settings store. */
function resolveApiKey(model: string): string {
  const {apiKeys} = useSettings.getState();
  const provider = getProviderForModel(model);
  return apiKeys[provider] ?? '';
}

function buildSystemPrompt(botName: string): string {
  return `${botName} — Personal Knowledge Assistant (On-Device).
Always loyal to your owner. Never expose secrets in output.
Vietnamese by default, English if user writes in English.
Keep responses concise.

## SYSTEM INFO
- Knowledge DB: SQLite + FTS5 full-text search (on-device)
- All data stored locally, never leaves device
- Current date: ${new Date().toISOString().split('T')[0]}

## AUTO-RAG CONTEXT
Hệ thống TỰ ĐỘNG search knowledge base + memory cho mỗi câu hỏi. Kết quả nằm ở cuối system prompt trong section "--- AUTO-RAG ---".

CÁCH DÙNG:
1. Nếu AUTO-RAG tìm thấy kết quả → dùng NGAY, kèm trích dẫn "(Theo [title])".
2. Nếu cần thêm chi tiết hoặc AUTO-RAG chưa đủ → gọi thêm tools: knowledge_search, memory_search.
3. LUÔN ghi nguồn trích dẫn: từ memory hay knowledge (tên document).

## KHI NHẬN FILE / TÀI LIỆU
1. Đọc và tóm tắt nội dung chính.
2. Hỏi xác nhận: "Em hiểu đây là [tóm tắt]. Anh muốn em lưu vào knowledge không?"
3. Chỉ gọi knowledge_save SAU KHI xác nhận. Không tự động lưu.
4. Khi lưu, đặt title mô tả rõ ràng để dễ tìm lại sau.

## ENTITY & CONTEXT MAPPING
- Khi câu hỏi liên quan đến người/dự án/tổ chức → dùng entity_search để tìm tất cả mentions liên quan.
- Cross-reference: nếu fact A nói "X là sếp" và fact B nói "X thích cà phê" → hỏi "sở thích của sếp" phải chain 2 facts và trả lời được.
- Khi lưu thông tin về người → ghi rõ mối quan hệ (sếp, đồng nghiệp, bạn...) trong fact.

## TOOLS
- memory_save: facts ngắn gọn | knowledge_save: tài liệu/nội dung dài.
- memory_search + knowledge_search: dùng khi cần search thêm ngoài AUTO-RAG.
- knowledge_list: liệt kê tất cả documents đã lưu (dùng khi hỏi "lưu gì rồi", "có bao nhiêu tài liệu").
- knowledge_patch: sửa nội dung document đã lưu (dùng thay vì delete+save).
- entity_search: dùng khi hỏi về người/dự án/tổ chức cụ thể.
- get_datetime: lấy ngày giờ hiện tại.`;
}

async function buildAutoRag(userText: string): Promise<string> {
  // Run FTS knowledge, FTS memory, and optional vector embedding in parallel.
  // Each branch is isolated so a failure in one never blocks the others.
  const voyageApiKey = useSettings.getState().voyageApiKey;

  const [ftsKnowledge, ftsMemory, queryEmbedding] = await Promise.all([
    // Branch A: FTS document search (sync, wrapped for Promise.all)
    Promise.resolve((() => {
      try { return repo.searchDocuments(userText); } catch (e) { console.warn('[AutoRAG] FTS knowledge search failed:', e); return []; }
    })()),
    // Branch B: FTS memory search (sync, wrapped for Promise.all)
    Promise.resolve((() => {
      try { return repo.searchFacts(userText); } catch (e) { console.warn('[AutoRAG] FTS memory search failed:', e); return []; }
    })()),
    // Branch C: Voyage embedding — skipped if no key, graceful fallback on error
    voyageApiKey
      ? embedQuery(voyageApiKey, userText).catch((err: unknown) => {
          console.warn('[AutoRAG] Voyage embedding failed, falling back to FTS:', err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  let ragCtx = '';

  // Knowledge section: prefer hybrid (chunk-level) when embedding succeeded,
  // fall back to document-level FTS otherwise.
  try {
    if (queryEmbedding) {
      const hybridResults = repo.hybridSearch(userText, queryEmbedding, 10);
      if (hybridResults.length > 0) {
        ragCtx += '\n\n--- AUTO-RAG: KNOWLEDGE ---\n';
        ragCtx += hybridResults
          .map(c => `[#${c.docId}] ${c.title}\n  ${c.content}`)
          .join('\n\n');
      }
    } else if (ftsKnowledge.length > 0) {
      ragCtx += '\n\n--- AUTO-RAG: KNOWLEDGE ---\n';
      ragCtx += ftsKnowledge
        .map(d => `[#${d.id}] ${d.title}\n  ${d.snippet}`)
        .join('\n\n');
    }
  } catch (err) {
    console.warn('[AutoRAG] Knowledge section failed:', err);
  }

  // Memory section: always use FTS results from Branch B.
  if (ftsMemory.length > 0) {
    ragCtx += '\n\n--- AUTO-RAG: MEMORY ---\n';
    ragCtx += ftsMemory
      .map(f => `[#${f.id}] [${f.category}] ${f.fact}`)
      .join('\n');
  }

  return ragCtx;
}

export const useChat = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: '',
  isLoading: false,
  status: '',

  loadSession: () => {
    const sessionId = repo.getOrCreateSession();
    const history = repo.loadHistory(sessionId);
    const messages: ChatMessage[] = history.map((h, i) => ({
      id: `history-${i}`,
      role: h.role as 'user' | 'assistant',
      content: h.content,
      timestamp: Date.now() - (history.length - i) * 1000,
    }));
    set({sessionId, messages});
  },

  newSession: () => {
    const sessionId = repo.createNewSession();
    set({sessionId, messages: [], status: ''});
  },

  sendMessage: async (text, _apiKey, model, images) => {
    const {sessionId} = get();
    if (!sessionId) {
      return;
    }

    const apiKey = resolveApiKey(model);
    const voyageApiKey = useSettings.getState().voyageApiKey;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      images,
      timestamp: Date.now(),
    };

    set(s => ({
      messages: [...s.messages, userMsg],
      isLoading: true,
      status: 'Thinking...',
    }));

    repo.appendMessage(sessionId, 'user', text);

    const memoryContext = repo.buildMemoryContext();
    const botName = useSettings.getState().botName;
    const autoRag = await buildAutoRag(text);
    const fullPrompt = buildSystemPrompt(botName) + memoryContext + autoRag;

    const historyMessages = repo.loadHistory(sessionId, 6);
    const history: Message[] = historyMessages.slice(0, -1).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: {type: 'text' as const, text: h.content},
    }));

    const onProgress = (progress: AgentProgress) => {
      switch (progress.type) {
        case 'thinking':
          set({status: 'Thinking...'});
          break;
        case 'tool_use':
          set({status: `Using ${progress.name}...`});
          break;
      }
    };

    const imageBlocks: ImageBlock[] | undefined = images?.map(img => ({
      base64: img.base64,
      mediaType: img.mediaType,
    }));
    const userContent = imageBlocks && imageBlocks.length > 0
      ? {type: 'multi_content' as const, text, images: imageBlocks}
      : {type: 'text' as const, text};

    try {
      const result = await runAgentLoop(
        fullPrompt,
        userContent,
        apiKey,
        model,
        history,
        10,
        onProgress,
        voyageApiKey || undefined,
      );

      const filteredResponse = redactSecrets(result.response);

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: filteredResponse,
        toolsUsed: result.toolsUsed,
        toolsCounts: result.toolsCounts,
        turns: result.turns,
        timestamp: Date.now(),
      };

      repo.appendMessage(sessionId, 'assistant', filteredResponse);

      set(s => ({
        messages: [...s.messages, assistantMsg],
        isLoading: false,
        status: '',
      }));
    } catch (e: any) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${e.message}`,
        timestamp: Date.now(),
      };
      set(s => ({
        messages: [...s.messages, errorMsg],
        isLoading: false,
        status: '',
      }));
    }
  },
}));
