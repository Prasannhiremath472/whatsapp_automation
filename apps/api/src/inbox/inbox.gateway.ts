import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { Conversation, Message } from '@prisma/client';
import type { JwtClaims } from '@whatsapp-crm/shared-types';
import { INBOX_EVENTS } from './inbox-events.constants';

function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

/**
 * Realtime layer for the shared inbox. Clients connect with their JWT access
 * token as the `auth.token` handshake field (same secret/verification logic
 * as JwtAuthGuard/JwtStrategy — reused via JwtService.verify here rather
 * than duplicated). Once verified, the socket joins `tenant:{tenantId}` so
 * all agents on that tenant receive the same live events. Unauthenticated
 * connections are disconnected immediately.
 *
 * InboxService (and the webhook ingestion path, indirectly) never imports
 * this gateway directly — they emit on the shared EventEmitter2 bus
 * (see inbox-events.constants.ts) and this gateway listens, keeping the
 * websockets module decoupled from the webhook module.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class InboxGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(InboxGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  handleConnection(@ConnectedSocket() client: Socket): void {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, '') as string | undefined);

    if (!token) {
      this.logger.warn(`Socket ${client.id} connected without a token; disconnecting`);
      client.disconnect(true);
      return;
    }

    try {
      const claims = this.jwtService.verify<JwtClaims>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });

      if (!claims.tenantId) {
        // super_admin sockets have nothing tenant-scoped to listen to for M3.
        this.logger.warn(`Socket ${client.id} has no tenantId (super_admin?); disconnecting`);
        client.disconnect(true);
        return;
      }

      client.data.claims = claims;
      void client.join(tenantRoom(claims.tenantId));
      this.logger.log(`Socket ${client.id} authenticated for tenant=${claims.tenantId} user=${claims.sub}`);
    } catch (err) {
      this.logger.warn(`Socket ${client.id} failed JWT verification; disconnecting: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    this.logger.log(`Socket ${client.id} disconnected`);
  }

  @OnEvent(INBOX_EVENTS.MESSAGE_NEW)
  handleMessageNew(payload: { tenantId: string; message: Message; conversation: Conversation }): void {
    this.server?.to(tenantRoom(payload.tenantId)).emit('message:new', {
      message: payload.message,
      conversation: payload.conversation,
    });
  }

  @OnEvent(INBOX_EVENTS.CONVERSATION_UPDATED)
  handleConversationUpdated(payload: { tenantId: string; conversation: Conversation }): void {
    this.server?.to(tenantRoom(payload.tenantId)).emit('conversation:updated', {
      conversation: payload.conversation,
    });
  }
}
