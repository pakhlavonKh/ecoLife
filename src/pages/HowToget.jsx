import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import CurtainReveal from '../components/CurtainReveal';

function HowToGet() {
  const { t } = useTranslation();

  const handleMapClick = () => {
    window.open(
      'https://maps.app.goo.gl/AkuWyeP4rFHGKua57',
      '_blank',
      'noopener,noreferrer'
    );
  };

  const arriveImages = import.meta.glob('../assets/arrive-*.JPG', { eager: true, as: 'url' });

  const [type, setType] = useState('vertical');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
     const handleResize = () => {
      if (window.innerWidth < 768) {
        setType('vertical');
      } else {
        setType('horizontal');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
  <section className="how-to-get">
  <h1>{t('howToGet')}</h1>
    <div className="steps-container">
      
      {/* Row 1 */}
      
  <CurtainReveal type={type}>
      <div className="step-row">
        <div className="step">
          <h2>{t('step1')}</h2>
          <div className="map-container" onClick={handleMapClick}>
            <iframe
              title="Map to Resort"
              src="https://www.google.com/maps/embed?pb=!1m22!1m8!1m3!1d47704.31500521876!2d69.8828908!3d41.6445124!3m2!1i1024!2i768!4f13.1!4m11!3e0!4m3!3m2!1d41.6276343!2d69.9408682!4m5!1s0x38af17e8021478db%3A0x75f244721ee86a1c!2sMW85%2BV47%20Turbaza%20%22Lastochka%22%2C%20Khumsan%2C%20Tashkent%20Region%2C%20Uzbekistan!3m2!1d41.6671593!2d69.9078047!5e0!3m2!1sen!2s!4v1753689927445!5m2!1sen!2s"
              width="100%"
              height="100%"
              style={{ border: 0, pointerEvents: 'none' }}
              loading="lazy"
            />
          </div>
        </div>
          <div className="arrow arrow-right">&gt;</div>

        <div className="step">
          <h2>{t('step2')}</h2>
          <img src={arriveImages['../assets/arrive-2.JPG']} alt="Arrive 2" />
        </div>
        <div className="arrow arrow-right">&gt;</div>

        <div className="step">
          <h2>{t('step3')}</h2>
          <img src={arriveImages['../assets/arrive-3.JPG']}  alt="Arrive 3" />
            <span className="arrow arrow-down">&gt;</span>
          
        </div>
      </div>
      </CurtainReveal>
      <CurtainReveal type={type}>
      {/* Row 2 */}
      <div className="step-row step-row-2">
        <div className="step">
          <h2>{t('step4')}</h2>
          <img src={arriveImages['../assets/arrive-4.JPG']}  alt="Arrive 4" />
        </div>
        <div className="arrow arrow-left">&lt;</div>
        <div className="step">
          <h2>{t('step5')}</h2>
          <img src={arriveImages['../assets/arrive-5.JPG']}  alt="Arrive 5" />
        </div>
        <div className="arrow arrow-left">&lt;</div>
        <div className="step">
          <h2>{t('step6')}</h2>
          <img src={arriveImages['../assets/arrive-6.JPG']}  alt="Arrive 6" />
        </div>
      </div>

    </CurtainReveal>
    </div>
</section>

  );
}

export default HowToGet;
