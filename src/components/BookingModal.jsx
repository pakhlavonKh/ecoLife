import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAvailability } from '../api/availability';
import { createBooking } from '../api/bookings';
import { paymeCreateCard, paymePayReceipt } from '../api/payments';
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
  occupyingBeds,
  OPERATOR_PHONES,
  operatorPhonesDisplay,
  paymentProviders,
  phoneToE164,
  splitFullName,
  todayStr,
  translateCottageName,
} from '../utils/booking';

const dict = {
  ru: {
    paymeSubscribeTitle: "Оплата картой Payme",
    paymeCardNumber: "Номер карты",
    paymeCardExpiry: "Срок действия (ММ/ГГ)",
    paymeOtpTitle: "Подтверждение оплаты",
    paymeOtpText: "Мы отправили СМС-код на номер",
    paymeOtpCode: "Код из СМС",
    paymeConfirmAndPay: "Подтвердить и оплатить",
    paymeBackButton: "Назад",
  },
  uz: {
    paymeSubscribeTitle: "Payme kartasi orqali to‘lov",
    paymeCardNumber: "Karta raqami",
    paymeCardExpiry: "Amal qilish muddati (OO/YY)",
    paymeOtpTitle: "To‘lovni tasdiqlash",
    paymeOtpText: "Biz SMS kodni quyidagi raqamga yubordik:",
    paymeOtpCode: "SMS dan kod",
    paymeConfirmAndPay: "Tasdiqlash va to‘lash",
    paymeBackButton: "Orqaga",
  },
  en: {
    paymeSubscribeTitle: "Payme Card Payment",
    paymeCardNumber: "Card Number",
    paymeCardExpiry: "Expiration Date (MM/YY)",
    paymeOtpTitle: "Payment Confirmation",
    paymeOtpText: "We sent an SMS code to the phone number",
    paymeOtpCode: "SMS Code",
    paymeConfirmAndPay: "Confirm and Pay",
    paymeBackButton: "Back",
  }
};

