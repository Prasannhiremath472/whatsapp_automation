import { Injectable, Logger } from '@nestjs/common';
import type { Automation, AutomationRun, Conversation, Contact } from '@prisma/client';
import {
  matchesKeywords,
  TriggerConfigSchema,
  AutomationStepSchema,
  type AutomationStep,
  type TriggerConfig,
} from '@whatsapp-crm/shared-types';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';

/** Order automations are tried in: the most specific trigger wins. */
const TRIGGER_PRIORITY: Record<string, number> = { keyword: 0, first_message: 1, any_message: 2 };

/** Replaces {{name}}, {{first_name}} and {{phone}} in a step's text with the contact's details. */
export function fillContactPlaceholders(text: string, contact: Pick<Contact, 'displayName' | 'profileName' | 'waId'>): string {
  const name = contact.displayName || contact.profileName || '';
  const firstName = name.split(/\s+/)[0] ?? '';
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, name || 'there')
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName || 'there')
    .replace(/\{\{\s*phone\s*\}\}/gi, `+${contact.waId}`);
}

/**
 * Finds the automation that matches an inbound customer message and runs its
 * steps. At most one automation runs per message (keyword rules first, then
 * "first message", then "any message"), and the same automation never repeats
 * in a chat within its cooldown.
 */
@Injectable()
export class AutomationEngine {
  private readonly logger = new Logger(AutomationEngine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  /** Returns true when an automation handled the message (so nothing else should answer it). */
  async handleInbound(tenantId: string, conversation: Conversation, text: string): Promise<boolean> {
    const automations = await this.prisma.automation.findMany({ where: { tenantId, status: 'active' }, orderBy: { createdAt: 'asc' } });
    if (automations.length === 0) return false;
    automations.sort((a, b) => (TRIGGER_PRIORITY[a.triggerType] ?? 9) - (TRIGGER_PRIORITY[b.triggerType] ?? 9));

    const inboundCount = await this.prisma.message.count({
      where: { tenantId, conversationId: conversation.id, direction: 'inbound' },
    });

    for (const automation of automations) {
      if (!(await this.triggerMatches(automation, text, inboundCount))) continue;
      if (await this.inCooldown(automation, conversation.id)) continue;
      await this.start(automation, conversation);
      return true;
    }
    return false;
  }

  private async triggerMatches(automation: Automation, text: string, inboundCount: number): Promise<boolean> {
    switch (automation.triggerType) {
      case 'any_message':
        return true;
      case 'first_message':
        return inboundCount <= 1;
      case 'keyword': {
        const config = TriggerConfigSchema.safeParse(automation.triggerConfig);
        return config.success && matchesKeywords(text, config.data as TriggerConfig);
      }
      default:
        return false;
    }
  }

  private async inCooldown(automation: Automation, conversationId: string): Promise<boolean> {
    if (automation.cooldownMinutes <= 0) return false;
    const since = new Date(Date.now() - automation.cooldownMinutes * 60_000);
    const recent = await this.prisma.automationRun.count({
      where: { automationId: automation.id, conversationId, createdAt: { gte: since } },
    });
    return recent > 0;
  }

  private async start(automation: Automation, conversation: Conversation): Promise<void> {
    const run = await this.prisma.automationRun.create({
      data: {
        automationId: automation.id,
        tenantId: automation.tenantId,
        conversationId: conversation.id,
        status: 'running',
        lockedUntil: new Date(Date.now() + 2 * 60_000), // a crash mid-run is picked up again by the scheduler
      },
    });
    await this.prisma.automation.update({
      where: { id: automation.id },
      data: { runCount: { increment: 1 }, lastRunAt: new Date() },
    });
    await this.execute(run, automation);
  }

  /** Runs (or resumes) a run from its current step until it finishes, waits or fails. */
  async execute(run: AutomationRun, automation?: Automation): Promise<void> {
    const rule = automation ?? (await this.prisma.automation.findUnique({ where: { id: run.automationId } }));
    if (!rule) return this.finish(run.id, 'failed', 'The automation was deleted');

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: run.conversationId },
      include: { contact: true },
    });
    if (!conversation) return this.finish(run.id, 'failed', 'The conversation no longer exists');

    const steps = (Array.isArray(rule.steps) ? rule.steps : []).map((raw) => AutomationStepSchema.safeParse(raw));
    for (let i = run.stepIndex; i < steps.length; i += 1) {
      const parsed = steps[i]!;
      if (!parsed.success) return this.finish(run.id, 'failed', `Step ${i + 1} is not valid`);
      const step = parsed.data;

      if (step.type === 'wait') {
        await this.prisma.automationRun.update({
          where: { id: run.id },
          data: { status: 'waiting', stepIndex: i + 1, resumeAt: new Date(Date.now() + step.minutes * 60_000), lockedUntil: null },
        });
        return;
      }

      try {
        await this.perform(step, conversation, conversation.contact);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Automation ${rule.id} step ${i + 1} (${step.type}) failed: ${message}`);
        return this.finish(run.id, 'failed', `Step ${i + 1}: ${message}`);
      }
      await this.prisma.automationRun.update({ where: { id: run.id }, data: { stepIndex: i + 1 } });
    }
    await this.finish(run.id, 'completed');
  }

  private async perform(step: Exclude<AutomationStep, { type: 'wait' }>, conversation: Conversation, contact: Contact): Promise<void> {
    const { tenantId, id: conversationId } = conversation;
    switch (step.type) {
      case 'send_text': {
        const windowEnd = await this.inbox.ensureReplyWindow(conversation);
        if (!windowEnd || windowEnd.getTime() < Date.now()) {
          throw new Error('The 24-hour reply window has closed; use a template step instead');
        }
        await this.inbox.sendBotReply(tenantId, conversationId, fillContactPlaceholders(step.text, contact));
        return;
      }
      case 'send_template': {
        const bodyVars = step.bodyVars.map((v) => fillContactPlaceholders(v, contact));
        await this.inbox.sendTemplateMessage(tenantId, conversationId, null, { templateId: step.templateId, bodyVars, headerVars: [] });
        return;
      }
      case 'add_tag': {
        const tag = await this.prisma.tag.upsert({
          where: { tenantId_name: { tenantId, name: step.tag } },
          update: {},
          create: { tenantId, name: step.tag },
        });
        await this.prisma.contactTag.upsert({
          where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
          update: {},
          create: { contactId: contact.id, tagId: tag.id },
        });
        return;
      }
      case 'assign':
        await this.inbox.assignConversation(tenantId, conversationId, step.agentUserId);
        return;
      case 'set_status':
        await this.inbox.updateConversationStatus(tenantId, conversationId, step.status);
        return;
      case 'handover_human':
        await this.inbox.setAiPaused(tenantId, conversationId, true);
        return;
    }
  }

  private async finish(runId: string, status: 'completed' | 'failed', error?: string): Promise<void> {
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: { status, resumeAt: null, lockedUntil: null, error: error ? error.slice(0, 500) : null },
    });
  }
}
