import type {Message, ToolDef, ToolCall, LlmResponse} from './types';

export async function callOpenAI(
  messages: Message[],
  tools: ToolDef[],
  apiKey: string,
  model: string,
  baseUrl = 'https://api.openai.com/v1',
): Promise<LlmResponse> {
  const {systemPrompt, apiMessages} = buildOpenAIMessages(messages);

  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    messages: apiMessages,
  };

  if (tools.length > 0) {
    body.tools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  // OpenAI uses a system message in the messages array, not a top-level field
  if (systemPrompt) {
    (body.messages as unknown[]).unshift({role: 'system', content: systemPrompt});
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 429) {
    throw new Error('Rate limited. Please try again in a moment.');
  }
  if (resp.status === 401) {
    throw new Error('Invalid API key. Check your OpenAI API key in Settings.');
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${text}`);
  }

  return parseOpenAIResponse(await resp.json());
}

function buildOpenAIMessages(messages: Message[]): {
  systemPrompt: string;
  apiMessages: Record<string, unknown>[];
} {
  let systemPrompt = '';
  const apiMessages: Record<string, unknown>[] = [];

  for (const msg of messages) {
    const c = msg.content;

    if (msg.role === 'system' && c.type === 'text') {
      if (systemPrompt) {
        systemPrompt += '\n\n';
      }
      systemPrompt += c.text;
      continue;
    }

    if (msg.role === 'user' && c.type === 'text') {
      apiMessages.push({role: 'user', content: c.text});
      continue;
    }

    if (msg.role === 'assistant' && c.type === 'text') {
      apiMessages.push({role: 'assistant', content: c.text});
      continue;
    }

    if (msg.role === 'assistant' && c.type === 'assistant_tool_calls') {
      apiMessages.push({
        role: 'assistant',
        content: c.text ?? null,
        tool_calls: c.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {name: tc.name, arguments: tc.arguments},
        })),
      });
      continue;
    }

    if (msg.role === 'tool' && c.type === 'tool_result') {
      apiMessages.push({
        role: 'tool',
        tool_call_id: c.toolCallId,
        content: c.content,
      });
      continue;
    }
  }

  return {systemPrompt, apiMessages};
}

function parseOpenAIResponse(body: {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        function: {name: string; arguments: string};
      }>;
    };
  }>;
  usage?: {prompt_tokens?: number; completion_tokens?: number};
}): LlmResponse {
  const choice = body.choices?.[0];
  const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map(tc => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));

  return {
    content: choice?.message?.content ?? undefined,
    toolCalls,
    usage: {
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
      // OpenAI does not expose prompt caching tokens in the standard API
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    },
  };
}
