import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Slider from '../components/Slider';
import BookingFind from '../components/BookingFind';
import Gallery from '../components/Gallery';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUtensils, faSpa, faUsers, faSwimmer, faDumbbell, faHeart } from '@fortawesome/free-solid-svg-icons';
import CurtainReveal from '../components/CurtainReveal';


const heroImages = Object.entries(
  import.meta.glob('../assets/hero-*.JPG', { eager: true, as: 'url' })
)
  .slice(0, 5)
  .map(([, url]) => url);

const compositionImages = import.meta.glob('../assets/composition-*.jpg', { eager: true, as: 'url' });

const roomsImages = import.meta.glob('../assets/room-*.jpg', { eager: true, as: 'url' });

function Home() {
  const [type, setType] = useState('vertical');

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setType('vertical');
      } else {
        setType('horizontal');
      }
    };

    handleResize(); // run once on mount
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const roomSlides =  [
        {
          id: '1',
          title: t('roomsData.room1.title'),
          description: t('roomsData.room1.description'),
          img: roomsImages['../assets/room-1.jpg'],
        },
        {
          id: '2',
          title: t('roomsData.room2.title'),
          description: t('roomsData.room2.description'),
          img: roomsImages['../assets/room-2.jpg'],
        },
        {
          id: '3',
          title: t('roomsData.room3.title'),
          description: t('roomsData.room3.description'),
          img: roomsImages['../assets/room-3.jpg'],
        },
      ];

  const services = [
    { icon: faUtensils, title: 'servicesData.restaurants.title', description: 'servicesData.restaurants.description' },
    { icon: faSpa, title: 'servicesData.spa.title', description: 'servicesData.spa.description' },
    { icon: faUsers, title: 'servicesData.conference.title', description: 'servicesData.conference.description' },
    { icon: faSwimmer, title: 'servicesData.pool.title', description: 'servicesData.pool.description' },
    { icon: faDumbbell, title: 'servicesData.fitness.title', description: 'servicesData.fitness.description' },
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

          <a href="#section-tours" class="btn btn--white btn--animated">{t('bookNow')}</a>
        </div>
        <Slider autoplay interval={5000}>
          {heroImages.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt={`Slide ${idx + 1}`}
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
              src={compositionImages['../assets/composition-1.jpg']}/>

            <img 
              sizes="(max-width: 56.25em) 20vw, (max-width: 37.5em) 30vw, 300px"
              alt="Composition 2"
              class="composition__photo composition__photo--p2"
              src={compositionImages['../assets/composition-2.jpg']}/>

            <img 
              sizes="(max-width: 56.25em) 20vw, (max-width: 37.5em) 30vw, 300px"
              alt="Composition 3"
              class="composition__photo composition__photo--p3"
              src={compositionImages['../assets/composition-3.jpg']}/>

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
                    {t('bookNow')}
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
            <img src={roomsImages['../assets/room-1.jpg']} alt="Service 1" />
            <div className="service-info">
              <h2>{t('servicesData.restaurants.title')}</h2>
              <p>Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. </p>
            </div>
          </div>
          </CurtainReveal>
      <CurtainReveal type={type}>
          <div className="service-card" id="reverse">
            <div className="service-info">
              <h2>{t('servicesData.restaurants.title')}</h2>
              <p>Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. </p>
            </div>
            <img src={roomsImages['../assets/room-1.jpg']} alt="Service 2" />
          </div>
          </CurtainReveal>
      <CurtainReveal type={type}>
          <div className="service-card">
            <img src={roomsImages['../assets/room-1.jpg']} alt="Service 3" />
            <div className="service-info">
              <h2>{t('servicesData.restaurants.title')}</h2>
              <p>Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. </p>
            </div>
          </div>
          </CurtainReveal>
      <CurtainReveal type={type}>
          <div className="service-card" id="reverse">
            <div className="service-info">
              <h2>{t('servicesData.restaurants.title')}</h2>
              <p>Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. </p>
            </div>
            <img src={roomsImages['../assets/room-1.jpg']} alt="Service 4" />
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