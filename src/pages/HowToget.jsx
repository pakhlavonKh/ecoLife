import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import arrive2 from '../assets/arrive-2.webp';
import arrive3 from '../assets/arrive-3.webp';
import arrive4 from '../assets/arrive-4.webp';
import arrive5 from '../assets/arrive-5.webp';
import arrive6 from '../assets/arrive-6.webp';

const DEST = {
  lat: 41.6671593,
  lng: 69.9078047,
  name: 'Eco-Life Etiqod',
};

const MAP_DELTA = 0.035;
const MAP_EMBED = `https://www.openstreetmap.org/export/embed.html?bbox=${DEST.lng - MAP_DELTA}%2C${DEST.lat - MAP_DELTA}%2C${DEST.lng + MAP_DELTA}%2C${DEST.lat + MAP_DELTA}&layer=mapnik&marker=${DEST.lat}%2C${DEST.lng}`;

function detectPlatform() {
  if (typeof navigator === 'undefined') {
    return { mobile: false, ios: false, android: false };
  }

  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  const mobile =
    ios ||
    android ||
    /Mobile/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Mac/i.test(ua));

  return { mobile, ios, android };
}

/** HTTPS universal links — OS hands off to the installed app when possible. */
function buildWebLink(appId) {
  const { lat, lng, name } = DEST;
  const dest = `${lat},${lng}`;
  const label = encodeURIComponent(name);

  if (appId === 'google') {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
  }
  if (appId === 'yandex') {
    return `https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`;
  }
  if (appId === 'dgis') {
    // 2GIS uses lon,lat order
    return `https://2gis.uz/routeSearch/to/${lng},${lat}/tab/car`;
  }
  return `https://maps.apple.com/?daddr=${lat},${lng}&q=${label}&dirflg=d`;
}

/**
 * Native schemes (optional nudge). Never assigned to window.location —
 * that unloads the SPA and can leave a blank page on return.
 */
function buildAppScheme(appId, platform) {
  const { lat, lng, name } = DEST;
  const label = encodeURIComponent(name);

  if (appId === 'google') {
    if (platform.ios) {
      return `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
    }
    return null;
  }
  if (appId === 'yandex') {
    return `yandexmaps://maps.yandex.ru/?rtext=~${lat},${lng}&rtt=auto`;
  }
  if (appId === 'dgis') {
    return `dgis://2gis.ru/routeSearch/to/${lng},${lat}/tab/car`;
  }
  if (appId === 'apple' && (platform.ios || !platform.android)) {
    return `maps://?daddr=${lat},${lng}&q=${label}&dirflg=d`;
  }
  return null;
}

/** Open in a new browsing context — our React tab stays mounted. */
function openInNewTab(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Probe a custom scheme without navigating the current document. */
function probeAppScheme(schemeUrl) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'display:none;width:0;height:0;border:0;position:absolute;left:-9999px';
  iframe.src = schemeUrl;
  document.body.appendChild(iframe);
  window.setTimeout(() => {
    iframe.remove();
  }, 2000);
}

function openMapApp(appId) {
  const platform = detectPlatform();
  const web = buildWebLink(appId);
  const scheme = platform.mobile ? buildAppScheme(appId, platform) : null;

  // 1) Keep this tab alive: always open HTTPS in a new tab.
  //    On phones, App Links / Universal Links usually open the native app.
  openInNewTab(web);

  // 2) Extra nudge via hidden iframe (does not unload our page).
  if (scheme) {
    probeAppScheme(scheme);
  }
}

function HowToGet() {
  const { t } = useTranslation();
  const titleId = useId();
  const closeBtnRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const platform = useMemo(() => detectPlatform(), []);

  const mapApps = useMemo(() => {
    const apps = [
      { id: 'google', labelKey: 'mapGoogle' },
      { id: 'yandex', labelKey: 'mapYandex' },
      { id: 'dgis', labelKey: 'mapDgis' },
    ];

    // Apple Maps is useful on iPhone / iPad / Mac; hide on Android.
    if (!platform.android) {
      apps.push({ id: 'apple', labelKey: 'mapApple' });
    }

    return apps;
  }, [platform.android]);

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
  const closePicker = () => setPickerOpen(false);

  const openInApp = (appId) => {
    // Unlock scroll immediately — don't leave the page frozen if React
    // effect cleanup is delayed while the user switches to Maps.
    document.body.style.overflow = '';
    setPickerOpen(false);
    openMapApp(appId);
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
                aria-label={t('mapClose')}
              >
                ×
              </button>
            </div>

            <p className="map-picker__lead">{t('mapPickerLead')}</p>

            <div className="map-picker__apps">
              {mapApps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className="map-picker__app"
                  onClick={() => openInApp(app.id)}
                >
                  <span className="map-picker__app-name">{t(app.labelKey)}</span>
                  <span className="map-picker__app-meta">{t('mapOpenRoute')}</span>
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
