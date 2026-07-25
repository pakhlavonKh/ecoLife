import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { StrictThrottle } from '../common/decorators/throttle-profiles.decorator';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Dev mock checkout page — «Оплатить успешно» / «Ошибка оплаты». */
  @Get('mock/:paymentId')
  @ApiOperation({ summary: 'Mock payment page (dev)' })
  async mockPage(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const payment = await this.payments.getPaymentForMockPage(paymentId);
    const amount = payment.amount.toFixed(2);
    const code = payment.booking.publicCode;
    const status = payment.status;
    const first = payment.booking.customer.firstName?.trim() ?? '';
    const last = payment.booking.customer.lastName?.trim() ?? '';
    const guest = !last || last === first ? first : `${first} ${last}`;
    const disabled =
      status === 'succeeded' || status === 'failed' ? 'disabled' : '';
    const statusNote =
      status === 'succeeded'
        ? '<p style="color:#0a7">Оплата уже прошла успешно.</p>'
        : status === 'failed'
          ? '<p style="color:#c00">Оплата уже отмечена как ошибка.</p>'
          : '';
    const siteUrl = (
      process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173'
    ).replace(/\/$/, '');

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Mock оплата — ${escapeHtml(code)}</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;background:#f6f7f5;color:#1a1a1a}
    .card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:24px}
    h1{font-size:1.25rem;margin:0 0 8px}
    .meta{color:#555;font-size:.9rem;line-height:1.5;margin-bottom:20px}
    .row{display:flex;gap:12px;flex-wrap:wrap}
    button{flex:1;min-width:140px;padding:12px 16px;font-size:1rem;border-radius:6px;border:0;cursor:pointer}
    button:disabled{opacity:.5;cursor:not-allowed}
    .ok{background:#1b7f4a;color:#fff}
    .fail{background:#b42318;color:#fff}
    #msg{margin-top:16px;font-size:.95rem}
  </style>
</head>
<body>
  <div class="card">
    <h1>Mock-оплата (dev)</h1>
    <div class="meta">
      Бронь: <strong>${escapeHtml(code)}</strong><br/>
      Гость: ${escapeHtml(guest)}<br/>
      Депозит: <strong>${escapeHtml(amount)} UZS</strong><br/>
      Payment ID: <code>${escapeHtml(paymentId)}</code>
    </div>
    ${statusNote}
    <div class="row">
      <button class="ok" ${disabled} onclick="pay('success')">Оплатить успешно</button>
      <button class="fail" ${disabled} onclick="pay('fail')">Ошибка оплаты</button>
    </div>
    <div id="msg"></div>
  </div>
  <script>
    async function pay(outcome) {
      const msg = document.getElementById('msg');
      msg.textContent = 'Отправка…';
      try {
        const res = await fetch('/api/v1/payments/mock/${paymentId}/' + (outcome === 'success' ? 'succeed' : 'fail'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || res.statusText);
        msg.textContent = outcome === 'success'
          ? 'Оплата успешна. Перенаправляем…'
          : 'Оплата отклонена. Перенаправляем…';
        document.querySelectorAll('button').forEach(b => b.disabled = true);
        const target = outcome === 'success'
          ? '${siteUrl}/booking/success?code=${encodeURIComponent(code)}'
          : '${siteUrl}/booking/fail?code=${encodeURIComponent(code)}';
        setTimeout(function () { window.location.href = target; }, 700);
      } catch (e) {
        msg.textContent = 'Ошибка: ' + (e && e.message ? e.message : e);
      }
    }
  </script>
</body>
</html>`;

    res.type('html').send(html);
  }

  @Post('mock/:paymentId/succeed')
  @HttpCode(200)
  @StrictThrottle(20)
  @ApiOperation({ summary: 'Mock: mark deposit paid' })
  mockSucceed(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.payments.handleMockAction(paymentId, 'success');
  }

  @Post('mock/:paymentId/fail')
  @HttpCode(200)
  @StrictThrottle(20)
  @ApiOperation({ summary: 'Mock: mark payment failed' })
  mockFail(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.payments.handleMockAction(paymentId, 'fail');
  }

  /**
   * Payment provider callbacks must not be rate-limited — providers retry and
   * a 429 could drop a legitimate deposit. Auth is signature / Basic verification.
   */
  @Post('webhooks/payme')
  @HttpCode(200)
  @SkipThrottle()
  @ApiOperation({ summary: 'Payme Merchant API JSON-RPC webhook' })
  async paymeWebhook(@Req() req: Request) {
    const result = await this.payments.handleProviderWebhook('payme', {
      headers: req.headers as Record<string, string | string[] | undefined>,
      body: req.body,
    });
    return result.responseBody;
  }

  @Post('webhooks/click')
  @HttpCode(200)
  @SkipThrottle()
  @ApiOperation({ summary: 'Click SHOP-API prepare/complete webhook' })
  async clickWebhook(@Req() req: Request) {
    const result = await this.payments.handleProviderWebhook('click', {
      headers: req.headers as Record<string, string | string[] | undefined>,
      body: req.body,
    });
    return result.responseBody;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
