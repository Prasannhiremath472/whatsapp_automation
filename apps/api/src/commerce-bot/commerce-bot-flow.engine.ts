import { Injectable, Logger } from '@nestjs/common';
import type { BotSession, Conversation, Message, Tenant } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxService } from '../inbox/inbox.service';
import { CatalogService } from './catalog.service';
import { OrderPricingService } from './order-pricing.service';
import { asBotContextData, type AddressDraft, type BotContextData, type SelectedConfigEntry } from './commerce-bot-context.types';
import { extractReplyId, extractText, isStartTrigger, parseConfigRowId, parsePrefixedId } from './interactive-message.helpers';

const ADDRESS_STEPS = [
  'COLLECTING_ADDRESS_NAME',
  'COLLECTING_ADDRESS_COMPANY',
  'COLLECTING_ADDRESS_MOBILE',
  'COLLECTING_ADDRESS_EMAIL',
  'COLLECTING_ADDRESS_GST',
  'COLLECTING_ADDRESS_LINE',
  'COLLECTING_ADDRESS_CITY',
  'COLLECTING_ADDRESS_STATE',
  'COLLECTING_ADDRESS_PIN',
] as const;

const ADDRESS_FIELD_BY_STEP: Record<(typeof ADDRESS_STEPS)[number], keyof AddressDraft> = {
  COLLECTING_ADDRESS_NAME: 'name',
  COLLECTING_ADDRESS_COMPANY: 'company',
  COLLECTING_ADDRESS_MOBILE: 'mobile',
  COLLECTING_ADDRESS_EMAIL: 'email',
  COLLECTING_ADDRESS_GST: 'gstNumber',
  COLLECTING_ADDRESS_LINE: 'addressLine',
  COLLECTING_ADDRESS_CITY: 'city',
  COLLECTING_ADDRESS_STATE: 'state',
  COLLECTING_ADDRESS_PIN: 'pin',
};

const ADDRESS_PROMPTS: Record<(typeof ADDRESS_STEPS)[number], string> = {
  COLLECTING_ADDRESS_NAME: "Let's get your delivery details. What's your full name?",
  COLLECTING_ADDRESS_COMPANY: 'Company name? (reply "skip" if not applicable)',
  COLLECTING_ADDRESS_MOBILE: 'Your mobile number?',
  COLLECTING_ADDRESS_EMAIL: 'Your email address? (reply "skip" if not applicable)',
  COLLECTING_ADDRESS_GST: 'GST number? (reply "skip" if not applicable)',
  COLLECTING_ADDRESS_LINE: 'Delivery address (street/area)?',
  COLLECTING_ADDRESS_CITY: 'City?',
  COLLECTING_ADDRESS_STATE: 'State?',
  COLLECTING_ADDRESS_PIN: 'PIN code?',
};

const AVAILABILITY_LABEL: Record<string, string> = {
  in_stock: 'In Stock',
  made_to_order: 'Made to Order',
  out_of_stock: 'Out of Stock',
};

/**
 * State machine driving the guided WhatsApp commerce flow. One method per
 * BotStep, dispatched from handleInboundMessage. Each branch sends the next
 * message (list/button/text) and persists the session's new step +
 * contextData before returning.
 */
@Injectable()
export class CommerceBotFlowEngine {
  private readonly logger = new Logger(CommerceBotFlowEngine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly catalog: CatalogService,
    private readonly pricing: OrderPricingService,
  ) {}

