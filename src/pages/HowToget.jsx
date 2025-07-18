import React from 'react';
import { useTranslation } from 'react-i18next';

function HowToGet() {
  const { t } = useTranslation();

  return (
    <section className="how-to-get">
      <h1>{t('howToGet')}</h1>
      <p>📍 You can reach us via taxi, metro, or bus.</p>
      <p>🗺️ Address: 123 Green Street, EcoCity</p>
      <p>🚇 Nearest metro: EcoPark Station</p>
      <p>🚖 Taxi from city center takes 10 mins.</p>
      {/* You can embed Google Maps iframe here if needed */}
    </section>
  );
}

export default HowToGet;
