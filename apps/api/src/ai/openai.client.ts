import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ClaudeError, type ClaudeMessage, type ClaudeResult, type ClaudeTool } from './claude.client';

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const MODELS_URL = 'https://api.openai.com/v1/models';

/** Errors from either AI provider share one shape so the rest of the code does not care which is used. */
export { ClaudeError as LlmError };

/** Minimal client for OpenAI's Chat Completions API (no SDK dependency). Returns the same result shape as ClaudeClient. */
@Injectable()
export class OpenAiClient {
  /** Cheap, free-of-tokens check that a key is valid. */
  async verifyKey(apiKey: string): Promise<void> {
    try {
      await axios.get(MODELS_URL, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 20_000 });
    } catch (err) {
      throw this.toError(err);
    }
  }

  async complete(params: {
    apiKey: string;
    model: string;
    system: string;
    messages: ClaudeMessage[];
    tools?: ClaudeTool[];
    maxTokens?: number;
  }): Promise<ClaudeResult> {
    try {
      const res = await axios.post<{
        choices?: { message?: { content?: string | null; tool_calls?: { function?: { name?: string } }[] } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>(
        CHAT_URL,
        {
          model: params.model,
          max_completion_tokens: params.maxTokens ?? 600,
          messages: [{ role: 'system', content: params.system }, ...params.messages],
          ...(params.tools?.length
            ? { tools: params.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) }
            : {}),
        },
        { headers: { Authorization: `Bearer ${params.apiKey}`, 'content-type': 'application/json' }, timeout: 45_000 },
      );
      const message = res.data.choices?.[0]?.message;
      return {
        text: (message?.content ?? '').trim(),
        toolUse: message?.tool_calls?.[0]?.function?.name ?? null,
        inputTokens: res.data.usage?.prompt_tokens ?? 0,
        outputTokens: res.data.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      throw this.toError(err);
    }
  }

  private toError(err: unknown): ClaudeError {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const apiMessage = (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
      return new ClaudeError(apiMessage ?? err.message, status, status === 401 || status === 403);
    }
    return new ClaudeError(err instanceof Error ? err.message : String(err));
  }
}
