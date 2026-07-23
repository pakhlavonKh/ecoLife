import React from 'react';
import { useTranslation } from 'react-i18next';

const roomsImages = import.meta.glob('../assets/room-*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

function BookingPage() {
  const { t } = useTranslation();

  const rooms = [1, 2, 3, 4].map((id) => ({
    id: String(id),
    title: t(`roomsData.room${id}.title`),
    description: t(`roomsData.room${id}.description`),
    img: roomsImages[`../assets/room-${id}.webp`],
  }));

  return (
    <div className="booking-page">
      <div className="container">
        <header className="page-head">
          <p className="eyebrow">{t('roomsEyebrow')}</p>
          <h1 className="page-head__title">{t('roomsTitle')}</h1>
          <p className="page-head__lead">{t('roomsLead')}</p>
        </header>

        <div className="rooms-grid rooms-grid--four">
          {rooms.map((room) => (
            <article className="room-card" key={room.id}>
              <div className="room-card__media">
                <img src={room.img} alt={room.title} loading="lazy" />
              </div>
              <div className="room-card__body">
                <h3>{room.title}</h3>
                <p>{room.description}</p>
              </div>
            </article>
          ))}
        </div>

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
    </div>
  );
}

export default BookingPage;
