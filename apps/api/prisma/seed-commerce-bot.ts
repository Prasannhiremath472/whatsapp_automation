/**
 * One-off provisioning script for the machinery tenant's Phase 1 demo
 * catalog. Not part of the app's runtime path — run manually via:
 *   npx ts-node -r tsconfig-paths/register prisma/seed-commerce-bot.ts <tenantSlug>
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: seed-commerce-bot.ts <tenantSlug>');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error(`No tenant with slug "${slug}"`);
    process.exit(1);
  }

  await prisma.tenant.update({ where: { id: tenant.id }, data: { commerceBotEnabled: true } });

  const cnc = await prisma.machineCategory.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'CNC Machines' } },
    update: {},
    create: { tenantId: tenant.id, name: 'CNC Machines', sortOrder: 1 },
  });
  await prisma.machineCategory.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Packaging Machines' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Packaging Machines', sortOrder: 2 },
  });
  await prisma.machineCategory.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Industrial Machines' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Industrial Machines', sortOrder: 3 },
  });

  const existingMachine = await prisma.machine.findFirst({ where: { tenantId: tenant.id, model: 'CNC-450' } });
  const machine =
    existingMachine ??
    (await prisma.machine.create({
      data: {
        tenantId: tenant.id,
        categoryId: cnc.id,
        name: 'CNC Turning Machine',
        model: 'CNC-450',
        basePrice: '850000',
        availability: 'in_stock',
        specs: {
          power: '15 HP',
          capacity: '450 mm',
          warranty: '2 Years',
          installation: 'Included',
          delivery: '7-10 working days',
        },
        sortOrder: 1,
      },
    }));

  const existingMotorGroup = await prisma.machineConfigGroup.findFirst({ where: { machineId: machine.id, name: 'Motor' } });
  if (!existingMotorGroup) {
    const motorGroup = await prisma.machineConfigGroup.create({
      data: { tenantId: tenant.id, machineId: machine.id, name: 'Motor', sortOrder: 1 },
    });
    await prisma.machineConfigOption.createMany({
      data: [
        { tenantId: tenant.id, groupId: motorGroup.id, label: '10 HP', priceDelta: '0', isDefault: true, sortOrder: 1 },
        { tenantId: tenant.id, groupId: motorGroup.id, label: '15 HP', priceDelta: '40000', sortOrder: 2 },
        { tenantId: tenant.id, groupId: motorGroup.id, label: '20 HP', priceDelta: '85000', sortOrder: 3 },
      ],
    });

    const controllerGroup = await prisma.machineConfigGroup.create({
      data: { tenantId: tenant.id, machineId: machine.id, name: 'Controller', sortOrder: 2 },
    });
    await prisma.machineConfigOption.createMany({
      data: [
        { tenantId: tenant.id, groupId: controllerGroup.id, label: 'Standard', priceDelta: '0', isDefault: true, sortOrder: 1 },
        { tenantId: tenant.id, groupId: controllerGroup.id, label: 'Advanced', priceDelta: '65000', sortOrder: 2 },
      ],
    });

    const installGroup = await prisma.machineConfigGroup.create({
      data: { tenantId: tenant.id, machineId: machine.id, name: 'Installation', sortOrder: 3 },
    });
    await prisma.machineConfigOption.createMany({
      data: [
        { tenantId: tenant.id, groupId: installGroup.id, label: 'Included', priceDelta: '0', isDefault: true, sortOrder: 1 },
        { tenantId: tenant.id, groupId: installGroup.id, label: 'Premium Installation', priceDelta: '25000', sortOrder: 2 },
      ],
    });

    const warrantyGroup = await prisma.machineConfigGroup.create({
      data: { tenantId: tenant.id, machineId: machine.id, name: 'Warranty', sortOrder: 4 },
    });
    await prisma.machineConfigOption.createMany({
      data: [
        { tenantId: tenant.id, groupId: warrantyGroup.id, label: '1 Year', priceDelta: '0', isDefault: true, sortOrder: 1 },
        { tenantId: tenant.id, groupId: warrantyGroup.id, label: '2 Years', priceDelta: '0', sortOrder: 2 },
        { tenantId: tenant.id, groupId: warrantyGroup.id, label: '3 Years', priceDelta: '35000', sortOrder: 3 },
      ],
    });
  }

  console.log(`[seed-commerce-bot] tenant "${slug}" ready: commerceBotEnabled=true, machine "${machine.name}" (${machine.model})`);
}

main()
  .catch((err) => {
    console.error('[seed-commerce-bot] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
