import type {
  Message,
  ToolDef,
  ToolCall,
  LlmResponse,
} from './types';

export async function callClaude(
  messages: Message[],
  tools: ToolDef[],
  apiKey: string,
  model: string,
): Promise<LlmResponse> {
  const {systemPrompt, apiMessages} = buildClaudeMessages(messages);

  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    messages: apiMessages,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }
  if (tools.length > 0) {
    body.tools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 429) {
    throw new Error('Rate limited. Please try again in a moment.');
  }
  if (resp.status === 401) {
    throw new Error('Invalid API key. Check your Claude API key in Settings.');
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Claude API error ${resp.status}: ${text}`);
  }

  return parseClaudeResponse(await resp.json());
}

// TODO: Add streaming support (streamClaude) in Phase 2
// React Native needs TextDecoder polyfill + ReadableStream for SSE streaming

function buildClaudeMessages(messages: Message[]) {
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

    if (msg.role === 'user' && c.type === 'image') {
      apiMessages.push({
        role: 'user',
        content: [
          {
            type: 'image',
            source: {type: 'base64', media_type: c.mediaType, data: c.imageBase64},
          },
          {type: 'text', text: c.text},
        ],
      });
      continue;
    }

    if (msg.role === 'user' && c.type === 'multi_content') {
      const blocks: Record<string, unknown>[] = c.images.map(img => ({
        type: 'image',
        source: {type: 'base64', media_type: img.mediaType, data: img.base64},
      }));
      if (c.text) {
        blocks.push({type: 'text', text: c.text});
      }
      apiMessages.push({role: 'user', content: blocks});
      continue;
    }

    if (msg.role === 'assistant' && c.type === 'text') {
      apiMessages.push({role: 'assistant', content: c.text});
      continue;
    }

    if (msg.role === 'assistant' && c.type === 'assistant_tool_calls') {
      const blocks: Record<string, unknown>[] = [];
      if (c.text) {
        blocks.push({type: 'text', text: c.text});
      }
      for (const tc of c.toolCalls) {
        let input: unknown = {};
        try {
          input = JSON.parse(tc.arguments);
        } catch {}
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input,
        });
      }
      apiMessages.push({role: 'assistant', content: blocks});
      continue;
    }

    if (msg.role === 'tool' && c.type === 'tool_result') {
      const resultContent: unknown = c.imageBase64
        ? [
            {
              type: 'image',
              source: {type: 'base64', media_type: c.imageMediaType, data: c.imageBase64},
            },
            {type: 'text', text: c.content},
          ]
        : c.content;
      const resultBlock = {
        type: 'tool_result',
        tool_use_id: c.toolCallId,
        content: resultContent,
      };
      const last = apiMessages[apiMessages.length - 1];
      if (
        last?.role === 'user' &&
        Array.isArray(last.content) &&
        (last.content as any[])[0]?.type === 'tool_result'
      ) {
        (last.content as any[]).push(resultBlock);
      } else {
        apiMessages.push({role: 'user', content: [resultBlock]});
      }
      continue;
    }
  }

  return {systemPrompt, apiMessages};
}

function parseClaudeResponse(body: any): LlmResponse {
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of body.content ?? []) {
    if (block.type === 'text') {
      textParts.push(block.text);
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id ?? '',
        name: block.name ?? '',
        arguments: JSON.stringify(block.input ?? {}),
      });
    }
  }

  return {
    content: textParts.length > 0 ? textParts.join('\n') : undefined,
    toolCalls,
    usage: {
      promptTokens: body.usage?.input_tokens ?? 0,
      completionTokens: body.usage?.output_tokens ?? 0,
      cacheCreationTokens: body.usage?.cache_creation_input_tokens ?? 0,
      cacheReadTokens: body.usage?.cache_read_input_tokens ?? 0,
    },
  };
}