/**
 * Age-based guest booking modal — adults/children occupy beds; infants do not.
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
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [rooms, setRooms] = useState([]);
  const [alternatives, setAlternatives] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [provider, setProvider] = useState(providers[0] || 'mock');
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [nights, setNights] = useState(0);
  const [requestResult, setRequestResult] = useState(null);

  const [step, setStep] = useState('form'); // 'form' | 'card_input' | 'sms_otp'
  const [paymentId, setPaymentId] = useState('');
  const [cardToken, setCardToken] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpire, setCardExpire] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsPhone, setSmsPhone] = useState('');

  const depositPercent =
    category.depositPercent ??
    DEFAULT_DEPOSIT[category.code] ??
    30;

  const bedsNeeded = occupyingBeds(adults, children);
  const selectedRoom = rooms.find((r) => r.id === roomId) || null;
  const prices = {
    priceAdult:
      selectedRoom?.priceAdult ??
      selectedRoom?.pricePerNight ??
      category.priceAdult ??
      category.pricePerBedPerNight ??
      category.priceFrom ??
      null,
    priceChild:
      selectedRoom?.priceChild ?? category.priceChild ?? 0,
    priceInfant:
      selectedRoom?.priceInfant ?? category.priceInfant ?? 0,
  };
  const preview =
    prices.priceAdult != null && nights > 0
      ? calcPreview(
          prices,
          { adults, children, infants },
          nights,
          depositPercent,
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
        guests: bedsNeeded,
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
    bedsNeeded,
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
        adults: Math.max(1, Number(adults) || 1),
        children: Math.max(0, Number(children) || 0),
        infants: Math.max(0, Number(infants) || 0),
      };
      if (paymentsEnabled) {
        payload.provider = provider;
      }

      const result = await createBooking(payload);

      if (paymentsEnabled && provider === 'payme' && result.paymentId) {
        setPaymentId(result.paymentId);
        setStep('card_input');
        return;
      }

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

  const handleCardNumberChange = (e) => {
    const rawValue = e.target.value;
    const cleanValue = rawValue.replace(/\D/g, '');
    const formattedParts = [];
    for (let i = 0; i < cleanValue.length; i += 4) {
      formattedParts.push(cleanValue.substring(i, i + 4));
    }
    setCardNumber(formattedParts.join(' '));
  };

  const handleCardExpireChange = (e) => {
    const rawValue = e.target.value;
    const cleanValue = rawValue.replace(/\D/g, '');
    if (cleanValue.length > 2) {
      setCardExpire(`${cleanValue.substring(0, 2)}/${cleanValue.substring(2, 4)}`);
    } else {
      setCardExpire(cleanValue);
    }
  };

  const handleCardSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const rawNumber = cardNumber.replace(/\s+/g, '');
    const rawExpire = cardExpire.replace(/[\s/]+/g, '');

    if (rawNumber.length < 16) {
      setError('Номер карты должен состоять из 16-20 цифр');
      return;
    }
    if (rawExpire.length < 4) {
      setError('Срок действия должен быть в формате ММ/ГГ');
      return;
    }

    setSubmitting(true);
    try {
      const res = await paymeCreateCard({
        number: rawNumber,
        expire: rawExpire,
      });

      setCardToken(res.token);

      if (res.verify) {
        setSmsPhone(res.phone || '');
        setStep('sms_otp');
      } else {
        const payRes = await paymePayReceipt({
          paymentId,
          token: res.token,
        });
        const mockBookingResult = {
          publicCode: payRes.bookingCode,
          requiresOperator: false,
        };
        onBooked?.(mockBookingResult);
        window.location.assign(
          `/booking/success?code=${encodeURIComponent(payRes.bookingCode)}`
        );
      }
    } catch (err) {
      setError(getErrorMessage(err, t('bookingError')));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSmsSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (smsCode.length < 6) {
      setError('СМС-код должен содержать 6 цифр');
      return;
    }

    setSubmitting(true);
    try {
      const payRes = await paymePayReceipt({
        paymentId,
        token: cardToken,
        code: smsCode,
      });

      const mockBookingResult = {
        publicCode: payRes.bookingCode,
        requiresOperator: false,
      };
      onBooked?.(mockBookingResult);
      window.location.assign(
        `/booking/success?code=${encodeURIComponent(payRes.bookingCode)}`
      );
    } catch (err) {
      setError(getErrorMessage(err, t('bookingError')));
    } finally {
      setSubmitting(false);
    }
  };

  const locale = i18n.language?.startsWith('uz')
    ? 'uz-UZ'
    : i18n.language?.startsWith('en')
      ? 'en-US'
      : 'ru-RU';

  const lang = i18n.language?.startsWith('uz')
    ? 'uz'
    : i18n.language?.startsWith('en')
      ? 'en'
      : 'ru';
  const mTrans = dict[lang];

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
        ) : step === 'card_input' ? (
          <form className="booking-modal__form" onSubmit={handleCardSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', fontWeight: '600' }}>
                {mTrans.paymeSubscribeTitle}
              </h3>
              {preview && (
                <p style={{ color: '#555', fontSize: '0.95rem' }}>
                  {t('bookingModal.deposit', { percent: depositPercent })}: <strong>{formatMoney(preview.deposit, locale)}</strong>
                </p>
              )}
            </div>

            <div className="booking-modal__grid">
              <label className="field field--full">
                <span>{mTrans.paymeCardNumber}</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={cardNumber}
                  onChange={handleCardNumberChange}
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  required
                />
              </label>
              <label className="field field--full">
                <span>{mTrans.paymeCardExpiry}</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={cardExpire}
                  onChange={handleCardExpireChange}
                  placeholder="ММ/ГГ"
                  maxLength={5}
                  required
                />
              </label>
            </div>

            {error ? (
              <p className="booking-modal__error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="booking-modal__actions">
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => setStep('form')}
                disabled={submitting}
              >
                {mTrans.paymeBackButton}
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={submitting || cardNumber.length < 19 || cardExpire.length < 5}
              >
                {submitting ? t('loading') : t('bookingModal.confirmPay')}
              </button>
            </div>
          </form>
        ) : step === 'sms_otp' ? (
          <form className="booking-modal__form" onSubmit={handleSmsSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', fontWeight: '600' }}>
                {mTrans.paymeOtpTitle}
              </h3>
              <p style={{ color: '#555', fontSize: '0.95rem' }}>
                {mTrans.paymeOtpText} <strong>{smsPhone}</strong>
              </p>
            </div>

            <div className="booking-modal__grid">
              <label className="field field--full">
                <span>{mTrans.paymeOtpCode}</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </label>
            </div>

            {error ? (
              <p className="booking-modal__error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="booking-modal__actions">
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => setStep('card_input')}
                disabled={submitting}
              >
                {mTrans.paymeBackButton}
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={submitting || smsCode.length < 6}
              >
                {submitting ? t('loading') : t('bookingModal.confirmPay')}
              </button>
            </div>
          </form>
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
                <span>{t('bookingModal.adults')}</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={adults}
                  onChange={(e) => setAdults(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>{t('bookingModal.children')}</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={children}
                  onChange={(e) => setChildren(e.target.value)}
                />
              </label>
              <label className="field">
                <span>{t('bookingModal.infants')}</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={infants}
                  onChange={(e) => setInfants(e.target.value)}
                />
              </label>
            </div>
            <p className="booking-modal__hint">
              {t('bookingModal.guestAgeHint')}
            </p>

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
                  {t('bookingModal.guestsBreakdown', {
                    adults: preview.adults,
                    children: preview.children,
                    infants: preview.infants,
                  })}
                </p>
                <p className="booking-modal__hint">
                  {t('bookingModal.priceBreakdown', {
                    adults: preview.adults,
                    priceAdult: formatMoney(preview.priceAdult, locale),
                    children: preview.children,
                    priceChild: formatMoney(preview.priceChild, locale),
                    infants: preview.infants,
                    priceInfant: formatMoney(preview.priceInfant, locale),
                    nightly: formatMoney(preview.nightly, locale),
                    nights: preview.nights,
                  })}
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
