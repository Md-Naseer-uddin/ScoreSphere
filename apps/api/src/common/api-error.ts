import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '@scoresphere/contracts';

export interface ErrorDetail {
  field: string;
  code: string;
}

/** Throw from services for expected failures; the filter turns it into the error envelope. */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message, status);
  }
}
