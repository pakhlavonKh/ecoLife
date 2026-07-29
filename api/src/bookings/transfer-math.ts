/**
 * Pure transfer / upgrade / extend money + date helpers (TRANSFER.md §2–4).
 * Age pricing: adults/children/infants via CategoryPersonPrices — never flat guests.
 */
import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { nightsBetween } from '../common/utils/dates';
import {
  formatLocalDate,
  formatLocalDateTime,
  formatLocalTime,
} from '../common/utils/datetime';
import type {
  CategoryPersonPrices,
  GuestCounts,
} from '../common/utils/guest-counts';
import {
  calcTotalAmount,
  decimalToString,
  toDecimal,
} from '../common/utils/money';
import type { PriceBreakdown, PriceBreakdownSegment } from './events/booking.events';

export type StaySegmentBounds = {
  checkIn: Date;
  checkOut: Date;
  nights: number;
};

export type TransferSplit = {
  segmentA: StaySegmentBounds;
  segmentB: StaySegmentBounds;
};

/**
 * Split [checkIn, checkOut) at transferTs into A=[checkIn, transferTs) and
 * B=[transferTs, checkOut). transferTs must be strictly inside the stay.
 */
export function splitStayAtTransfer(
  checkIn: Date,
  checkOut: Date,
  transferTs: Date,
): TransferSplit {
  const t = transferTs.getTime();
  if (!(t > checkIn.getTime() && t < checkOut.getTime())) {
    throw new BadRequestException(
      'transferAt must be strictly inside the current stay [checkIn, checkOut)',
    );
  }
  return {
    segmentA: {
      checkIn,
      checkOut: transferTs,
      nights: nightsBetween(checkIn, transferTs),
    },
    segmentB: {
      checkIn: transferTs,
      checkOut,
      nights: nightsBetween(transferTs, checkOut),
    },
  };
}

export type UpgradeMoneyPreview = {
  operation: 'upgrade' | 'transfer';
  livedNights: number;
  remainingNights: number;
  livedAmount: Decimal;
  oldRemainingAmount: Decimal;
  newRemainingAmount: Decimal;
  /** Catalog surcharge = newRemaining − oldRemaining (0 for same-class transfer). */
  suggestedSurcharge: Decimal;
  appliedSurcharge: Decimal;
  segmentAAmount: Decimal;
  segmentBAmount: Decimal;
  totalAmount: Decimal;
};

/**
 * Upgrade / transfer money at the split point.
 * - Same category → transfer: surcharge forced to 0; totals keep catalog sum of segments.
 * - Different category → upgrade: surcharge = new remaining − old remaining (editable).
 * Paid amounts are NOT touched here — caller sets remaining = total − paid.
 */
export function calcTransferMoney(params: {
  livedNights: number;
  remainingNights: number;
  counts: GuestCounts;
  oldPrices: CategoryPersonPrices;
  newPrices: CategoryPersonPrices;
  sameCategory: boolean;
  /** Admin override; ignored when sameCategory. */
  surchargeOverride?: Decimal | string | number | null;
}): UpgradeMoneyPreview {
  const {
    livedNights,
    remainingNights,
    counts,
    oldPrices,
    newPrices,
    sameCategory,
  } = params;

  const livedAmount = calcTotalAmount(livedNights, counts, oldPrices);
  const oldRemainingAmount = calcTotalAmount(
    remainingNights,
    counts,
    oldPrices,
  );
  const newRemainingAmount = calcTotalAmount(
    remainingNights,
    counts,
    newPrices,
  );

  if (sameCategory) {
    const segmentAAmount = livedAmount;
    const segmentBAmount = oldRemainingAmount;
    return {
      operation: 'transfer',
      livedNights,
      remainingNights,
      livedAmount,
      oldRemainingAmount,
      newRemainingAmount: oldRemainingAmount,
      suggestedSurcharge: new Decimal(0),
      appliedSurcharge: new Decimal(0),
      segmentAAmount,
      segmentBAmount,
      totalAmount: segmentAAmount.add(segmentBAmount).toDecimalPlaces(2),
    };
  }

  const suggestedSurcharge = newRemainingAmount
    .sub(oldRemainingAmount)
    .toDecimalPlaces(2);
  const appliedSurcharge =
    params.surchargeOverride != null
      ? toDecimal(params.surchargeOverride).toDecimalPlaces(2)
      : suggestedSurcharge;
  const segmentAAmount = livedAmount;
  const segmentBAmount = oldRemainingAmount
    .add(appliedSurcharge)
    .toDecimalPlaces(2);

  return {
    operation: 'upgrade',
    livedNights,
    remainingNights,
    livedAmount,
    oldRemainingAmount,
    newRemainingAmount,
    suggestedSurcharge,
    appliedSurcharge,
    segmentAAmount,
    segmentBAmount,
    totalAmount: segmentAAmount.add(segmentBAmount).toDecimalPlaces(2),
  };
}

