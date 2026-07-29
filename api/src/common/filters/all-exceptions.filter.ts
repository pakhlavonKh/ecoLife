import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

type ErrorBody = {
  statusCode: number;
  error: string;
  message: string | string[];
  timestamp: string;
  path: string;
  /** Machine-readable code (e.g. EXTEND_BLOCKED). */
  code?: string;
  /** Same-class rooms offered when extend is blocked (TRANSFER.md §4). */
  transferOffers?: unknown;
  requested?: unknown;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toBody(exception, request.url);

    if (body.statusCode >= 500) {
      this.logger.error(
        {
          err: exception,
          path: request.url,
          method: request.method,
        },
        'Unhandled exception',
      );
    } else {
      this.logger.warn(
        {
          statusCode: body.statusCode,
          path: request.url,
          message: body.message,
        },
        'Request failed',
      );
    }

    // Never include stack traces in the HTTP body (logged server-side only).
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, path: string): ErrorBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      const { error, message, code, transferOffers, requested } =
        this.normalizeHttpResponse(res, exception.message);
      return {
        statusCode,
        error,
        message,
        timestamp,
        path,
        ...(code != null ? { code } : {}),
        ...(transferOffers != null ? { transferOffers } : {}),
        ...(requested != null ? { requested } : {}),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'A record with this unique value already exists',
          timestamp,
          path,
        };
      }
      if (exception.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: 'Record not found',
          timestamp,
          path,
        };
      }
      if (exception.code === 'P2003') {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Related record not found (foreign key)',
          timestamp,
          path,
        };
      }
      if (exception.code === 'P2034') {
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message:
            'This room was just booked, please pick another room or dates',
          timestamp,
          path,
        };
      }
    }

    const rawMessage =
      exception instanceof Error ? exception.message : String(exception ?? '');
    if (
      rawMessage.includes('booking_rooms_no_overlap') ||
      rawMessage.includes('23P01')
    ) {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message:
          'This room was just booked, please pick another room or dates',
        timestamp,
        path,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
      timestamp,
      path,
    };
  }

  private normalizeHttpResponse(
    res: string | object,
    fallback: string,
  ): {
    error: string;
    message: string | string[];
    code?: string;
    transferOffers?: unknown;
    requested?: unknown;
  } {
    if (typeof res === 'string') {
      return { error: fallback, message: res };
    }

    const obj = res as Record<string, unknown>;
    const message = (obj.message as string | string[] | undefined) ?? fallback;
    const error =
      typeof obj.error === 'string'
        ? obj.error
        : typeof message === 'string'
          ? message
          : 'Error';

    return {
      error,
      message,
      ...(typeof obj.code === 'string' ? { code: obj.code } : {}),
      ...(obj.transferOffers != null
        ? { transferOffers: obj.transferOffers }
        : {}),
      ...(obj.requested != null ? { requested: obj.requested } : {}),
    };
  }
}
