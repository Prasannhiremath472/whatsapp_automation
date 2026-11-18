import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import {
  SaveAiAgentRequestSchema,
  SaveKnowledgeRequestSchema,
  SetAiAgentStatusRequestSchema,
  SetAiKeyRequestSchema,
  TestAiAgentRequestSchema,
  type AiAgentDto,
  type AiKnowledgeDto,
  type AiSettingsDto,
  type AiTestReply,
  type SaveAiAgentRequest,
  type SaveKnowledgeRequest,
  type SetAiKeyRequest,
} from '@whatsapp-crm/shared-types';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AiService } from './ai.service';

@Controller('ai')
@Roles('tenant_admin')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('settings')
  @Roles('tenant_admin', 'agent')
  settings(@TenantId() tenantId: string): Promise<AiSettingsDto> {
    return this.ai.getSettings(tenantId);
  }

  @Put('settings/key')
  setKey(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(SetAiKeyRequestSchema)) body: SetAiKeyRequest,
  ): Promise<AiSettingsDto> {
    return this.ai.setKey(tenantId, body.provider, body.apiKey);
  }

  @Delete('settings/key')
  removeKey(@TenantId() tenantId: string): Promise<AiSettingsDto> {
    return this.ai.removeKey(tenantId);
  }

  @Get('agents')
  @Roles('tenant_admin', 'agent')
  list(@TenantId() tenantId: string): Promise<AiAgentDto[]> {
    return this.ai.listAgents(tenantId);
  }

  @Post('agents')
  create(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(SaveAiAgentRequestSchema)) body: SaveAiAgentRequest,
  ): Promise<AiAgentDto> {
    return this.ai.createAgent(tenantId, body);
  }

  @Put('agents/:id')
  update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SaveAiAgentRequestSchema)) body: SaveAiAgentRequest,
  ): Promise<AiAgentDto> {
    return this.ai.updateAgent(tenantId, id, body);
  }

  @Patch('agents/:id/status')
  setStatus(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetAiAgentStatusRequestSchema)) body: { status: 'active' | 'paused' },
  ): Promise<AiAgentDto> {
    return this.ai.setAgentStatus(tenantId, id, body.status);
  }

  @Delete('agents/:id')
  @HttpCode(204)
  remove(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.ai.deleteAgent(tenantId, id);
  }

  @Post('agents/:id/test')
  @HttpCode(200)
  test(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(TestAiAgentRequestSchema)) body: { messages: { role: 'user' | 'assistant'; text: string }[] },
  ): Promise<AiTestReply> {
    return this.ai.testAgent(tenantId, id, body.messages);
  }

  @Post('agents/:id/knowledge')
  addKnowledge(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SaveKnowledgeRequestSchema)) body: SaveKnowledgeRequest,
  ): Promise<AiKnowledgeDto> {
    return this.ai.addKnowledge(tenantId, id, body);
  }

  @Put('agents/:id/knowledge/:knowledgeId')
  updateKnowledge(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('knowledgeId', ParseUUIDPipe) knowledgeId: string,
    @Body(new ZodValidationPipe(SaveKnowledgeRequestSchema)) body: SaveKnowledgeRequest,
  ): Promise<AiKnowledgeDto> {
    return this.ai.updateKnowledge(tenantId, id, knowledgeId, body);
  }

  @Delete('agents/:id/knowledge/:knowledgeId')
  @HttpCode(204)
  removeKnowledge(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('knowledgeId', ParseUUIDPipe) knowledgeId: string,
  ): Promise<void> {
    return this.ai.deleteKnowledge(tenantId, id, knowledgeId);
  }
}
