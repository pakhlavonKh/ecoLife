import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Production throttle guard that can be disabled for e2e (DISABLE_THROTTLE=true).
 * Needed so the concurrency gate can fire 20 parallel booking requests.
 */
@Injectable()
export class OptionalThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.DISABLE_THROTTLE === 'true') {
      return true;
    }
    return super.canActivate(context);
  }
}