  async handleInboundMessage(
    tenant: Tenant,
    session: BotSession,
    message: Message,
    conversation: Conversation,
  ): Promise<void> {
    const replyId = extractReplyId(message);
    const text = extractText(message);

    if (text && isStartTrigger(text)) {
      await this.enterMainMenu(tenant, session, conversation);
      return;
    }

    try {
      switch (session.currentStep) {
        case 'START':
          return await this.enterMainMenu(tenant, session, conversation);
        case 'MAIN_MENU':
          return await this.handleMainMenuReply(tenant, session, conversation, replyId);
        case 'BROWSE_CATEGORY':
          return await this.handleCategoryReply(tenant, session, conversation, replyId);
        case 'BROWSE_MACHINE_LIST':
          return await this.handleMachineReply(tenant, session, conversation, replyId);
        case 'MACHINE_DETAIL':
          return await this.handleMachineDetailButton(tenant, session, conversation, replyId);
        case 'AWAITING_QUANTITY':
          return await this.handleQuantityReply(tenant, session, conversation, text);
        case 'CONFIG_SELECTION':
          return await this.handleConfigOptionReply(tenant, session, conversation, replyId);
        case 'AWAITING_ADDRESS_CHOICE':
          return await this.handleAddressChoiceReply(tenant, session, conversation, replyId);
        case 'COLLECTING_ADDRESS_NAME':
        case 'COLLECTING_ADDRESS_COMPANY':
        case 'COLLECTING_ADDRESS_MOBILE':
        case 'COLLECTING_ADDRESS_EMAIL':
        case 'COLLECTING_ADDRESS_GST':
        case 'COLLECTING_ADDRESS_LINE':
        case 'COLLECTING_ADDRESS_CITY':
        case 'COLLECTING_ADDRESS_STATE':
        case 'COLLECTING_ADDRESS_PIN':
          return await this.handleAddressFieldReply(tenant, session, conversation, text);
        case 'ORDER_SUMMARY':
          return await this.handleOrderSummaryButton(tenant, session, conversation, replyId);
        case 'COMPLETED':
        case 'HANDED_OFF':
          return; // bot stays silent; human/agent owns the thread now
        default:
          return await this.enterMainMenu(tenant, session, conversation);
      }
    } catch (err) {
      this.logger.error(`Flow engine error sessionId=${session.id} step=${session.currentStep}: ${(err as Error).message}`);
    }
  }

  // --- Step handlers -------------------------------------------------------

  private async enterMainMenu(tenant: Tenant, session: BotSession, conversation: Conversation): Promise<void> {
    await this.inbox.sendBotListMessage(tenant.id, conversation.id, {
      bodyText: `Welcome to ${tenant.name}\n\nWhat would you like to do?`,
      buttonLabel: 'View Options',
      sections: [
        {
          rows: [
            { id: 'main:browse', title: 'Browse Machines' },
            { id: 'main:find', title: 'Find a Machine' },
            { id: 'main:track', title: 'Track My Order' },
            { id: 'main:orders', title: 'My Orders' },
            { id: 'main:sales', title: 'Talk to Sales' },
          ],
        },
      ],
    });
    await this.saveSession(session.id, 'MAIN_MENU', {});
  }

  private async handleMainMenuReply(tenant: Tenant, session: BotSession, conversation: Conversation, replyId: string | null): Promise<void> {
    switch (replyId) {
      case 'main:browse':
      case 'main:find':
        return this.sendCategoryList(tenant, session, conversation);
      case 'main:track':
      case 'main:orders':
        return this.sendOrderList(tenant, session, conversation);
      case 'main:sales':
        return this.handOffToSales(tenant, session, conversation);
      default:
        return this.enterMainMenu(tenant, session, conversation);
    }
  }