/** Cost of added nights at current category age prices (extend). */
export function calcExtendAmount(
  addedNights: number,
  counts: GuestCounts,
  prices: CategoryPersonPrices,
): Decimal {
  if (addedNights < 1) {
    throw new BadRequestException('extend requires at least one added night');
  }
  return calcTotalAmount(addedNights, counts, prices);
}

export type ExtendMoneyPreview = {
  previousNights: number;
  addedNights: number;
  newNights: number;
  catalogAddedAmount: Decimal;
  appliedAddedAmount: Decimal;
  previousTotal: Decimal;
  newTotal: Decimal;
};

export function calcExtendMoney(params: {
  previousCheckIn: Date;
  previousCheckOut: Date;
  newCheckOut: Date;
  counts: GuestCounts;
  prices: CategoryPersonPrices;
  previousTotal: Decimal | string | number;
  /** Admin override for the added-nights charge. */
  addedAmountOverride?: Decimal | string | number | null;
}): ExtendMoneyPreview {
  if (!(params.newCheckOut.getTime() > params.previousCheckOut.getTime())) {
    throw new BadRequestException(
      'newCheckOut must be after the current checkOut',
    );
  }
  const previousNights = nightsBetween(
    params.previousCheckIn,
    params.previousCheckOut,
  );
  const newNights = nightsBetween(params.previousCheckIn, params.newCheckOut);
  const addedNights = newNights - previousNights;
  if (addedNights < 1) {
    // Same calendar night count (e.g. only time change later same day) —
    // still charge at least the extend window as 1 night when checkOut moves.
    // Spec: pay for added nights; if calendar nights unchanged, treat as 1.
    const forcedAdded = 1;
    const catalogAddedAmount = calcTotalAmount(
      forcedAdded,
      params.counts,
      params.prices,
    );
    const appliedAddedAmount =
      params.addedAmountOverride != null
        ? toDecimal(params.addedAmountOverride).toDecimalPlaces(2)
        : catalogAddedAmount;
    const previousTotal = toDecimal(params.previousTotal);
    return {
      previousNights,
      addedNights: forcedAdded,
      newNights: previousNights + forcedAdded,
      catalogAddedAmount,
      appliedAddedAmount,
      previousTotal,
      newTotal: previousTotal.add(appliedAddedAmount).toDecimalPlaces(2),
    };
  }

  const catalogAddedAmount = calcExtendAmount(
    addedNights,
    params.counts,
    params.prices,
  );
  const appliedAddedAmount =
    params.addedAmountOverride != null
      ? toDecimal(params.addedAmountOverride).toDecimalPlaces(2)
      : catalogAddedAmount;
  const previousTotal = toDecimal(params.previousTotal);
  return {
    previousNights,
    addedNights,
    newNights,
    catalogAddedAmount,
    appliedAddedAmount,
    previousTotal,
    newTotal: previousTotal.add(appliedAddedAmount).toDecimalPlaces(2),
  };
}

export function buildPriceBreakdown(params: {
  segments: Array<{
    segmentIndex: number;
    bookingRoomId: string;
    roomId: string;
    checkIn: Date;
    checkOut: Date;
    bedsBooked: number;
    amount: Decimal | string | number;
    isActive: boolean;
    nightlySubtotal?: string;
    nights?: number;
    categoryCode?: string;
    roomNumber?: string;
  }>;
  total: Decimal | string | number;
  lastAdjustment?: PriceBreakdown['lastAdjustment'];
}): PriceBreakdown {
  const segments: PriceBreakdownSegment[] = params.segments.map((s) => ({
    segmentIndex: s.segmentIndex,
    bookingRoomId: s.bookingRoomId,
    roomId: s.roomId,
    checkIn: s.checkIn.toISOString(),
    checkOut: s.checkOut.toISOString(),
    bedsBooked: s.bedsBooked,
    amount: decimalToString(s.amount),
    isActive: s.isActive,
    nightlySubtotal: s.nightlySubtotal,
    nights: s.nights,
    categoryCode: s.categoryCode,
    roomNumber: s.roomNumber,
  }));
  return {
    version: 1,
    segments,
    total: decimalToString(params.total),
    ...(params.lastAdjustment
      ? { lastAdjustment: params.lastAdjustment }
      : {}),
  };
}

/** Human-readable transfer instant for audit / events. */
export function formatTransferAt(instant: Date): string {
  return formatLocalDateTime(instant);
}

export function transferLocalParts(instant: Date): {
  date: string;
  time: string;
} {
  return {
    date: formatLocalDate(instant),
    time: formatLocalTime(instant),
  };
}
