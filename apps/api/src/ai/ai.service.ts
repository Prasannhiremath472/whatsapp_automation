import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiAgent, AiKnowledge, Conversation } from '@prisma/client';
import {
  describeMessage,
  type AiAgentDto,
  type AiKnowledgeDto,
  type AiSettingsDto,
  type AiTestReply,
  type SaveAiAgentRequest,
  type SaveKnowledgeRequest,
} from '@whatsapp-crm/shared-types';
import { decryptSecret, encryptSecret } from '../common/crypto/secret-box';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { HANDOFF_TOOL, buildSystemPrompt, toClaudeMessages } from './ai-prompt';
import { ClaudeClient, ClaudeError, type ClaudeResult } from './claude.client';

/** How many recent messages Claude sees. */
const HISTORY_LIMIT = 20;
/** Safety net against loops: at most this many bot messages in one chat per hour. */
const MAX_BOT_MESSAGES_PER_HOUR = 12;

const today = () => new Date(new Date().toISOString().slice(0, 10));

function toKnowledgeDto(k: AiKnowledge): AiKnowledgeDto {
  return { id: k.id, title: k.title, content: k.content, updatedAt: k.updatedAt.toISOString() };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly claude: ClaudeClient,
    private readonly inbox: InboxService,
  ) {}

  // ----- API key -----------------------------------------------------------

  async getSettings(tenantId: string): Promise<AiSettingsDto> {
    const s = await this.prisma.aiSettings.findUnique({ where: { tenantId } });
    return {
      hasKey: !!s?.anthropicKeyCipher,
      keyLast4: s?.keyLast4 ?? null,
      lastError: s?.lastError ?? null,
      lastErrorAt: s?.lastErrorAt?.toISOString() ?? null,
    };
  }

  async setKey(tenantId: string, apiKey: string): Promise<AiSettingsDto> {
    // Prove the key works before saving it.
    await this.ping(apiKey);
    const data = {
      anthropicKeyCipher: encryptSecret(apiKey, this.config.get<string>('ENCRYPTION_KEY')),
      keyLast4: apiKey.slice(-4),
      lastError: null,
      lastErrorAt: null,
    };
    await this.prisma.aiSettings.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
    return this.getSettings(tenantId);
  }

  async removeKey(tenantId: string): Promise<AiSettingsDto> {
    await this.prisma.aiSettings.updateMany({
      where: { tenantId },
      data: { anthropicKeyCipher: null, keyLast4: null, lastError: null, lastErrorAt: null },
    });
    // Without a key no agent can answer: stop them so the UI is honest.
    await this.prisma.aiAgent.updateMany({ where: { tenantId, status: 'active' }, data: { status: 'paused' } });
    return this.getSettings(tenantId);
  }

  private async ping(apiKey: string): Promise<void> {
    try {
      await this.claude.complete({
        apiKey,
        model: 'claude-haiku-5-5',
        system: 'Reply with the single word OK.',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 8,
      });
    } catch (err) {
      const e = err as ClaudeError;
      throw new BadRequestException(
        e.authFailure ? 'Anthropic rejected this API key. Check that you copied the whole key.' : `Could not reach Anthropic: ${e.message}`,
      );
    }
  }

  private async keyFor(tenantId: string): Promise<string | null> {
    const s = await this.prisma.aiSettings.findUnique({ where: { tenantId } });
    if (!s?.anthropicKeyCipher) return null;
    try {
      return decryptSecret(s.anthropicKeyCipher, this.config.get<string>('ENCRYPTION_KEY'));
    } catch {
      return null;
    }
  }

  private async recordError(tenantId: string, message: string): Promise<void> {
    await this.prisma.aiSettings.updateMany({ where: { tenantId }, data: { lastError: message.slice(0, 500), lastErrorAt: new Date() } });
  }

  // ----- Agents ------------------------------------------------------------

  private async toDto(agent: AiAgent & { knowledge: AiKnowledge[] }): Promise<AiAgentDto> {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const sum = await this.prisma.aiUsage.aggregate({
      where: { agentId: agent.id, day: { gte: since } },
      _sum: { requests: true, inputTokens: true, outputTokens: true, handovers: true, errors: true },
    });
    return {
      id: agent.id,
      name: agent.name,
      instructions: agent.instructions,
      model: agent.model,
      status: agent.status,
      handoverMessage: agent.handoverMessage,
      knowledge: agent.knowledge.map(toKnowledgeDto),
      usage: {
        requests: sum._sum.requests ?? 0,
        inputTokens: sum._sum.inputTokens ?? 0,
        outputTokens: sum._sum.outputTokens ?? 0,
        handovers: sum._sum.handovers ?? 0,
        errors: sum._sum.errors ?? 0,
      },
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    };
  }

  async listAgents(tenantId: string): Promise<AiAgentDto[]> {
    const agents = await this.prisma.aiAgent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: { knowledge: { orderBy: { createdAt: 'asc' } } },
    });
    return Promise.all(agents.map((a) => this.toDto(a)));
  }

  private async findOwned(tenantId: string, id: string) {
    const agent = await this.prisma.aiAgent.findFirst({ where: { id, tenantId }, include: { knowledge: { orderBy: { createdAt: 'asc' } } } });
    if (!agent) throw new NotFoundException('AI agent not found');
    return agent;
  }

  async createAgent(tenantId: string, input: SaveAiAgentRequest): Promise<AiAgentDto> {
    const created = await this.prisma.aiAgent.create({
      data: { tenantId, name: input.name, instructions: input.instructions, model: input.model, handoverMessage: input.handoverMessage, status: 'paused' },
      include: { knowledge: true },
    });
    return this.toDto(created);
  }

  async updateAgent(tenantId: string, id: string, input: SaveAiAgentRequest): Promise<AiAgentDto> {
    await this.findOwned(tenantId, id);
    const updated = await this.prisma.aiAgent.update({
      where: { id },
      data: { name: input.name, instructions: input.instructions, model: input.model, handoverMessage: input.handoverMessage },
      include: { knowledge: { orderBy: { createdAt: 'asc' } } },
    });
    return this.toDto(updated);
  }

  /** Only one agent answers customers at a time: activating one pauses the others. */
  async setAgentStatus(tenantId: string, id: string, status: 'active' | 'paused'): Promise<AiAgentDto> {
    await this.findOwned(tenantId, id);
    if (status === 'active') {
      if (!(await this.keyFor(tenantId))) {
        throw new ConflictException('Add your Anthropic API key first, then turn the agent on');
      }
      await this.prisma.aiAgent.updateMany({ where: { tenantId, status: 'active', NOT: { id } }, data: { status: 'paused' } });
    }
    const updated = await this.prisma.aiAgent.update({ where: { id }, data: { status }, include: { knowledge: { orderBy: { createdAt: 'asc' } } } });
    return this.toDto(updated);
  }

  async deleteAgent(tenantId: string, id: string): Promise<void> {
    await this.findOwned(tenantId, id);
    await this.prisma.aiAgent.delete({ where: { id } });
  }

  // ----- Knowledge ---------------------------------------------------------

  async addKnowledge(tenantId: string, agentId: string, input: SaveKnowledgeRequest): Promise<AiKnowledgeDto> {
    await this.findOwned(tenantId, agentId);
    const count = await this.prisma.aiKnowledge.count({ where: { agentId } });
    if (count >= 100) throw new BadRequestException('An agent can have at most 100 knowledge entries');
    return toKnowledgeDto(await this.prisma.aiKnowledge.create({ data: { agentId, tenantId, title: input.title, content: input.content } }));
  }

  async updateKnowledge(tenantId: string, agentId: string, knowledgeId: string, input: SaveKnowledgeRequest): Promise<AiKnowledgeDto> {
    const entry = await this.prisma.aiKnowledge.findFirst({ where: { id: knowledgeId, agentId, tenantId } });
    if (!entry) throw new NotFoundException('Knowledge entry not found');
    return toKnowledgeDto(await this.prisma.aiKnowledge.update({ where: { id: knowledgeId }, data: { title: input.title, content: input.content } }));
  }

  async deleteKnowledge(tenantId: string, agentId: string, knowledgeId: string): Promise<void> {
    const entry = await this.prisma.aiKnowledge.findFirst({ where: { id: knowledgeId, agentId, tenantId } });
    if (!entry) throw new NotFoundException('Knowledge entry not found');
    await this.prisma.aiKnowledge.delete({ where: { id: knowledgeId } });
  }

  // ----- Talking to Claude -------------------------------------------------

  private async ask(
    tenantId: string,
    agent: AiAgent & { knowledge: AiKnowledge[] },
    apiKey: string,
    messages: ReturnType<typeof toClaudeMessages>,
  ): Promise<ClaudeResult> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } });
    return this.claude.complete({
      apiKey,
      model: agent.model,
      system: buildSystemPrompt({ agentName: agent.name, businessName: tenant.name, instructions: agent.instructions, knowledge: agent.knowledge }),
      messages,
      tools: [HANDOFF_TOOL],
    });
  }

  private async bumpUsage(tenantId: string, agentId: string, delta: { requests?: number; inputTokens?: number; outputTokens?: number; handovers?: number; errors?: number }) {
    const day = today();
    await this.prisma.aiUsage.upsert({
      where: { agentId_day: { agentId, day } },
      update: Object.fromEntries(Object.entries(delta).map(([k, v]) => [k, { increment: v }])),
      create: { tenantId, agentId, day, requests: 0, inputTokens: 0, outputTokens: 0, handovers: 0, errors: 0, ...delta },
    });
  }

  /** The test chat in the UI: asks Claude with the agent's real settings but sends nothing to WhatsApp. */
  async testAgent(tenantId: string, agentId: string, messages: { role: 'user' | 'assistant'; text: string }[]): Promise<AiTestReply> {
    const agent = await this.findOwned(tenantId, agentId);
    const apiKey = await this.keyFor(tenantId);
    if (!apiKey) throw new BadRequestException('Add your Anthropic API key first');
    const history = toClaudeMessages(messages.map((m) => ({ direction: m.role === 'user' ? 'inbound' : 'outbound', text: m.text })));
    if (history.length === 0) throw new BadRequestException('Send a message to test the agent');
    try {
      const result = await this.ask(tenantId, agent, apiKey, history);
      await this.bumpUsage(tenantId, agent.id, { requests: 1, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
      const handedOver = result.toolUse === 'handoff_to_human';
      return { text: handedOver ? agent.handoverMessage : result.text, handedOver, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
    } catch (err) {
      await this.bumpUsage(tenantId, agent.id, { errors: 1 });
      throw new BadRequestException(`Claude could not answer: ${(err as Error).message}`);
    }
  }

  /**
   * Answers a customer message with the business's active agent. Returns true
   * when the AI took responsibility for the message (replied or handed over).
   */
  async handleInbound(tenantId: string, conversation: Conversation): Promise<boolean> {
    if (conversation.aiPaused || conversation.status === 'closed' || conversation.assignedAgentId) return false;

    const agent = await this.prisma.aiAgent.findFirst({
      where: { tenantId, status: 'active' },
      include: { knowledge: { orderBy: { createdAt: 'asc' } } },
    });
    if (!agent) return false;
    const apiKey = await this.keyFor(tenantId);
    if (!apiKey) return false;

    const recentBot = await this.prisma.message.count({
      where: { tenantId, conversationId: conversation.id, direction: 'outbound', senderType: 'bot', createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recentBot >= MAX_BOT_MESSAGES_PER_HOUR) {
      await this.inbox.setAiPaused(tenantId, conversation.id, true);
      return false;
    }

    const rows = await this.prisma.message.findMany({
      where: { tenantId, conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: { direction: true, messageType: true, content: true },
    });
    const history = toClaudeMessages(
      rows.reverse().map((m) => ({ direction: m.direction, text: describeMessage(m.messageType, m.content) })),
    );
    if (history.length === 0) return false;

    try {
      const result = await this.ask(tenantId, agent, apiKey, history);
      await this.bumpUsage(tenantId, agent.id, { requests: 1, inputTokens: result.inputTokens, outputTokens: result.outputTokens });

      if (result.toolUse === 'handoff_to_human' || !result.text) {
        await this.handOver(tenantId, conversation.id, agent);
        return true;
      }
      await this.inbox.sendBotReply(tenantId, conversation.id, result.text);
      return true;
    } catch (err) {
      const message = err instanceof ClaudeError ? err.message : (err as Error).message;
      this.logger.warn(`AI reply failed tenantId=${tenantId} conversationId=${conversation.id}: ${message}`);
      await this.bumpUsage(tenantId, agent.id, { errors: 1 });
      await this.recordError(tenantId, message);
      // Flag the chat for a person instead of leaving the customer unanswered.
      await this.inbox.updateConversationStatus(tenantId, conversation.id, 'pending');
      await this.inbox.setAiPaused(tenantId, conversation.id, true);
      return true;
    }
  }

  private async handOver(tenantId: string, conversationId: string, agent: AiAgent): Promise<void> {
    await this.inbox.sendBotReply(tenantId, conversationId, agent.handoverMessage);
    await this.inbox.updateConversationStatus(tenantId, conversationId, 'pending');
    await this.inbox.setAiPaused(tenantId, conversationId, true);
    await this.bumpUsage(tenantId, agent.id, { handovers: 1 });
  }
}