  /**
   * Phase 1 has no shipping/fulfillment status beyond DRAFT/CONFIRMED/
   * CANCELLED, so "Track My Order" and "My Orders" show the same plain-text
   * summary — real shipment tracking needs Phase 2's fulfillment model.
   */
  private async sendOrderList(tenant: Tenant, session: BotSession, conversation: Conversation): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: { tenantId: tenant.id, contactId: conversation.contactId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
      include: { machine: true },
      take: 10,
    });

    if (orders.length === 0) {
      await this.inbox.sendBotReply(tenant.id, conversation.id, "You don't have any orders yet. Send \"Hi\" to browse our machines.");
      await this.saveSession(session.id, 'START', {}, null);
      return;
    }

    const lines = orders.map(
      (o) =>
        `#${o.id.slice(0, 8).toUpperCase()} — ${o.machine.name} × ${o.quantity} — ${o.status} — ${this.pricing.formatInr(o.totalAmount)}`,
    );
    await this.inbox.sendBotReply(tenant.id, conversation.id, `Your Orders\n\n${lines.join('\n')}`);
    await this.saveSession(session.id, 'START', {}, null);
  }

  private async sendCategoryList(tenant: Tenant, session: BotSession, conversation: Conversation): Promise<void> {
    const categories = await this.catalog.listActiveCategories(tenant.id);
    if (categories.length === 0) {
      await this.inbox.sendBotReply(tenant.id, conversation.id, "We don't have any machine categories set up yet. A team member will follow up shortly.");
      await this.saveSession(session.id, 'HANDED_OFF', {});
      return;
    }
    await this.inbox.sendBotListMessage(tenant.id, conversation.id, {
      bodyText: 'Select Machine Category',
      buttonLabel: 'View Categories',
      sections: [{ rows: categories.slice(0, 10).map((c) => ({ id: `category:${c.id}`, title: c.name })) }],
    });
    await this.saveSession(session.id, 'BROWSE_CATEGORY', {});
  }

  private async handleCategoryReply(tenant: Tenant, session: BotSession, conversation: Conversation, replyId: string | null): Promise<void> {
    const parsed = replyId ? parsePrefixedId(replyId) : null;
    if (!parsed || parsed.prefix !== 'category') {
      return this.sendCategoryList(tenant, session, conversation);
    }

    const machines = await this.catalog.listActiveMachinesInCategory(tenant.id, parsed.id);
    if (machines.length === 0) {
      await this.inbox.sendBotReply(tenant.id, conversation.id, 'No machines are currently listed in that category. Please pick another.');
      return this.sendCategoryList(tenant, session, conversation);
    }

    await this.inbox.sendBotListMessage(tenant.id, conversation.id, {
      bodyText: 'Select Machine',
      buttonLabel: 'View Machines',
      sections: [
        {
          rows: machines.map((m) => ({
            id: `machine:${m.id}`,
            title: `${m.name} (${m.model})`,
            description: `${this.pricing.formatInr(m.basePrice)} · ${AVAILABILITY_LABEL[m.availability] ?? m.availability}`,
          })),
        },
      ],
    });
    await this.saveSession(session.id, 'BROWSE_MACHINE_LIST', { categoryId: parsed.id });
  }

  private async handleMachineReply(tenant: Tenant, session: BotSession, conversation: Conversation, replyId: string | null): Promise<void> {
    const parsed = replyId ? parsePrefixedId(replyId) : null;
    if (!parsed || parsed.prefix !== 'machine') {
      return this.sendCategoryList(tenant, session, conversation);
    }
    await this.sendMachineDetail(tenant, session, conversation, parsed.id);
  }

  private async sendMachineDetail(tenant: Tenant, session: BotSession, conversation: Conversation, machineId: string): Promise<void> {
    const machine = await this.catalog.getMachineOrThrow(tenant.id, machineId);
    const specs = (machine.specs ?? {}) as Record<string, string>;
    const specLines = [
      `Model: ${machine.model}`,
      specs.power ? `Power: ${specs.power}` : null,
      specs.capacity ? `Capacity: ${specs.capacity}` : null,
      specs.warranty ? `Warranty: ${specs.warranty}` : null,
      specs.installation ? `Installation: ${specs.installation}` : null,
      specs.delivery ? `Delivery: ${specs.delivery}` : null,
      `Price: ${this.pricing.formatInr(machine.basePrice)} + GST`,
    ].filter(Boolean);

    await this.inbox.sendBotButtonMessage(tenant.id, conversation.id, {
      bodyText: `${machine.name}\n\n${specLines.join('\n')}`,
      buttons: [
        { id: 'detail:view', title: 'View Details' },
        { id: 'detail:buy', title: 'Buy Now' },
        { id: 'detail:sales', title: 'Talk to Sales' },
      ],
    });
    await this.saveSession(session.id, 'MACHINE_DETAIL', { machineId });
  }

  private async handleMachineDetailButton(tenant: Tenant, session: BotSession, conversation: Conversation, replyId: string | null): Promise<void> {
    const ctx = asBotContextData(session.contextData);
    if (!ctx.machineId) return this.sendCategoryList(tenant, session, conversation);

    switch (replyId) {
      case 'detail:view':
        return this.sendMachineDetail(tenant, session, conversation, ctx.machineId);
      case 'detail:buy':
        await this.inbox.sendBotReply(tenant.id, conversation.id, "Let's create your order.\n\nHow many units would you like? Reply with a number.");
        await this.saveSession(session.id, 'AWAITING_QUANTITY', ctx);
        return;
      case 'detail:sales':
        return this.handOffToSales(tenant, session, conversation);
      default:
        return this.sendMachineDetail(tenant, session, conversation, ctx.machineId);
    }
  }

  private async handleQuantityReply(tenant: Tenant, session: BotSession, conversation: Conversation, text: string): Promise<void> {
    const ctx = asBotContextData(session.contextData);
    const quantity = Number.parseInt(text.trim(), 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      await this.inbox.sendBotReply(tenant.id, conversation.id, 'Please reply with a valid quantity, e.g. "1" or "2".');
      return;
    }
    ctx.quantity = quantity;

    if (!ctx.machineId) return this.sendCategoryList(tenant, session, conversation);
    const machine = await this.catalog.getMachineOrThrow(tenant.id, ctx.machineId);

    if (machine.configGroups.length === 0) {
      return this.enterAddressChoice(tenant, session, conversation, ctx);
    }

    ctx.pendingConfigGroups = machine.configGroups.map((g) => g.id);
    ctx.selectedConfig = [];
    await this.saveSession(session.id, 'CONFIG_SELECTION', ctx);
    await this.sendNextConfigGroup(tenant, conversation, ctx);
  }

  private async sendNextConfigGroup(tenant: Tenant, conversation: Conversation, ctx: BotContextData): Promise<void> {
    const groupId = ctx.pendingConfigGroups?.[0];
    if (!groupId) return; // caller ensures non-empty before calling
    const group = await this.catalog.getConfigGroupOrThrow(tenant.id, groupId);
    await this.inbox.sendBotListMessage(tenant.id, conversation.id, {
      bodyText: `Select ${group.name}`,
      buttonLabel: 'View Options',
      sections: [
        {
          rows: group.options.slice(0, 10).map((o) => ({
            id: `config:${group.id}:${o.id}`,
            title: o.label,
            description: o.priceDelta.toString() !== '0' ? `+${this.pricing.formatInr(o.priceDelta)}` : undefined,
          })),
        },
      ],
    });
  }

  private async handleConfigOptionReply(tenant: Tenant, session: BotSession, conversation: Conversation, replyId: string | null): Promise<void> {
    const ctx = asBotContextData(session.contextData);
    const parsed = replyId ? parseConfigRowId(replyId) : null;
    const pendingGroupId = ctx.pendingConfigGroups?.[0];

    if (!parsed || !pendingGroupId || parsed.groupId !== pendingGroupId) {
      if (pendingGroupId) await this.sendNextConfigGroup(tenant, conversation, ctx);
      return;
    }

    const group = await this.catalog.getConfigGroupOrThrow(tenant.id, parsed.groupId);
    const option = await this.catalog.getConfigOptionOrThrow(tenant.id, parsed.optionId);

    const entry: SelectedConfigEntry = {
      groupId: group.id,
      groupName: group.name,
      optionId: option.id,
      optionLabel: option.label,
      priceDelta: option.priceDelta.toString(),
    };
    ctx.selectedConfig = [...(ctx.selectedConfig ?? []), entry];
    ctx.pendingConfigGroups = (ctx.pendingConfigGroups ?? []).slice(1);

    if (ctx.pendingConfigGroups.length > 0) {
      await this.saveSession(session.id, 'CONFIG_SELECTION', ctx);
      await this.sendNextConfigGroup(tenant, conversation, ctx);
      return;
    }

    await this.enterAddressChoice(tenant, session, conversation, ctx);
  }

  private async enterAddressChoice(tenant: Tenant, session: BotSession, conversation: Conversation, ctx: BotContextData): Promise<void> {
    const contact = await this.prisma.contact.findUnique({ where: { id: conversation.contactId } });
    const savedAddress = (contact?.metadata as { savedAddress?: AddressDraft } | null)?.savedAddress;

    if (savedAddress) {
      await this.inbox.sendBotButtonMessage(tenant.id, conversation.id, {
        bodyText: 'Where should we deliver the machine?',
        buttons: [
          { id: 'address:saved', title: 'Use Saved Address' },
          { id: 'address:new', title: 'Add New Address' },
        ],
      });
      await this.saveSession(session.id, 'AWAITING_ADDRESS_CHOICE', ctx);
      return;
    }

    await this.beginAddressCollection(tenant, session, conversation, ctx);
  }

  private async handleAddressChoiceReply(tenant: Tenant, session: BotSession, conversation: Conversation, replyId: string | null): Promise<void> {
    const ctx = asBotContextData(session.contextData);
    if (replyId === 'address:saved') {
      const contact = await this.prisma.contact.findUnique({ where: { id: conversation.contactId } });
      const savedAddress = (contact?.metadata as { savedAddress?: AddressDraft } | null)?.savedAddress;
      ctx.addressDraft = savedAddress ?? {};
      ctx.useAddressChoice = 'saved';
      return this.finalizeOrderSummary(tenant, session, conversation, ctx);
    }
    return this.beginAddressCollection(tenant, session, conversation, ctx);
  }

  private async beginAddressCollection(tenant: Tenant, session: BotSession, conversation: Conversation, ctx: BotContextData): Promise<void> {
    ctx.useAddressChoice = 'new';
    ctx.addressDraft = {};
    await this.inbox.sendBotReply(tenant.id, conversation.id, ADDRESS_PROMPTS.COLLECTING_ADDRESS_NAME);
    await this.saveSession(session.id, 'COLLECTING_ADDRESS_NAME', ctx);
  }

  private async handleAddressFieldReply(tenant: Tenant, session: BotSession, conversation: Conversation, text: string): Promise<void> {
    const ctx = asBotContextData(session.contextData);
    const currentStep = session.currentStep as (typeof ADDRESS_STEPS)[number];
    const field = ADDRESS_FIELD_BY_STEP[currentStep];
    const value = text.trim();
    const isOptional = field === 'company' || field === 'email' || field === 'gstNumber';

    if (!value && !isOptional) {
      await this.inbox.sendBotReply(tenant.id, conversation.id, 'This field is required — please provide a value.');
      return;
    }

    ctx.addressDraft = ctx.addressDraft ?? {};
    if (value && !/^skip$/i.test(value)) {
      ctx.addressDraft[field] = value;
    }

    const currentIndex = ADDRESS_STEPS.indexOf(currentStep);
    const nextStep = ADDRESS_STEPS[currentIndex + 1];

    if (nextStep) {
      await this.inbox.sendBotReply(tenant.id, conversation.id, ADDRESS_PROMPTS[nextStep]);
      await this.saveSession(session.id, nextStep, ctx);
      return;
    }

    await this.finalizeOrderSummary(tenant, session, conversation, ctx);
  }

  /**
   * Creates the DRAFT order (order creation happens here, at summary entry,
   * not on Confirm — so abandoned carts are still visible/queryable) and
   * sends the summary message with Confirm/Modify/Cancel buttons.
   */
  private async finalizeOrderSummary(tenant: Tenant, session: BotSession, conversation: Conversation, ctx: BotContextData): Promise<void> {
    if (!ctx.machineId || !ctx.quantity) return this.enterMainMenu(tenant, session, conversation);

    const machine = await this.catalog.getMachineOrThrow(tenant.id, ctx.machineId);
    const selectedConfig = ctx.selectedConfig ?? [];
    const computed = this.pricing.compute(machine.basePrice, ctx.quantity, selectedConfig);
    ctx.pricing = this.pricing.toSnapshot(computed);

    const address = ctx.addressDraft ?? {};

    // Replace any existing draft order for this session (e.g. re-entering
    // summary after a Modify) rather than accumulating orphaned drafts.
    if (session.draftOrderId) {
      await this.prisma.order.delete({ where: { id: session.draftOrderId } }).catch(() => undefined);
    }

    const order = await this.prisma.order.create({
      data: {
        tenantId: tenant.id,
        contactId: conversation.contactId,
        conversationId: conversation.id,
        machineId: machine.id,
        quantity: ctx.quantity,
        selectedConfig: selectedConfig as unknown as Prisma.InputJsonValue,
        unitPrice: computed.unitPrice,
        subtotal: computed.subtotal,
        gstAmount: computed.gstAmount,
        totalAmount: computed.totalAmount,
        deliveryAddress: address as unknown as Prisma.InputJsonValue,
        status: 'DRAFT',
      },
    });

    const configLines = selectedConfig.map((c) => `${c.optionLabel}`).join('\n');
    const summaryBody = [
      'Order Summary',
      '',
      `Machine: ${machine.name}`,
      `Model: ${machine.model}`,
      `Quantity: ${ctx.quantity}`,
      configLines ? `\nConfiguration:\n${configLines}` : null,
      `\nDelivery:\n${[address.city, address.state].filter(Boolean).join(', ') || 'Not specified'}`,
      `\nTotal: ${this.pricing.formatInr(computed.totalAmount)}`,
    ].filter(Boolean).join('\n');

    await this.inbox.sendBotButtonMessage(tenant.id, conversation.id, {
      bodyText: summaryBody,
      buttons: [
        { id: 'summary:confirm', title: 'Confirm Order' },
        { id: 'summary:modify', title: 'Modify Order' },
        { id: 'summary:cancel', title: 'Cancel' },
      ],
    });

    await this.saveSession(session.id, 'ORDER_SUMMARY', ctx, order.id);
  }

  private async handleOrderSummaryButton(tenant: Tenant, session: BotSession, conversation: Conversation, replyId: string | null): Promise<void> {
    const ctx = asBotContextData(session.contextData);

    if (replyId === 'summary:confirm') {
      if (!session.draftOrderId) return this.enterMainMenu(tenant, session, conversation);
      const order = await this.prisma.order.update({
        where: { id: session.draftOrderId },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });

      // Write back the delivery address as the contact's saved address so a
      // future order can reuse it via "Use Saved Address".
      if (ctx.addressDraft) {
        const contact = await this.prisma.contact.findUnique({ where: { id: conversation.contactId } });
        const existingMetadata = (contact?.metadata as Record<string, unknown> | null) ?? {};
        await this.prisma.contact.update({
          where: { id: conversation.contactId },
          data: { metadata: { ...existingMetadata, savedAddress: ctx.addressDraft } as unknown as Prisma.InputJsonValue },
        });
      }

      await this.inbox.sendBotReply(
        tenant.id,
        conversation.id,
        `Order Confirmed\n\nThank you! Your order has been placed.\n\nOrder ID: #${order.id.slice(0, 8).toUpperCase()}\nTotal: ${this.pricing.formatInr(order.totalAmount)}\n\nOur team will follow up shortly with next steps.`,
      );
      await this.saveSession(session.id, 'COMPLETED', {}, null);
      return;
    }

    if (replyId === 'summary:cancel') {
      if (session.draftOrderId) {
        await this.prisma.order.update({ where: { id: session.draftOrderId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      }
      await this.inbox.sendBotReply(tenant.id, conversation.id, 'No problem — your order has been cancelled. Send "Hi" anytime to start a new one.');
      await this.saveSession(session.id, 'START', {}, null);
      return;
    }

    if (replyId === 'summary:modify') {
      if (session.draftOrderId) {
        await this.prisma.order.delete({ where: { id: session.draftOrderId } }).catch(() => undefined);
      }
      await this.inbox.sendBotReply(tenant.id, conversation.id, "Let's update your order. How many units would you like? Reply with a number.");
      await this.saveSession(session.id, 'AWAITING_QUANTITY', { machineId: ctx.machineId, categoryId: ctx.categoryId }, null);
      return;
    }

    // Unrecognized reply — re-show the same summary is complex to
    // reconstruct here without recomputation, so just re-prompt.
    await this.inbox.sendBotReply(tenant.id, conversation.id, 'Please choose Confirm Order, Modify Order, or Cancel.');
  }

  private async handOffToSales(tenant: Tenant, session: BotSession, conversation: Conversation): Promise<void> {
    await this.inbox.sendBotReply(
      tenant.id,
      conversation.id,
      "Sure! I've noted your interest — a member of our sales team will reach out to you shortly on this number.",
    );
    await this.saveSession(session.id, 'HANDED_OFF', {});
  }

  // --- Persistence helper ---------------------------------------------------

  private async saveSession(
    sessionId: string,
    step: BotSession['currentStep'],
    contextData: BotContextData,
    draftOrderId?: string | null,
  ): Promise<void> {
    await this.prisma.botSession.update({
      where: { id: sessionId },
      data: {
        currentStep: step,
        contextData: contextData as unknown as Prisma.InputJsonValue,
        lastInteractionAt: new Date(),
        ...(draftOrderId !== undefined ? { draftOrderId } : {}),
      },
    });
  }
}
