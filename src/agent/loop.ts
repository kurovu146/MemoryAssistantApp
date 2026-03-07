import {callClaude} from '../providers/claude';
import {callOpenAI} from '../providers/openai';
import type {
  Message,
  MessageContent,
  ToolCall,
  LlmResponse,
} from '../providers/types';
import {getToolDefinitions, executeTool, configureTools} from './tools';

export type AgentProgress =
  | {type: 'thinking'}
  | {type: 'tool_use'; name: string}
  | {type: 'text'; text: string};

export interface AgentResult {
  response: string;
  toolsUsed: string[];
  toolsCounts: number[];
  turns: number;
}

export async function runAgentLoop(
  systemPrompt: string,
  userContent: MessageContent,
  apiKey: string,
  model: string,
  history: Message[],
  maxTurns: number,
  onProgress: (progress: AgentProgress) => void,
): Promise<AgentResult> {
  configureTools(apiKey, model);
  const tools = getToolDefinitions();
  const toolsUsed: string[] = [];

  const messages: Message[] = [
    {role: 'system', content: {type: 'text', text: systemPrompt}},
    ...history,
    {role: 'user', content: userContent},
  ];

  for (let turn = 0; turn < maxTurns; turn++) {
    onProgress({type: 'thinking'});

    let response: LlmResponse;
    try {
      // Route to the appropriate provider based on model name prefix
      response = model.startsWith('gpt-')
        ? await callOpenAI(messages, tools, apiKey, model)
        : await callClaude(messages, tools, apiKey, model);
    } catch (e: any) {
      const {deduped, counts} = dedupWithCounts(toolsUsed);
      return {
        response: `Error: ${e.message}`,
        toolsUsed: deduped,
        toolsCounts: counts,
        turns: turn + 1,
      };
    }

    if (response.toolCalls.length === 0) {
      const content = response.content ?? '';
      const {deduped, counts} = dedupWithCounts(toolsUsed);
      return {
        response: content,
        toolsUsed: deduped,
        toolsCounts: counts,
        turns: turn + 1,
      };
    }

    messages.push({
      role: 'assistant',
      content: {
        type: 'assistant_tool_calls',
        text: response.content ?? undefined,
        toolCalls: response.toolCalls,
      },
    });

    for (const tc of response.toolCalls) {
      toolsUsed.push(tc.name);
      onProgress({type: 'tool_use', name: tc.name});

      const result = executeTool(tc.name, tc.arguments);

      messages.push({
        role: 'tool',
        content: {
          type: 'tool_result',
          toolCallId: tc.id,
          name: tc.name,
          content: result,
        },
      });
    }
  }

  const lastAssistant = messages
    .filter(m => m.role === 'assistant')
    .pop();
  const fallback =
    lastAssistant?.content.type === 'text'
      ? lastAssistant.content.text
      : lastAssistant?.content.type === 'assistant_tool_calls'
        ? lastAssistant.content.text ?? ''
        : 'Reached max processing limit.';

  const {deduped, counts} = dedupWithCounts(toolsUsed);
  return {
    response: fallback,
    toolsUsed: deduped,
    toolsCounts: counts,
    turns: maxTurns,
  };
}

function dedupWithCounts(tools: string[]): {
  deduped: string[];
  counts: number[];
} {
  const map = new Map<string, number>();
  for (const t of tools) {
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  return {
    deduped: [...map.keys()],
    counts: [...map.values()],
  };
}
