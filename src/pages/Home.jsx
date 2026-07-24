import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { fetchCategories } from '../api/categories';
import Gallery from '../components/Gallery';
import Reveal from '../components/Reveal';
import { icons } from '../components/icons';
import { sortCategories } from '../utils/booking';

import mobile1 from '../assets/mobile__hero-1.webp';
import mobile2 from '../assets/mobile__hero-2.webp';
import mobile3 from '../assets/mobile__hero-3.webp';
import mobile4 from '../assets/mobile__hero-4.webp';
import desktop1 from '../assets/desktop__hero-1.webp';
import desktop2 from '../assets/desktop__hero-2.webp';
import desktop3 from '../assets/desktop__hero-3.webp';
import desktop4 from '../assets/desktop__hero-4.webp';
import compositionArch from '../assets/composition-1.webp';
import compositionSmall from '../assets/composition-2.webp';
import roomStandart from '../assets/room-1.webp';
import roomLux from '../assets/room-3.webp';
import serviceFlour from '../assets/service-2.webp';
import serviceApiary from '../assets/service-3.webp';
import serviceStables from '../assets/service-1.webp';
import servicePool from '../assets/service-4.webp';

const FALLBACK_IMAGES = {
  standart: roomStandart,
  lux: roomLux,
};

const mobileImages = [mobile1, mobile2, mobile3, mobile4];
const desktopImages = [desktop1, desktop2, desktop3, desktop4];

const SERVICE_KEYS = [
  'restaurants',
  'horses',
  'conference',
  'pool',
  'water',
  'honey',
];

