import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAvailability } from '../api/availability';
import { fetchCategories } from '../api/categories';
import { getErrorMessage } from '../api/client';
import BookingModal from '../components/BookingModal';
import {
  defaultCheckIn,
  defaultCheckOut,
  formatMoney,
  sortCategories,
  todayStr,
} from '../utils/booking';

import roomStandart from '../assets/room-1.webp';
import roomLux from '../assets/room-3.webp';

const FALLBACK_IMAGES = {
  standart: roomStandart,
  lux: roomLux,
};

function categoryImage(category) {
  if (category.images?.length) {
    return category.images[0];
  }
  return FALLBACK_IMAGES[category.code] || roomStandart;
}

function BookingPage() {
  const { t, i18n } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [availability, setAvailability] = useState(null);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [error, setError] = useState('');
  const [modalCategory, setModalCategory] = useState(null);

  const locale = i18n.language?.startsWith('uz')
    ? 'uz-UZ'
    : i18n.language?.startsWith('en')
      ? 'en-US'
      : 'ru-RU';

  const availByCode = useMemo(() => {
    const map = {};
    for (const c of availability?.categories || []) {
      map[c.code] = c;
    }
    return map;
  }, [availability]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCats(true);
      try {
        const data = await fetchCategories();
        if (!cancelled) {
          setCategories(sortCategories(data));
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, t('networkError')));
        }
      } finally {
        if (!cancelled) setLoadingCats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const loadAvailability = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    setLoadingAvail(true);
    try {
      const data = await fetchAvailability({ checkIn, checkOut });
      setAvailability(data);
      setError('');
    } catch (err) {
      setAvailability(null);
      setError(getErrorMessage(err, t('networkError')));
    } finally {
      setLoadingAvail(false);
    }
  }, [checkIn, checkOut, t]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  return (
    <div className="booking-page">
      <div className="container">
        <header className="page-head">
          <p className="eyebrow">{t('roomsEyebrow')}</p>
          <h1 className="page-head__title">{t('roomsTitle')}</h1>
          <p className="page-head__lead">{t('roomsLead')}</p>
        </header>

        <section className="booking-dates" aria-label={t('bookingDatesTitle')}>
          <div className="booking-dates__grid">
            <label className="field">
              <span>{t('check-in')}</span>
              <input
                type="date"
                value={checkIn}
                min={todayStr()}
                onChange={(e) => {
                  const next = e.target.value;
                  setCheckIn(next);
                  if (checkOut && checkOut <= next) {
                    setCheckOut('');
                  }
                }}
              />
            </label>
            <label className="field">
              <span>{t('check-out')}</span>
              <input
                type="date"
                value={checkOut}
                min={checkIn || todayStr()}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </label>
          </div>
          <p className="booking-dates__meta">
            {loadingAvail
              ? t('loading')
              : availability
                ? t('bookingDatesNights', { count: availability.nights })
                : t('bookingDatesHint')}
          </p>
        </section>

        {error ? (
          <p className="booking-page__error" role="alert">
            {error}
          </p>
        ) : null}

        {loadingCats ? (
          <p className="booking-page__hint">{t('loading')}</p>
        ) : (
          <div className="rooms-grid rooms-grid--two">
            {categories.map((cat) => {
              const avail = availByCode[cat.code];
              const priceLabel =
                cat.priceFrom != null
                  ? cat.priceFrom === cat.priceTo
                    ? formatMoney(cat.priceFrom, locale)
                    : t('priceFrom', {
                        price: formatMoney(cat.priceFrom, locale),
                      })
                  : t('priceUnavailable');

              return (
                <article className="room-card" key={cat.id}>
                  <div className="room-card__media">
                    <img
                      src={categoryImage(cat)}
                      alt={cat.name}
                      loading="lazy"
                    />
                  </div>
                  <div className="room-card__body">
                    <h3>{cat.name}</h3>
                    <p>{cat.description || t(`roomsData.${cat.code}.description`)}</p>
                    <ul className="room-card__meta">
                      <li>
                        <strong>{t('pricePerNight')}</strong>
                        {': '}
                        {priceLabel}
                      </li>
                      <li>
                        <strong>{t('depositPercent')}</strong>
                        {`: ${cat.depositPercent}%`}
                      </li>
                      {avail ? (
                        <li>
                          <strong>{t('availability')}</strong>
                          {': '}
                          {t('availableRoomsCount', {
                            count: avail.availableRoomsCount,
                          })}
                          {' · '}
                          {t('availableBedsCount', {
                            count: avail.availableBeds,
                          })}
                        </li>
                      ) : null}
                    </ul>
                    <button
                      type="button"
                      className="btn btn--primary room-card__button"
                      disabled={!availability || !avail}
                      onClick={() => setModalCategory(cat)}
                    >
                      {t('bookNow')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <section className="section section--tight">
          <div className="contact-band">
            <div>
              <p className="eyebrow">{t('contact')}</p>
              <h2 className="contact-band__title">{t('contactTitle')}</h2>
              <p className="contact-band__text">{t('contactLead')}</p>
            </div>
            <div className="contact-band__actions">
              <a href="tel:+998559000110" className="btn btn--paper">
                +998 55 900 01 10
              </a>
              <a href="tel:+998981505080" className="btn btn--paper">
                +998 98 150 50 80
              </a>
              <a
                href="https://t.me/EcoLifeEtiqod"
                className="btn btn--line"
                target="_blank"
                rel="noopener noreferrer"
              >
                Telegram
              </a>
            </div>
          </div>
        </section>
      </div>

      {modalCategory ? (
        <BookingModal
          category={modalCategory}
          initialCheckIn={checkIn}
          initialCheckOut={checkOut}
          onClose={() => {
            setModalCategory(null);
            loadAvailability();
          }}
        />
      ) : null}
    </div>
  );
}

export default BookingPage;
