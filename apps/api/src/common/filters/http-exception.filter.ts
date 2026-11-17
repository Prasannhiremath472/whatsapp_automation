import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ZodError } from "zod";

function isClientHttpError(e: unknown): e is { status: number } {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500 && (e as { expose?: unknown }).expose === true;
}

/**
 * Global exception filter producing a consistent JSON error shape:
 * { statusCode, message, error, path, timestamp, issues? }
 *
 * `issues` is present for validation failures: [{ path, message }].
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Internal server error";
    let error = "Internal Server Error";
    let issues: { path: string; message: string }[] | undefined;

    if (exception instanceof ZodError) {
      // Controllers that still call schema.parse() directly land here.
      statusCode = HttpStatus.BAD_REQUEST;
      message = "Validation failed";
      error = "Bad Request";
      issues = exception.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === "string") {
        message = res;
        error = exception.name;
      } else if (typeof res === "object" && res !== null) {
        const r = res as Record<string, unknown>;
        message = (r.message as string | string[]) ?? exception.message;
        error = (r.error as string) ?? exception.name;
        if (Array.isArray(r.issues)) issues = r.issues as { path: string; message: string }[];
      }
    } else if (isClientHttpError(exception)) {
      // Errors raised by Express body parsers (e.g. an upload over the size limit).
      statusCode = exception.status;
      message = exception.status === 413 ? "The file is too large" : "Invalid request body";
      error = exception.status === 413 ? "Payload Too Large" : "Bad Request";
    } else if (exception instanceof Error) {
      // Never leak internals for unexpected errors.
      this.logger.error(exception.message, exception.stack);
    }

    response.status(statusCode).json({
      statusCode,
      message,
      error,
      ...(issues ? { issues } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