function HeroSlider({ images, interval = 6000 }) {
  const [index, setIndex] = useState(0);
  const startX = useRef(null);
  const total = images.length;

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % total), interval);
    return () => clearInterval(timer);
  }, [interval, total]);

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (startX.current == null) return;
    const diff = startX.current - e.changedTouches[0].clientX;
    if (diff > 50) setIndex((i) => (i + 1) % total);
    else if (diff < -50) setIndex((i) => (i - 1 + total) % total);
    startX.current = null;
  };

  return (
    <div
      className="slider"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="slider__container"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {images.map((url, idx) => (
          <div className="slider__slide" key={url}>
            <img src={url} alt="" loading={idx === 0 ? 'eager' : 'lazy'} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Home() {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCategories();
        if (cancelled) return;
        setRooms(
          sortCategories(data).map((cat) => ({
            id: cat.id,
            title: cat.name,
            description:
              cat.description ||
              t(`roomsData.${cat.code}.description`, {
                defaultValue: '',
              }),
            img: cat.images?.[0] || FALLBACK_IMAGES[cat.code] || roomStandart,
          })),
        );
      } catch {
        if (cancelled) return;
        setRooms([
          {
            id: 'standart',
            title: t('roomsData.standart.title'),
            description: t('roomsData.standart.description'),
            img: roomStandart,
          },
          {
            id: 'lux',
            title: t('roomsData.lux.title'),
            description: t('roomsData.lux.description'),
            img: roomLux,
          },
        ]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const stories = [
    {
      index: '01',
      title: t('flourMillH'),
      text: t('flourMillp'),
      img: serviceFlour,
    },
    {
      index: '02',
      title: t('apiaryH'),
      text: t('apiaryP'),
      img: serviceApiary,
    },
    {
      index: '03',
      title: t('stableH'),
      text: t('stableP'),
      img: serviceStables,
    },
    {
      index: '04',
      title: t('poolH'),
      text: t('poolP'),
      img: servicePool,
    },
  ];

  return (
    <div className="home-page">
      <section className="hero">
        <HeroSlider images={isMobile ? mobileImages : desktopImages} />
        <div className="hero__content">
          <p className="eyebrow hero__rise">{t('heroEyebrow')}</p>
          <h1 className="hero__title hero__rise">
            <span>{t('heroTitle1')}</span>
            <em>{t('heroTitle2')}</em>
          </h1>
          <p className="hero__lead hero__rise">{t('heroLead')}</p>
          <div className="hero__actions hero__rise">
            <Link to="/booking" className="btn btn--primary">
              {t('bookNow')}
            </Link>
            <Link to="/how-to-get" className="btn btn--ghost">
              {t('howToGet')}
            </Link>
          </div>
        </div>
      </section>

      <Reveal delay={0.05}>
        <section className="section">
          <div className="container about__grid">
            <div className="about__text">
              <p className="eyebrow">{t('aboutEyebrow')}</p>
              <h2 className="section-title">
                Eco-Life Etiqod, {t('charvak')}
              </h2>
              <h3 className="heading-tertiary">{t('heading1')}</h3>
              <p className="paragraph">{t('paragraph1')}</p>
              <h3 className="heading-tertiary">{t('heading2')}</h3>
              <p className="paragraph">{t('paragraph2')}</p>
            </div>
            <div className="composition" aria-hidden="true">
              <img
                className="composition__arch"
                src={compositionArch}
                alt=""
                loading="lazy"
              />
              <img
                className="composition__small"
                src={compositionSmall}
                alt=""
                loading="lazy"
              />
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <section className="section section--tight">
          <div className="container">
            <header className="section-head">
              <p className="eyebrow">{t('roomsEyebrow')}</p>
              <h2 className="section-title">{t('rooms')}</h2>
              <p className="section-lead">{t('roomsLead')}</p>
            </header>

            <div className="rooms-grid rooms-grid--two">
              {rooms.map((room) => (
                <article className="room-card" key={room.id}>
                  <div className="room-card__media">
                    <img src={room.img} alt={room.title} loading="lazy" />
                  </div>
                  <div className="room-card__body">
                    <h3>{room.title}</h3>
                    <p>{room.description}</p>
                    <Link to="/booking" className="link-more">
                      {t('learnMore')}
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            <div className="rooms-footer">
              <Link to="/booking" className="btn btn--outline">
                {t('allRooms')}
              </Link>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={0.15}>
        <section className="section farm">
          <div className="container">
            <header className="section-head">
              <p className="eyebrow">{t('farmEyebrow')}</p>
              <h2 className="section-title">{t('farmTitle')}</h2>
              <p className="section-lead">{t('farmLead')}</p>
            </header>

            <div className="stories">
              {stories.map((story) => (
                <article className="story" key={story.index}>
                  <div className="story__media">
                    <img src={story.img} alt="" loading="lazy" />
                  </div>
                  <div className="story__body">
                    <span className="story__index">{story.index}</span>
                    <h3 className="section-title">{story.title}</h3>
                    <p>{story.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={0.2}>
        <section className="section section--tight">
          <div className="container">
            <header className="section-head">
              <p className="eyebrow">{t('servicesEyebrow')}</p>
              <h2 className="section-title">{t('services')}</h2>
            </header>

            <div className="amenities">
              {SERVICE_KEYS.map((key) => {
                const Icon = icons[key];
                return (
                  <article className="amenity" key={key}>
                    <div className="amenity__icon">
                      <Icon />
                    </div>
                    <h3 className="amenity__title">
                      {t(`servicesData.${key}.title`)}
                    </h3>
                    <p className="amenity__text">
                      {t(`servicesData.${key}.description`)}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={0.25}>
        <section className="section section--tight">
          <div className="container">
            <header className="section-head">
              <p className="eyebrow">{t('galleryEyebrow')}</p>
              <h2 className="section-title">{t('galleryTitle')}</h2>
            </header>
            <Gallery />
          </div>
        </section>
      </Reveal>

      <Reveal delay={0.3}>
        <section className="section section--tight">
          <div className="container">
            <div className="contact-band">
              <div>
                <p className="eyebrow">{t('contact')}</p>
                <h2 className="contact-band__title">{t('contactTitle')}</h2>
                <p className="contact-band__text">{t('contactLead')}</p>
              </div>
              <div className="contact-band__actions">
                <a href="tel:+998559000110" className="btn btn--paper">
                  {t('callUs')}
                </a>
                <a
                  href="https://t.me/EcoLifeEtiqod"
                  className="btn btn--line"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('writeTelegram')}
                </a>
              </div>
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  );
}

export default Home;
