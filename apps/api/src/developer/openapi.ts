import { API_SCOPES } from '@whatsapp-crm/shared-types';

/** The public API described in OpenAPI 3.0, served at GET /public/v1/openapi.json and shown in the docs page. */
export function buildOpenApi(serverUrl: string) {
  const bearer = [{ bearerAuth: [] as string[] }];
  const err = (description: string) => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });
  return {
    openapi: '3.0.3',
    info: {
      title: 'Genie public API',
      version: '1.0.0',
      description:
        'Send WhatsApp messages and manage contacts from your own software. Create an API key in Genie (Get Started, then API Keys) and send it as "Authorization: Bearer gk_live_...". ' +
        'Each key has permissions (scopes) and is limited to 120 requests a minute. Messages to people who have not written to you in the last 24 hours must be approved templates.',
    },
    servers: [{ url: serverUrl }],
    security: bearer,
    paths: {
      '/public/v1/messages': {
        post: {
          summary: 'Send a message',
          description: `Scope: messages:send. Send an approved template to any WhatsApp number, or free text inside the 24-hour window after the customer's last message.`,
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SendMessage' }, examples: {
            template: { summary: 'Template', value: { to: '+919876543210', type: 'template', template: { name: 'order_update', language: 'en', variables: ['Priya', '#1042'] } } },
            text: { summary: 'Free text (24-hour window)', value: { to: '+919876543210', type: 'text', text: 'Your order has shipped.' } },
          } } } },
          responses: { 201: { description: 'Accepted by WhatsApp', content: { 'application/json': { schema: { $ref: '#/components/schemas/Message' } } } }, 400: err('Invalid request'), 401: err('Missing or invalid API key'), 403: err('Key lacks the scope'), 404: err('Template not found or not approved'), 409: err('No WhatsApp number connected'), 422: err('Opted-out contact or closed 24-hour window'), 429: err('Rate limit exceeded'), 502: err('WhatsApp rejected the message') },
        },
      },
      '/public/v1/messages/{id}': {
        get: {
          summary: 'Get a message and its delivery status',
          description: 'Scope: messages:read. Status moves queued, sent, delivered, read (or failed).',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'The message', content: { 'application/json': { schema: { $ref: '#/components/schemas/Message' } } } }, 404: err('Not found') },
        },
      },
      '/public/v1/contacts': {
        get: {
          summary: 'List contacts',
          description: 'Scope: contacts:read.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
            { name: 'q', in: 'query', description: 'Search name, phone or email', schema: { type: 'string' } },
            { name: 'tag', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'A page of contacts: { data: [...], meta: { page, pageSize, total, totalPages } }' } },
        },
        post: {
          summary: 'Create or update a contact',
          description: 'Scope: contacts:write. If the phone number already exists the contact is updated and any new tags are added.',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Contact' } } } },
          responses: { 200: { description: 'Updated' }, 201: { description: 'Created' }, 400: err('Invalid request') },
        },
      },
      '/public/v1/templates': {
        get: { summary: 'List approved templates', description: 'Scope: templates:read.', responses: { 200: { description: 'Approved templates you can send' } } },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'gk_live_...' } },
      schemas: {
        Error: { type: 'object', properties: { statusCode: { type: 'integer' }, message: { type: 'string' }, error: { type: 'string' } } },
        SendMessage: {
          oneOf: [
            { type: 'object', required: ['to', 'type', 'template'], properties: { to: { type: 'string', example: '+919876543210' }, type: { type: 'string', enum: ['template'] }, template: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, language: { type: 'string', default: 'en' }, variables: { type: 'array', items: { type: 'string' } }, headerMediaUrl: { type: 'string', description: 'https link, for image/video/document headers' } } }, defaultCountryCode: { type: 'string', example: '91' } } },
            { type: 'object', required: ['to', 'type', 'text'], properties: { to: { type: 'string' }, type: { type: 'string', enum: ['text'] }, text: { type: 'string' }, defaultCountryCode: { type: 'string' } } },
          ],
        },
        Message: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, to: { type: 'string' }, type: { type: 'string' }, status: { type: 'string', enum: ['queued', 'sent', 'delivered', 'read', 'failed'] }, waMessageId: { type: 'string', nullable: true }, conversationId: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' }, error: { type: 'string', nullable: true } } },
        Contact: { type: 'object', required: ['phone'], properties: { phone: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, location: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, defaultCountryCode: { type: 'string' } } },
      },
    },
    'x-scopes': API_SCOPES,
  };
}
