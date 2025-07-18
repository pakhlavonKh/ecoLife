import React from 'react';
import { useTranslation } from 'react-i18next';

function ContactSection() {
  const { t } = useTranslation();

  return (
    <section className="contact-section" id="contact">
      <h2>{t('contact')}</h2>
      <div className="contact-content">
        <div className="contact-info">
          <div>
            <strong>{t('address')}:</strong>
            <p>123 Eco Street, Tashkent, Uzbekistan</p>
          </div>
          <div>
            <strong>{t('phone')}:</strong>
            <p>+998 90 123 45 67</p>
          </div>
          <div>
            <strong>{t('email')}:</strong>
            <p>info@eco-life.uz</p>
          </div>
        </div>

        <div className="contact-map">
          <iframe src="https://www.google.com/maps/embed?pb=!1m17!1m12!1m3!1d2980.455598978849!2d69.90463107559276!3d41.66750297857416!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m2!1m1!2zNDHCsDQwJzAzLjAiTiA2OcKwNTQnMjUuOSJF!5e0!3m2!1sru!2s!4v1752751367991!5m2!1sru!2s" 
          width="100%"
          height="400"
          style={{ border: 0, borderRadius: '0' }}
          allowFullScreen=""
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade">
          </iframe>
        </div>
      </div>
    </section>
  );
}

export default ContactSection;
