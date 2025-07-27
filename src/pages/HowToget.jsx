import React from 'react';
import { useTranslation } from 'react-i18next';

function HowToGet() {
  const { t } = useTranslation();

  return (
    <section className="how-to-get">
      <h2>{t('howToGet')}</h2>
      <div className="steps-container">

        <div className="step">
          <img src="/images/step1.jpg" alt="Arrive in City" />
          <h3>Step 1</h3>
          <p>Take a flight, train, or bus to [Your City]</p>
        </div>

        <div className="arrow">➡️</div>

        <div className="step">
          <img src="/images/step2.jpg" alt="City Center" />
          <h3>Step 2</h3>
          <p>Reach city center via taxi or metro</p>
        </div>

        <div className="arrow">➡️</div>

        <div className="step">
          <img src="/images/step3.jpg" alt="Navigation" />
          <h3>Step 3</h3>
          <p>Use Google Maps to find our exact location</p>
          <iframe src="https://www.google.com/maps/embed?pb=!1m17!1m12!1m3!1d2980.455598978849!2d69.90463107559276!3d41.66750297857416!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m2!1m1!2zNDHCsDQwJzAzLjAiTiA2OcKwNTQnMjUuOSJF!5e0!3m2!1sru!2s!4v1752751367991!5m2!1sru!2s" 
          width="100%"
          height="400"
          style={{ border: 0, borderRadius: '0' }}
          allowFullScreen=""
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade">
          </iframe>
        </div>

        <div className="arrow">➡️</div>

        <div className="step final">
          <img src="/images/step4.jpg" alt="Arrival" />
          <h3>Step 4</h3>
          <p>You’ve arrived — Welcome! 🎉</p>
        </div>

      </div>
    </section>
  );
}

export default HowToGet;
