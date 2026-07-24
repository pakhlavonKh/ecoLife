import { createHash } from 'node:crypto';

export type ClickSignParams = {
  clickTransId: string | number;
  serviceId: string | number;
  secretKey: string;
  merchantTransId: string;
  amount: string | number;
  action: string | number;
  signTime: string;
  /** Required for Complete (action=1). */
  merchantPrepareId?: string | number;
};

/**
 * Click SHOP-API MD5 signature.
 * Prepare (action=0): click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time
 * Complete (action=1): … + merchant_prepare_id before amount …
 * @see https://docs.click.uz/
 */
export function buildClickSignString(params: ClickSignParams): string {
  const parts = [
    String(params.clickTransId),
    String(params.serviceId),
    params.secretKey,
    String(params.merchantTransId),
  ];
  if (params.merchantPrepareId !== undefined && params.merchantPrepareId !== null) {
    parts.push(String(params.merchantPrepareId));
  }
  parts.push(
    String(params.amount),
    String(params.action),
    String(params.signTime),
  );
  return createHash('md5').update(parts.join('')).digest('hex');
}

export function verifyClickSignature(
  params: ClickSignParams,
  signString: string,
): boolean {
  if (!signString || !params.secretKey) {
    return false;
  }
  return buildClickSignString(params) === signString;
}
