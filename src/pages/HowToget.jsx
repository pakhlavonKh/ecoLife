import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import arrive2 from '../assets/arrive-2.webp';
import arrive3 from '../assets/arrive-3.webp';
import arrive4 from '../assets/arrive-4.webp';
import arrive5 from '../assets/arrive-5.webp';
import arrive6 from '../assets/arrive-6.webp';

const DEST = {
  lat: 41.6671593,
  lng: 69.9078047,
};

const MAP_EMBED = `https://www.google.com/maps?q=${DEST.lat},${DEST.lng}&z=14&output=embed`;

const MAP_APPS = [
  { id: 'google', labelKey: 'mapGoogle' },
  { id: 'yandex', labelKey: 'mapYandex' },
  { id: 'apple', labelKey: 'mapApple' },
];

function buildMapUrl(appId, origin) {
  const dest = `${DEST.lat},${DEST.lng}`;

  if (appId === 'google') {
    if (origin) {
      return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
    }
    return `https://www.google.com/maps/dir/?api=1&origin=Current+Location&destination=${encodeURIComponent(dest)}&travelmode=driving`;
  }

  if (appId === 'yandex') {
    if (origin) {
      return `https://yandex.ru/maps/?rtext=${origin.lat},${origin.lng}~${DEST.lat},${DEST.lng}&rtt=auto`;
    }
    return `https://yandex.ru/maps/?rtext=~${DEST.lat},${DEST.lng}&rtt=auto`;
  }

  // Apple Maps
  if (origin) {
    return `https://maps.apple.com/?saddr=${origin.lat},${origin.lng}&daddr=${DEST.lat},${DEST.lng}&dirflg=d`;
  }
  return `https://maps.apple.com/?daddr=${DEST.lat},${DEST.lng}&dirflg=d`;
}

function getCurrentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60_000,
      }
    );
  });
}

function HowToGet() {
  const { t } = useTranslation();
  const titleId = useId();
  const closeBtnRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openingApp, setOpeningApp] = useState(null);

  const steps = [
    { title: t('step2'), img: arrive2 },
    { title: t('step3'), img: arrive3 },
    { title: t('step4'), img: arrive4 },
    { title: t('step5'), img: arrive5 },
    { title: t('step6'), img: arrive6 },
  ];

  useEffect(() => {
    if (!pickerOpen) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [pickerOpen]);

  const openPicker = () => setPickerOpen(true);
  const closePicker = () => {
    if (openingApp) return;
    setPickerOpen(false);
  };

  const openInApp = async (appId) => {
    setOpeningApp(appId);
    const origin = await getCurrentPosition();
    const url = buildMapUrl(appId, origin);
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpeningApp(null);
    setPickerOpen(false);
  };

  const onMapKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

  return (
    <div className="how-to-get">
      <div className="container">
        <header className="page-head">
          <p className="eyebrow">{t('howToGetEyebrow')}</p>
          <h1 className="page-head__title">{t('howToGet')}</h1>
          <p className="page-head__lead">{t('howToGetLead')}</p>
        </header>

        <div
          className="map-card"
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={onMapKeyDown}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          aria-label={t('mapHint')}
        >
          <iframe
            title={t('howToGet')}
            src={MAP_EMBED}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
          <span className="map-card__hint">{t('mapHint')}</span>
        </div>

        <ol className="steps">
          {steps.map((step) => (
            <li className="step-card" key={step.title}>
              <div className="step-card__media">
                <img src={step.img} alt="" loading="lazy" />
              </div>
              <div className="step-card__body">
                <h3>{step.title}</h3>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {pickerOpen && (
        <div className="map-picker" role="presentation" onClick={closePicker}>
          <div
            className="map-picker__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="map-picker__head">
              <h2 id={titleId} className="map-picker__title">
                {t('mapPickerTitle')}
              </h2>
              <button
                ref={closeBtnRef}
                type="button"
                className="map-picker__close"
                onClick={closePicker}
                disabled={Boolean(openingApp)}
                aria-label={t('mapClose')}
              >
                ×
              </button>
            </div>

            <p className="map-picker__lead">{t('mapPickerLead')}</p>

            <div className="map-picker__apps">
              {MAP_APPS.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className="map-picker__app"
                  onClick={() => openInApp(app.id)}
                  disabled={Boolean(openingApp)}
                >
                  <span className="map-picker__app-name">{t(app.labelKey)}</span>
                  <span className="map-picker__app-meta">
                    {openingApp === app.id ? t('mapLocating') : t('mapOpenRoute')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HowToGet;
