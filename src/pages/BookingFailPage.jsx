import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function BookingFailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const code = (params.get('code') || '').toUpperCase();

  return (
    <div className="booking-result-page">
      <div className="container">
        <header className="page-head">
          <p className="eyebrow">{t('booking')}</p>
          <h1 className="page-head__title">{t('bookingFailTitle')}</h1>
          <p className="page-head__lead">{t('bookingFailLead')}</p>
        </header>

        <div className="booking-result-card">
          {code ? (
            <p className="booking-result-card__code">
              {t('bookingCode')}: <strong>{code}</strong>
            </p>
          ) : null}
          <p>{t('bookingFailHint')}</p>
          <div className="booking-result-card__actions">
            <Link to="/booking" className="btn btn--primary">
              {t('bookingFailRetry')}
            </Link>
            <a href="tel:+998559000110" className="btn btn--outline">
              {t('callUs')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BookingFailPage;
