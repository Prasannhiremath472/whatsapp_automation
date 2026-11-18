import axios from 'axios';
import { ClaudeError } from './claude.client';
import { OpenAiClient } from './openai.client';
import { HANDOFF_TOOL } from './ai-prompt';

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return { ...actual, __esModule: true, default: { ...actual.default, post: jest.fn(), get: jest.fn() } };
});

const post = axios.post as unknown as jest.Mock;
const get = axios.get as unknown as jest.Mock;

describe('OpenAiClient', () => {
  const client = new OpenAiClient();
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
  });

  it('sends the system prompt first, converts the tool, and reads text and token counts', async () => {
    post.mockResolvedValue({ data: { choices: [{ message: { content: ' We open at 10. ' } }], usage: { prompt_tokens: 120, completion_tokens: 9 } } });
    const result = await client.complete({
      apiKey: 'sk-test', model: 'gpt-4o-mini', system: 'You are Asha.',
      messages: [{ role: 'user', content: 'When do you open?' }], tools: [HANDOFF_TOOL],
    });
    expect(result).toEqual({ text: 'We open at 10.', toolUse: null, inputTokens: 120, outputTokens: 9 });

    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(config.headers.Authorization).toBe('Bearer sk-test');
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.max_completion_tokens).toBe(600);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are Asha.' },
      { role: 'user', content: 'When do you open?' },
    ]);
    expect(body.tools).toEqual([
      { type: 'function', function: { name: 'handoff_to_human', description: HANDOFF_TOOL.description, parameters: HANDOFF_TOOL.input_schema } },
    ]);
  });

  it('reports a handover when the model calls the tool', async () => {
    post.mockResolvedValue({ data: { choices: [{ message: { content: null, tool_calls: [{ function: { name: 'handoff_to_human' } }] } }], usage: { prompt_tokens: 5, completion_tokens: 3 } } });
    const result = await client.complete({ apiKey: 'k', model: 'gpt-4o', system: 's', messages: [{ role: 'user', content: 'a person please' }], tools: [HANDOFF_TOOL] });
    expect(result).toMatchObject({ text: '', toolUse: 'handoff_to_human' });
  });

  it('turns API failures into LlmErrors, marking bad keys as auth failures', async () => {
    const failure = (status: number, message: string) => Object.assign(new Error(message), { isAxiosError: true, response: { status, data: { error: { message } } } });
    post.mockRejectedValueOnce(failure(401, 'Incorrect API key provided'));
    await expect(client.complete({ apiKey: 'k', model: 'm', system: 's', messages: [] })).rejects.toMatchObject({ authFailure: true, status: 401, message: 'Incorrect API key provided' });
    post.mockRejectedValueOnce(failure(429, 'You exceeded your current quota'));
    const quota = await client.complete({ apiKey: 'k', model: 'm', system: 's', messages: [] }).catch((e: ClaudeError) => e);
    expect(quota).toMatchObject({ authFailure: false, status: 429 });
  });

  it('verifies a key with the free models call', async () => {
    get.mockResolvedValue({ data: { data: [] } });
    await expect(client.verifyKey('sk-good')).resolves.toBeUndefined();
    expect(get.mock.calls[0][0]).toBe('https://api.openai.com/v1/models');
    get.mockRejectedValue(Object.assign(new Error('bad'), { isAxiosError: true, response: { status: 401, data: { error: { message: 'Incorrect API key' } } } }));
    await expect(client.verifyKey('sk-bad')).rejects.toMatchObject({ authFailure: true });
  });
});
