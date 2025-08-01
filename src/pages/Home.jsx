import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Slider from '../components/Slider';
import BookingFind from '../components/BookingFind';
import Gallery from '../components/Gallery';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUtensils,faHorse, faUsers, faSwimmer, faDroplet, faHeart } from '@fortawesome/free-solid-svg-icons';
import CurtainReveal from '../components/CurtainReveal';

const mobileImages = [
  
    "https://ik.imagekit.io/hyp089vmms/assets/mobile__hero-1.webp?updatedAt=1753981401061?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/mobile__hero-2.webp?updatedAt=1753981312220?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/mobile__hero-3.webp?updatedAt=1753981289543?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/mobile__hero-4.webp?updatedAt=1753981267039?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/mobile__hero-5.webp?updatedAt=1753980978699?tr=f-auto,q-80"
]

const desktopImages = [
    "https://ik.imagekit.io/hyp089vmms/assets/desktop__hero-1.webp?updatedAt=1753981417614?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/desktop__hero-2.webp?updatedAt=1753981200985?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/desktop__hero-3.webp?updatedAt=1753981166209?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/desktop__hero-4.webp?updatedAt=1753981085606?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/desktop__hero-5.webp?updatedAt=1753981050935?tr=f-auto,q-80"
  ]


const compositionImages = [
    "https://ik.imagekit.io/hyp089vmms/assets/composition-1.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/composition-2.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/composition-3.webp?tr=f-auto,q-80"

]

const roomsImages = [
    "https://ik.imagekit.io/hyp089vmms/assets/room-1.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/room-2.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/room-3.webp?tr=f-auto,q-80"
  ]

const serviceImages = [
    "https://ik.imagekit.io/hyp089vmms/assets/service-1.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/service-2.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/service-3.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/service-4.webp?tr=f-auto,q-80"]

function Home() {  
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

  const heroImages = isMobile ? mobileImages : desktopImages;

  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const roomSlides =  [
        {
          id: '1',
          title: t('roomsData.room1.title'),
          description: t('roomsData.room1.description'),
          img: roomsImages[0],
        },
        {
          id: '2',
          title: t('roomsData.room2.title'),
          description: t('roomsData.room2.description'),
          img: roomsImages[1],
        },
        {
          id: '3',
          title: t('roomsData.room3.title'),
          description: t('roomsData.room3.description'),
          img: roomsImages[2],
        },
      ];

  const services = [
    { icon: faUtensils, title: 'servicesData.restaurants.title', description: 'servicesData.restaurants.description' },
    { icon: faHorse, title: 'servicesData.horses.title', description: 'servicesData.horses.description' },
    { icon: faUsers, title: 'servicesData.conference.title', description: 'servicesData.conference.description' },
    { icon: faSwimmer, title: 'servicesData.pool.title', description: 'servicesData.pool.description' },
    { icon: faDroplet, title: 'servicesData.water.title', description: 'servicesData.water.description' },
    { icon: faHeart, title: 'servicesData.honey.title', description: 'servicesData.honey.description' },
  ];

  const handleSearch = ({ checkIn, checkOut, guests}) => {
    navigate('/booking', {
      state: { checkIn, checkOut, guests },
    });
  };

  return (
    <div className="home-page">
      <CurtainReveal type={type}>
      <section className="hero">
        <div class="hero__text">
          <h1 class="heading-primary">
              <span class="heading-primary--main">Eco Life Etiqod</span>
              <span class="heading-primary--sub">{t('lifeHappens')}</span>
          </h1>

          <Link to="/booking" className="btn btn--white btn--animated" >
            {t('rooms')}
          </Link>
        </div>
        <Slider autoplay interval={6000}>
          {heroImages.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt={`Slide ${idx + 1}`
              
            }loading="eager"
            />
          ))}
        </Slider>
      </section>
      {/* <BookingFind onResults={handleSearch} /> */}
          
      </CurtainReveal>
      <CurtainReveal type={type}>
      <section className="about">
        <h2>Eco-Life Etiqod, {t('charvak')}</h2>
        <div className="about__info">
          <div className="about__text">
            <h3 class="heading-tertiary">{t('heading1')}</h3>
            <p class="paragraph">
                {t('paragraph1')}
            </p>
            <h3 class="heading-tertiary">{t('heading2')}</h3>
            <p class="paragraph">
              {t('paragraph2')}
            </p>
          </div>
          <div className="composition">
            <img
              sizes="(max-width: 56.25em) 20vw, (max-width: 37.5em) 30vw, 300px"
              alt="Composition 1"
              class="composition__photo composition__photo--p1"
              src={compositionImages[0]}/>

            <img 
              sizes="(max-width: 56.25em) 20vw, (max-width: 37.5em) 30vw, 300px"
              alt="Composition 2"
              class="composition__photo composition__photo--p2"
              src={compositionImages[1]}/>

            <img 
              sizes="(max-width: 56.25em) 20vw, (max-width: 37.5em) 30vw, 300px"
              alt="Composition 3"
              class="composition__photo composition__photo--p3"
              src={compositionImages[2]}/>

          </div>
        </div>
      </section>
      </CurtainReveal>
      
      <CurtainReveal type={type}>
      <section className="rooms-section">
        <h2>{t('rooms')}</h2>
          {roomSlides.map((room, idx) => (
            <div className="room-card" key={idx}>
              <img src={room.img} alt={room.title} className="room-card__image" />
              
              <div className="room-card__content">
                <h2>{room.title}</h2>
                <p>{room.description}</p>
                  <Link
                    to="/booking"
                    state={{ showAll: true }} className="room-card__button"
                  >
                    {t('rooms')}
                  </Link>
              </div>
            </div>
          ))}
      </section>
      </CurtainReveal>
      <section className="services">
        <h2>{t('services')}</h2>
        
      <CurtainReveal type={type}>
        <div className="service-grid">
          {services.map((svc) => (
            <div key={svc.title} className="service-item">
              <FontAwesomeIcon icon={svc.icon} className="service-icon" />
              <h3>{t(svc.title)}</h3>
              <p>{t(svc.description)}</p>
            </div>
          ))}
        </div>
        </CurtainReveal>
        <div className="sevice-cards">
          
      <CurtainReveal type={type}>
          <div className="service-card">
            <img src={serviceImages[0]} alt="Service 1" loading='lazy' />
            <div className="service-info">
              <h2>{t('stableH')}</h2>
              <p>{t('stableP')} </p>
            </div>
          </div>
          </CurtainReveal>
      <CurtainReveal type={type}>
          <div className="service-card" id="reverse">
            <div className="service-info">
              <h2>{t('flourMillH')}</h2>
              <p>{t('flourMillp')}</p>
            </div>
            <img src={serviceImages[1]} alt="Service 2" loading='lazy' />
          </div>
          </CurtainReveal>
      <CurtainReveal type={type}>
          <div className="service-card">
            <img src={serviceImages[2]} alt="Service 3" loading='lazy' />
            <div className="service-info">
              <h2>{t('apiaryH')}</h2>
              <p>{t('apiaryP')}</p>
            </div>
          </div>
          </CurtainReveal>
      <CurtainReveal type={type}>
          <div className="service-card" id="reverse">
            <div className="service-info">
              <h2>{t('poolH')}</h2>
                <p>{t('poolP')}</p>
              </div>
            <img src={serviceImages[3]} alt="Service 4" loading='lazy' />
          </div>
          </CurtainReveal>
        </div>

      </section>
          
      <CurtainReveal type="vertical">
      <Gallery />
      </CurtainReveal>
    </div>
  );
}

export default Home;