import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

/**
 * Validates a body/query/param with a Zod schema (the same schemas the web
 * app imports from @whatsapp-crm/shared-types) and returns the parsed value,
 * including defaults and transforms. Failures become a 400 with per-field
 * issues so the UI can show them next to the right input.
 *
 * Usage: `@Body(new ZodValidationPipe(CreateContactRequestSchema)) body: CreateContactRequest`
 */
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        error: 'Bad Request',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
