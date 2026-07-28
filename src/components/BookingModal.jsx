import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAvailability } from '../api/availability';
import { createBooking } from '../api/bookings';
import { getErrorMessage, isConflictError } from '../api/client';
import {
  fetchPublicConfig,
  paymentsEnabledFromEnv,
} from '../api/config';
import DateField from './DateField';
import TimeField from './TimeField';
import {
  billedNights,
  calcPreview,
  DEFAULT_CHECK_IN_TIME,
  DEFAULT_CHECK_OUT_TIME,
  DEFAULT_DEPOSIT,
  formatMoney,
  formatPhoneMask,
  isValidStay,
  isValidUzPhone,
  normalizeAvailableRoom,
  OPERATOR_PHONES,
  operatorPhonesDisplay,
  paymentProviders,
  phoneToE164,
  splitFullName,
  todayStr,
  translateCottageName,
} from '../utils/booking';

/**
 * Shared-room (per-bed) booking modal — bed mode + datetime stay (HOURLY.md §6).
 * Guest sees remaining beds and available-from times only; never co-occupant identities.
 */
function BookingModal({
  category,
  initialCheckIn,
  initialCheckOut,
  initialCheckInTime = DEFAULT_CHECK_IN_TIME,
  initialCheckOutTime = DEFAULT_CHECK_OUT_TIME,
  onClose,
  onBooked,
}) {
  const { t, i18n } = useTranslation();
  const providers = paymentProviders();

  const [paymentsEnabled, setPaymentsEnabled] = useState(
    paymentsEnabledFromEnv(),
  );
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+998 ');
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [checkInTime, setCheckInTime] = useState(
    initialCheckInTime || DEFAULT_CHECK_IN_TIME,
  );
  const [checkOutTime, setCheckOutTime] = useState(
    initialCheckOutTime || DEFAULT_CHECK_OUT_TIME,
  );
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState([]);
  const [alternatives, setAlternatives] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [provider, setProvider] = useState(providers[0] || 'mock');
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [nights, setNights] = useState(0);
  const [requestResult, setRequestResult] = useState(null);

  const depositPercent =
    category.depositPercent ??
    DEFAULT_DEPOSIT[category.code] ??
    30;

  const guestCount = Math.max(1, Number(guests) || 1);
  const selectedRoom = rooms.find((r) => r.id === roomId) || null;
  const pricePerBed =
    selectedRoom?.pricePerNight ??
    category.pricePerBedPerNight ??
    category.priceFrom ??
    null;
  const preview =
    pricePerBed != null && nights > 0
      ? calcPreview(pricePerBed, guestCount, nights, depositPercent)
      : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchPublicConfig();
        if (!cancelled && typeof cfg?.paymentsEnabled === 'boolean') {
          setPaymentsEnabled(cfg.paymentsEnabled);
        }
      } catch {
        // Keep VITE / default fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyAvailableFrom = (hint) => {
    if (!hint?.date || !hint?.time) return;
    setCheckIn(hint.date);
    setCheckInTime(hint.time);
  };

  const loadRooms = useCallback(async () => {
    if (!checkIn || !checkOut || !category?.code) return;
    if (!isValidStay(checkIn, checkOut, checkInTime, checkOutTime)) {
      setRooms([]);
      setAlternatives([]);
      setRoomId('');
      setNights(0);
      setError(t('bookingModal.invalidDates'));
      return;
    }

    setLoadingRooms(true);
    setError('');
    try {
      const data = await fetchAvailability({
        checkIn,
        checkOut,
        checkInTime,
        checkOutTime,
        categoryCode: category.code,
        guests: guestCount,
      });
      setNights(
        data.nights != null
          ? Number(data.nights)
          : billedNights(checkIn, checkOut),
      );
      const cat = data.categories?.[0];
      const list = (cat?.availableRooms ?? [])
        .map(normalizeAvailableRoom)
        .filter(Boolean);
      const alts = (cat?.alternatives ?? [])
        .map(normalizeAvailableRoom)
        .filter((r) => r && r.availableFrom);
      setRooms(list);
      setAlternatives(alts);
      setRoomId((prev) =>
        list.some((r) => r.id === prev) ? prev : list[0]?.id || '',
      );
      if (list.length === 0) {
        setError(
          alts.length > 0
            ? t('bookingModal.noRoomsTryAlt')
            : t('bookingModal.noRooms'),
        );
      }
    } catch (err) {
      setRooms([]);
      setAlternatives([]);
      setRoomId('');
      setError(getErrorMessage(err, t('networkError')));
    } finally {
      setLoadingRooms(false);
    }
  }, [
    checkIn,
    checkOut,
    checkInTime,
    checkOutTime,
    category?.code,
    guestCount,
    t,
  ]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handlePhoneChange = (e) => {
    setPhone(formatPhoneMask(e.target.value));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const { firstName, lastName } = splitFullName(fullName);
    // Allow short aliases / initials (2+ chars); surname is optional.
    if (firstName.length < 2) {
      setError(t('invalidName'));
      return;
    }
    if (!isValidUzPhone(phone)) {
      setError(t('invalidPhone'));
      return;
    }
    if (!roomId) {
      setError(t('bookingModal.pickRoom'));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        firstName,
        lastName,
        phone: phoneToE164(phone),
        roomId,
        checkIn,
        checkOut,
        checkInTime,
        checkOutTime,
        guests: guestCount,
      };
      if (paymentsEnabled) {
        payload.provider = provider;
      }

      const result = await createBooking(payload);

      if (result.paymentUrl) {
        onBooked?.(result);
        window.location.assign(result.paymentUrl);
        return;
      }

      if (result.requiresOperator) {
        onBooked?.(result);
        setRequestResult(result);
        return;
      }

      setError(t('bookingError'));
    } catch (err) {
      if (isConflictError(err)) {
        setError(
          getErrorMessage(err, t('bookingModal.bedsUnavailable')),
        );
        await loadRooms();
      } else {
        setError(getErrorMessage(err, t('bookingError')));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const locale = i18n.language?.startsWith('uz')
    ? 'uz-UZ'
    : i18n.language?.startsWith('en')
      ? 'en-US'
      : 'ru-RU';

  const formatFromHint = (hint) => {
    if (!hint) return '';
    const dateLabel = (() => {
      try {
        return new Date(`${hint.date}T12:00:00`).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
        });
      } catch {
        return hint.date;
      }
    })();
    return t('bookingModal.availableFrom', {
      date: dateLabel,
      time: hint.time,
    });
  };

  return (
    <div
      className="booking-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <button
        type="button"
        className="booking-modal__backdrop"
        aria-label={t('cancel')}
        onClick={onClose}
      />
      <div className="booking-modal__panel">
        <header className="booking-modal__head">
          <div>
            <p className="eyebrow">{t('bookingModal.eyebrow')}</p>
            <h2 id="booking-modal-title" className="booking-modal__title">
              {requestResult
                ? t('bookingModal.requestSubmittedTitle')
                : t(`roomsData.${category.code}.title`, {
                    defaultValue: category.name,
                  })}
            </h2>
          </div>
          <button
            type="button"
            className="booking-modal__close"
            onClick={onClose}
            aria-label={t('cancel')}
          >
            ×
          </button>
        </header>

        {requestResult ? (
          <div className="booking-modal__request-ok">
            <p>
              {t('bookingModal.requestSubmitted', {
                phones: operatorPhonesDisplay(),
              })}
            </p>
            {requestResult.publicCode ? (
              <p className="booking-modal__request-code">
                <span>{t('bookingModal.requestCode')}</span>
                <strong>{requestResult.publicCode}</strong>
              </p>
            ) : null}
            <ul className="booking-modal__operator-phones">
              {OPERATOR_PHONES.map((p) => (
                <li key={p.tel}>
                  <a href={`tel:${p.tel}`}>{p.display}</a>
                </li>
              ))}
            </ul>
            <div className="booking-modal__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={onClose}
              >
                {t('bookingModal.close')}
              </button>
            </div>
          </div>
        ) : (
          <form className="booking-modal__form" onSubmit={handleSubmit}>
            <div className="booking-modal__grid">
              <label className="field field--full">
                <span>{t('bookingModal.fullName')}</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('bookingModal.fullName')}
                  required
                />
              </label>
              <label className="field field--full">
                <span>{t('phoneN')}</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="+998 90 123 45 67"
                  required
                />
              </label>
              <label className="field">
                <span>{t('check-in')}</span>
                <DateField
                  value={checkIn}
                  min={todayStr()}
                  onChange={setCheckIn}
                  required
                />
              </label>
              <label className="field">
                <span>{t('bookingModal.checkInTime')}</span>
                <TimeField
                  value={checkInTime}
                  onChange={setCheckInTime}
                  required
                />
              </label>
              <label className="field">
                <span>{t('check-out')}</span>
                <DateField
                  value={checkOut}
                  min={checkIn || todayStr()}
                  onChange={setCheckOut}
                  required
                />
              </label>
              <label className="field">
                <span>{t('bookingModal.checkOutTime')}</span>
                <TimeField
                  value={checkOutTime}
                  onChange={setCheckOutTime}
                  required
                />
              </label>
              <label className="field">
                <span>{t('guests')}</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                  required
                />
              </label>
            </div>

            <fieldset className="booking-modal__rooms">
              <legend>{t('bookingModal.availableRooms')}</legend>
              {loadingRooms ? (
                <p className="booking-modal__hint">{t('loading')}</p>
              ) : rooms.length === 0 ? (
                <p className="booking-modal__hint">
                  {t('bookingModal.noRooms')}
                </p>
              ) : (
                <ul className="room-pick-list">
                  {rooms.map((room) => (
                    <li key={room.id}>
                      <label className="room-pick">
                        <input
                          type="radio"
                          name="roomId"
                          value={room.id}
                          checked={roomId === room.id}
                          onChange={() => setRoomId(room.id)}
                        />
                        <span className="room-pick__body">
                          <strong>
                            {t('bookingModal.roomLabel', {
                              number: room.number,
                              cottage: translateCottageName(
                                room.cottageName,
                                t,
                              ),
                            })}
                          </strong>
                          <span className="room-pick__beds">
                            {t('bookingModal.remainingBeds', {
                              remaining: room.remainingBeds,
                              capacity: room.capacity,
                            })}
                          </span>
                          <span>
                            {formatMoney(room.pricePerNight, locale)}
                            {t('bookingModal.perBedNight')}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

            {alternatives.length > 0 ? (
              <div className="booking-modal__alts">
                <p className="booking-modal__alts-title">
                  {t('bookingModal.alternativesTitle')}
                </p>
                <ul className="room-pick-list room-pick-list--alts">
                  {alternatives.map((room) => (
                    <li key={`alt-${room.id}`}>
                      <div className="room-pick room-pick--alt">
                        <span className="room-pick__body">
                          <strong>
                            {t('bookingModal.roomLabel', {
                              number: room.number,
                              cottage: translateCottageName(
                                room.cottageName,
                                t,
                              ),
                            })}
                          </strong>
                          <span className="room-pick__beds">
                            {formatFromHint(room.availableFrom)}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="btn btn--outline room-pick__apply"
                          onClick={() =>
                            applyAvailableFrom(room.availableFrom)
                          }
                        >
                          {t('bookingModal.useAvailableFrom', {
                            time: room.availableFrom?.time,
                          })}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview && (
              <div className="booking-modal__summary">
                <p>
                  {t('bookingModal.nights', { count: preview.nights })}
                  {' · '}
                  {t('bookingModal.guestsLine', { count: preview.guests })}
                  {' · '}
                  {formatMoney(preview.pricePerBedPerNight, locale)}
                  {t('bookingModal.perBedNight')}
                </p>
                <dl>
                  <div>
                    <dt>{t('bookingModal.total')}</dt>
                    <dd>{formatMoney(preview.total, locale)}</dd>
                  </div>
                  <div>
                    <dt>
                      {t('bookingModal.deposit', {
                        percent: depositPercent,
                      })}
                    </dt>
                    <dd>{formatMoney(preview.deposit, locale)}</dd>
                  </div>
                  <div>
                    <dt>{t('bookingModal.remaining')}</dt>
                    <dd>{formatMoney(preview.remaining, locale)}</dd>
                  </div>
                </dl>
                <p className="booking-modal__hint">
                  {paymentsEnabled
                    ? t('bookingModal.depositNote')
                    : t('bookingModal.depositNoteRequest')}
                </p>
              </div>
            )}

            {paymentsEnabled ? (
              <fieldset className="booking-modal__providers">
                <legend>{t('bookingModal.payWith')}</legend>
                <div className="provider-picks">
                  {providers.map((p) => (
                    <label key={p} className="provider-pick">
                      <input
                        type="radio"
                        name="provider"
                        value={p}
                        checked={provider === p}
                        onChange={() => setProvider(p)}
                      />
                      <span>{t(`bookingModal.providers.${p}`)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {error ? (
              <p className="booking-modal__error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="booking-modal__actions">
              <button
                type="button"
                className="btn btn--outline"
                onClick={onClose}
                disabled={submitting}
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={submitting || !roomId || loadingRooms}
              >
                {submitting
                  ? t('loading')
                  : paymentsEnabled
                    ? t('bookingModal.confirmPay')
                    : t('bookingModal.confirmRequest')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default BookingModal;
