export type Role = 'system' | 'user' | 'assistant' | 'tool';

export type MessageContent =
  | {type: 'text'; text: string}
  | {type: 'image'; text: string; imageBase64: string; mediaType: string}
  | {type: 'tool_result'; toolCallId: string; name: string; content: string}
  | {
      type: 'assistant_tool_calls';
      text?: string;
      toolCalls: ToolCall[];
    };

export interface Message {
  role: Role;
  content: MessageContent;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LlmResponse {
  content?: string;
  toolCalls: ToolCall[];
  usage: Usage;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export function textContent(text: string): MessageContent {
  return {type: 'text', text};
}

export function getMessageText(content: MessageContent): string {
  switch (content.type) {
    case 'text':
      return content.text;
    case 'image':
      return content.text;
    case 'tool_result':
      return content.content;
    case 'assistant_tool_calls':
      return content.text ?? '';
  }
}
