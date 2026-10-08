import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SelectedConfigEntry, PricingSnapshot } from './commerce-bot-context.types';

/** Standard GST slab for capital goods/machinery in India. */
const GST_RATE = new Prisma.Decimal('0.18');

@Injectable()
export class OrderPricingService {
  compute(basePrice: Prisma.Decimal, quantity: number, selectedConfig: SelectedConfigEntry[]): {
    unitPrice: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    gstAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
  } {
    const configDelta = selectedConfig.reduce(
      (sum, c) => sum.plus(new Prisma.Decimal(c.priceDelta)),
      new Prisma.Decimal(0),
    );
    const unitPrice = basePrice.plus(configDelta);
    const subtotal = unitPrice.times(quantity);
    const gstAmount = subtotal.times(GST_RATE);
    const totalAmount = subtotal.plus(gstAmount);
    return { unitPrice, subtotal, gstAmount, totalAmount };
  }

  toSnapshot(pricing: { unitPrice: Prisma.Decimal; subtotal: Prisma.Decimal; gstAmount: Prisma.Decimal; totalAmount: Prisma.Decimal }): PricingSnapshot {
    return {
      unitPrice: pricing.unitPrice.toFixed(2),
      subtotal: pricing.subtotal.toFixed(2),
      gstAmount: pricing.gstAmount.toFixed(2),
      totalAmount: pricing.totalAmount.toFixed(2),
    };
  }

  /** Formats with Indian digit grouping (last 3 digits, then groups of 2): 1073800.00 -> 10,73,800.00 */
  formatInr(amount: Prisma.Decimal | string): string {
    const value = typeof amount === 'string' ? new Prisma.Decimal(amount) : amount;
    const [wholePart, decimalPart] = value.toFixed(2).split('.');
    const lastThree = wholePart.slice(-3);
    const rest = wholePart.slice(0, -3);
    const restGrouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    const grouped = rest ? `${restGrouped},${lastThree}` : lastThree;
    return `₹${grouped}.${decimalPart}`;
  }
}
