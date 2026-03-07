import {create} from 'zustand';
import {runAgentLoop, type AgentProgress} from '../agent/loop';
import type {Message, MessageContent} from '../providers/types';
import * as repo from '../db/repository';

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

const SYSTEM_PROMPT = `You are Kuro, a personal AI assistant specializing in knowledge management. You help users remember important facts, organize knowledge, and find information from their personal knowledge base.

Key behaviors:
- Use memory_save to store important facts the user shares
- Use memory_search/memory_list to recall previously saved information
- Use knowledge_save to store longer documents and articles
- Use knowledge_search to find relevant information
- Always check memory first when the user asks about something you might have saved before
- Be concise and helpful
- Respond in the same language the user uses

Current date: ${new Date().toISOString().split('T')[0]}`;

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

  sendMessage: async (text, apiKey, model) => {
    const {sessionId} = get();
    if (!sessionId) {
      return;
    }

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
    const fullPrompt = SYSTEM_PROMPT + memoryContext;

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

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.response,
        toolsUsed: result.toolsUsed,
        toolsCounts: result.toolsCounts,
        turns: result.turns,
        timestamp: Date.now(),
      };

      repo.appendMessage(sessionId, 'assistant', result.response);

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
