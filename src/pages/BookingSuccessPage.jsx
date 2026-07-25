import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchBookingByCode } from '../api/bookings';
import { getErrorMessage } from '../api/client';
import {
  formatMoney,
  isoToDisplayDate,
  translateCottageName,
} from '../utils/booking';

function BookingSuccessPage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const code = (params.get('code') || '').toUpperCase();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(code));

  const locale = i18n.language?.startsWith('uz')
    ? 'uz-UZ'
    : i18n.language?.startsWith('en')
      ? 'en-US'
      : 'ru-RU';

  useEffect(() => {
    if (!code) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchBookingByCode(code);
        if (!cancelled) setBooking(data);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, t('networkError')));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, t]);

  return (
    <div className="booking-result-page">
      <div className="container">
        <header className="page-head">
          <p className="eyebrow">{t('booking')}</p>
          <h1 className="page-head__title">{t('bookingSuccessTitle')}</h1>
          <p className="page-head__lead">{t('bookingSuccessLead')}</p>
        </header>

        <div className="booking-result-card">
          {loading ? <p>{t('loading')}</p> : null}
          {!loading && code ? (
            <p className="booking-result-card__code">
              {t('bookingCode')}: <strong>{code}</strong>
            </p>
          ) : null}
          {!loading && !code ? (
            <p>{t('bookingSuccessNoCode')}</p>
          ) : null}
          {error ? <p className="booking-page__error">{error}</p> : null}
          {booking ? (
            <dl className="booking-result-card__meta">
              <div>
                <dt>{t('check-in')}</dt>
                <dd>{isoToDisplayDate(booking.checkIn) || booking.checkIn}</dd>
              </div>
              <div>
                <dt>{t('check-out')}</dt>
                <dd>{isoToDisplayDate(booking.checkOut) || booking.checkOut}</dd>
              </div>
              <div>
                <dt>{t('bookingModal.total')}</dt>
                <dd>{formatMoney(booking.totalAmount, locale)}</dd>
              </div>
              <div>
                <dt>{t('bookingModal.depositPaid')}</dt>
                <dd>{formatMoney(booking.paidAmount || booking.depositAmount, locale)}</dd>
              </div>
              <div>
                <dt>{t('bookingModal.remaining')}</dt>
                <dd>{formatMoney(booking.remainingAmount, locale)}</dd>
              </div>
              {booking.rooms?.[0] ? (
                <div>
                  <dt>{t('bookingModal.room')}</dt>
                  <dd>
                    {booking.rooms[0].number} ·{' '}
                    {translateCottageName(booking.rooms[0].cottageName, t)}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <div className="booking-result-card__actions">
            <Link to="/" className="btn btn--outline">
              {t('home')}
            </Link>
            <Link to="/booking" className="btn btn--primary">
              {t('booking')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BookingSuccessPage;
