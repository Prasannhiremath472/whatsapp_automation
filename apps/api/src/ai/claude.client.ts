import { Injectable } from '@nestjs/common';
import axios from 'axios';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeResult {
  text: string;
  /** Name of the tool Claude asked to call, if any. */
  toolUse: string | null;
  inputTokens: number;
  outputTokens: number;
}

export class ClaudeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** The API key was rejected or lacks access: retrying will not help. */
    readonly authFailure = false,
  ) {
    super(message);
    this.name = 'ClaudeError';
  }
}

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/** Minimal client for the Anthropic Messages API (no SDK dependency). */
@Injectable()
export class ClaudeClient {
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
        content?: { type: string; text?: string; name?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      }>(
        API_URL,
        {
          model: params.model,
          max_tokens: params.maxTokens ?? 600,
          system: params.system,
          messages: params.messages,
          ...(params.tools?.length ? { tools: params.tools } : {}),
        },
        {
          headers: { 'x-api-key': params.apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
          timeout: 45_000,
        },
      );
      const blocks = res.data.content ?? [];
      return {
        text: blocks
          .filter((b) => b.type === 'text' && b.text)
          .map((b) => b.text)
          .join('\n')
          .trim(),
        toolUse: blocks.find((b) => b.type === 'tool_use')?.name ?? null,
        inputTokens: res.data.usage?.input_tokens ?? 0,
        outputTokens: res.data.usage?.output_tokens ?? 0,
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const apiMessage = (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
        throw new ClaudeError(apiMessage ?? err.message, status, status === 401 || status === 403);
      }
      throw new ClaudeError(err instanceof Error ? err.message : String(err));
    }
  }
}
