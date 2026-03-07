import {create} from 'zustand';
import {runAgentLoop, type AgentProgress} from '../agent/loop';
import type {Message} from '../providers/types';
import * as repo from '../db/repository';
import {useSettings} from './settings';
import {redactSecrets} from '../utils/content-filter';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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
  ) => Promise<void>;
  newSession: () => void;
  loadSession: () => void;
}

/** Resolves the correct API key for the given model from the settings store. */
function resolveApiKey(model: string): string {
  const settings = useSettings.getState();
  return model.startsWith('gpt-') ? settings.openaiApiKey : settings.claudeApiKey;
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

function buildAutoRag(userText: string): string {
  let ragCtx = '';

  try {
    const knowledgeResults = repo.searchDocuments(userText);
    if (knowledgeResults.length > 0) {
      ragCtx += '\n\n--- AUTO-RAG: KNOWLEDGE BASE ---\n';
      ragCtx += knowledgeResults
        .map(d => `[#${d.id}] ${d.title}\n  ${d.snippet}`)
        .join('\n\n');
    }
  } catch {}

  try {
    const memoryResults = repo.searchFacts(userText);
    if (memoryResults.length > 0) {
      ragCtx += '\n\n--- AUTO-RAG: MEMORY ---\n';
      ragCtx += memoryResults
        .map(f => `[#${f.id}] [${f.category}] ${f.fact}`)
        .join('\n');
    }
  } catch {}

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

  sendMessage: async (text, _apiKey, model) => {
    const {sessionId} = get();
    if (!sessionId) {
      return;
    }

    // Always resolve the key from the settings store so callers don't need to
    // thread it through — and so switching models mid-session works correctly.
    const apiKey = resolveApiKey(model);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
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
    const autoRag = buildAutoRag(text);
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

    try {
      const result = await runAgentLoop(
        fullPrompt,
        {type: 'text', text},
        apiKey,
        model,
        history,
        10,
        onProgress,
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
