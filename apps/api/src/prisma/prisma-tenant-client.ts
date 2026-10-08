import { PrismaClient } from '@prisma/client';

/**
 * WHY THIS FILE EXISTS (read before deleting or "simplifying" it):
 *
 * In Milestone 1 there are no per-tenant *business* tables yet (Tenant, User,
 * and RefreshToken are platform/account tables, not tenant-partitioned data).
 * Starting in M2, tables like contacts/messages/conversations/broadcasts will
 * ALL be partitioned by tenantId, and every query against them must be
 * automatically scoped to the caller's tenant to prevent cross-tenant data
 * leaks — a bug class that is very expensive to retrofit once dozens of
 * call-sites exist.
 *
 * This factory builds a tenant-scoped Prisma client using Prisma's `$extends`
 * client extension API: `where` filters passed to a scoped model's
 * find/update/delete/count calls get `tenantId` merged in automatically, so
 * call-sites can't forget it.
 *
 * It is intentionally generic and not wired to any concrete model yet because
 * no tenant-scoped model exists in the schema in M1. To extend it in M2+:
 *
 *   1. Add `tenantId` to the new model in schema.prisma.
 *   2. Add the model name to the `TENANT_SCOPED_MODELS` list below.
 *   3. Use `createTenantScopedClient(prisma, tenantId)` instead of the raw
 *      PrismaService in any request-handling path that touches that model.
 *
 * This does NOT replace explicit `tenantId` checks on writes/creates (Prisma
 * extensions can't safely inject `data.tenantId` for you on `create` without
 * risking silently overwriting a caller-supplied value) — always set
 * `tenantId` explicitly from the JWT on creates. This extension covers
 * reads/updates/deletes via `where`.
 */

// Models that are partitioned by tenantId. Populated starting M2.
const TENANT_SCOPED_MODELS: readonly string[] = [
  'whatsappConnection',
  'contact',
  'conversation',
  'message',
  // 'broadcast', ... (added in later milestones)
];

function isTenantScopedModel(model: string | undefined): boolean {
  return !!model && TENANT_SCOPED_MODELS.includes(model.charAt(0).toLowerCase() + model.slice(1));
}

/**
 * Returns a Prisma client whose queries against tenant-scoped models are
 * automatically filtered to the given tenantId. Safe to call per-request.
 */
export function createTenantScopedClient(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isTenantScopedModel(model)) {
            return query(args);
          }

          const readOrWriteOpsWithWhere = [
            'findFirst',
            'findFirstOrThrow',
            'findMany',
            'findUnique',
            'findUniqueOrThrow',
            'update',
            'updateMany',
            'delete',
            'deleteMany',
            'count',
            'aggregate',
          ];

          if (readOrWriteOpsWithWhere.includes(operation)) {
            const typedArgs = args as { where?: Record<string, unknown> };
            typedArgs.where = { ...(typedArgs.where ?? {}), tenantId };
          }

          return query(args);
        },
      },
    },
  });
}
