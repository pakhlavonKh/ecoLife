import React from 'react';
import { useTranslation } from 'react-i18next';

import arrive2 from '../assets/arrive-2.webp';
import arrive3 from '../assets/arrive-3.webp';
import arrive4 from '../assets/arrive-4.webp';
import arrive5 from '../assets/arrive-5.webp';
import arrive6 from '../assets/arrive-6.webp';

const MAP_URL = 'https://maps.app.goo.gl/AkuWyeP4rFHGKua57';
const MAP_EMBED =
  'https://www.google.com/maps/embed?pb=!1m22!1m8!1m3!1d47704.31500521876!2d69.8828908!3d41.6445124!3m2!1i1024!2i768!4f13.1!4m11!3e0!4m3!3m2!1d41.6276343!2d69.9408682!4m5!1s0x38af17e8021478db%3A0x75f244721ee86a1c!2sMW85%2BV47%20Turbaza%20%22Lastochka%22%2C%20Khumsan%2C%20Tashkent%20Region%2C%20Uzbekistan!3m2!1d41.6671593!2d69.9078047!5e0!3m2!1sen!2s!4v1753689927445!5m2!1sen!2s';

function HowToGet() {
  const { t } = useTranslation();

  const steps = [
    { title: t('step2'), img: arrive2 },
    { title: t('step3'), img: arrive3 },
    { title: t('step4'), img: arrive4 },
    { title: t('step5'), img: arrive5 },
    { title: t('step6'), img: arrive6 },
  ];

  const openMap = () => {
    window.open(MAP_URL, '_blank', 'noopener,noreferrer');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMap();
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
          role="link"
          tabIndex={0}
          onClick={openMap}
          onKeyDown={onKeyDown}
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
    </div>
  );
}

export default HowToGet;
