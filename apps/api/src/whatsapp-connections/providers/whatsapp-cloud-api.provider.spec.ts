import axios from 'axios';
import type { ConfigService } from '@nestjs/config';
import type { WhatsappConnection } from '@prisma/client';
import { encryptSecret } from '../../common/crypto/secret-box';
import { WhatsAppCloudApiProvider } from './whatsapp-cloud-api.provider';

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return { ...actual, __esModule: true, default: { ...actual.default, post: jest.fn(), get: jest.fn() } };
});

const KEY = '0'.repeat(64);

function provider(appId: string | undefined) {
  const config = {
    get: (k: string) => ({ META_APP_ID: appId, ENCRYPTION_KEY: KEY, META_GRAPH_API_VERSION: 'v21.0' })[k],
  } as unknown as ConfigService;
  return new WhatsAppCloudApiProvider(config);
}

const connection = {
  id: 'c1',
  wabaId: 'waba-1',
  phoneNumberId: 'pn-1',
  accessTokenEncrypted: encryptSecret('TOKEN', KEY),
} as unknown as WhatsappConnection;

const sample = { data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png' as const, filename: 'offer.png' };
const base = { name: 'offer', language: 'en', category: 'MARKETING' as const, body: 'Hi', buttons: [] };

describe('WhatsAppCloudApiProvider.submitTemplate (image header)', () => {
  const post = axios.post as unknown as jest.Mock;
  beforeEach(() => post.mockReset());

  it('uploads the sample through Meta resumable upload, then submits the handle as the header example', async () => {
    post
      .mockResolvedValueOnce({ data: { id: 'upload:SESSION' } }) // open session
      .mockResolvedValueOnce({ data: { h: 'HANDLE-123' } }) // send bytes
      .mockResolvedValueOnce({ data: { id: 'tpl-1', status: 'PENDING' } }); // create template

    const result = await provider('APP1').submitTemplate(connection, { ...base, headerType: 'image', headerSample: sample });

    expect(result).toEqual({ metaTemplateId: 'tpl-1', status: 'pending' });
    const [sessionUrl, , sessionOpts] = post.mock.calls[0];
    expect(sessionUrl).toBe('https://graph.facebook.com/v21.0/APP1/uploads');
    expect(sessionOpts.params).toEqual({ file_length: 4, file_type: 'image/png', file_name: 'offer.png' });
    const [uploadUrl, bytes, uploadOpts] = post.mock.calls[1];
    expect(uploadUrl).toBe('https://graph.facebook.com/v21.0/upload:SESSION');
    expect(bytes).toBe(sample.data);
    expect(uploadOpts.headers).toMatchObject({ Authorization: 'OAuth TOKEN', file_offset: '0' });
    const [, template] = post.mock.calls[2];
    expect(template.components[0]).toEqual({ type: 'HEADER', format: 'IMAGE', example: { header_handle: ['HANDLE-123'] } });
  });

  it('fails clearly when META_APP_ID is not configured, without calling Meta', async () => {
    await expect(
      provider(undefined).submitTemplate(connection, { ...base, headerType: 'image', headerSample: sample }),
    ).rejects.toThrow(/META_APP_ID/);
    expect(post).not.toHaveBeenCalled();
  });

  it('still asks for WhatsApp Manager for video and document headers', async () => {
    await expect(provider('APP1').submitTemplate(connection, { ...base, headerType: 'video' })).rejects.toThrow(/WhatsApp Manager/);
  });
});
