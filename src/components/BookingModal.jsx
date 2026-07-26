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
import {
  calcPreview,
  formatMoney,
  formatPhoneMask,
  isValidUzPhone,
  nightsBetween,
  OPERATOR_PHONES,
  operatorPhonesDisplay,
  paymentProviders,
  phoneToE164,
  splitFullName,
  todayStr,
  translateCottageName,
} from '../utils/booking';

/**
 * Whole-room booking modal (AGENTS §6).
 * When PAYMENTS_ENABLED=false: pre-request (no payment redirect).
 */
function BookingModal({
  category,
  initialCheckIn,
  initialCheckOut,
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
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [provider, setProvider] = useState(providers[0] || 'mock');
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [nights, setNights] = useState(0);
  const [requestResult, setRequestResult] = useState(null);

  const selectedRoom = rooms.find((r) => r.id === roomId) || null;
  const preview =
    selectedRoom && nights > 0
      ? calcPreview(
          selectedRoom.pricePerNight,
          nights,
          category.depositPercent,
        )
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

  const loadRooms = useCallback(async () => {
    if (!checkIn || !checkOut || !category?.code) return;
    if (nightsBetween(checkIn, checkOut) < 1) {
      setRooms([]);
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
        categoryCode: category.code,
        guests: Number(guests) || 1,
      });
      setNights(data.nights);
      const list = data.categories?.[0]?.availableRooms ?? [];
      setRooms(list);
      setRoomId((prev) =>
        list.some((r) => r.id === prev) ? prev : list[0]?.id || '',
      );
      if (list.length === 0) {
        setError(t('bookingModal.noRooms'));
      }
    } catch (err) {
      setRooms([]);
      setRoomId('');
      setError(getErrorMessage(err, t('networkError')));
    } finally {
      setLoadingRooms(false);
    }
  }, [checkIn, checkOut, category?.code, guests, t]);

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
        guests: Number(guests),
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
        setError(t('bookingModal.roomTaken'));
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
                : category.name}
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
                <span>{t('check-out')}</span>
                <DateField
                  value={checkOut}
                  min={checkIn || todayStr()}
                  onChange={setCheckOut}
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
                          <span>
                            {t('bookingModal.capacity', {
                              count: room.capacity,
                            })}
                            {' · '}
                            {formatMoney(room.pricePerNight, locale)}
                            {t('bookingModal.perNight')}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

            {preview && (
              <div className="booking-modal__summary">
                <p>
                  {t('bookingModal.nights', { count: preview.nights })}
                  {' · '}
                  {formatMoney(preview.pricePerNight, locale)}
                  {t('bookingModal.perNight')}
                </p>
                <dl>
                  <div>
                    <dt>{t('bookingModal.total')}</dt>
                    <dd>{formatMoney(preview.total, locale)}</dd>
                  </div>
                  <div>
                    <dt>
                      {t('bookingModal.deposit', {
                        percent: category.depositPercent,
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
