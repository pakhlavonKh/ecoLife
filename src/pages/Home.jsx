import React from 'react';
import Slider from '../components/Slider';
import BookingForm from '../components/BookingFind';
import Contact from '../components/Contact';
import Gallery from '../components/Gallery';
import { useTranslation } from 'react-i18next';

// Dynamically load hero images
const heroImages = Object.entries(
  import.meta.glob('../assets/photo-*.jpg', { eager: true, as: 'url' })
)
  .sort(([a], [b]) => a.localeCompare(b))
  .slice(0, 5) 
  .map(([, url]) => url);

const roomsImages = import.meta.glob('../assets/room-*.jpg', { eager: true, as: 'url' });  

function Home() {
const { t } = useTranslation();

const roomSlides = [
  {
    title: t('roomsData.room1.title'),
    description: t('roomsData.room1.description'),
    img: roomsImages['../assets/room-1.jpg']
  },
  {
    title: t('roomsData.room2.title'),
    description: t('roomsData.room2.description'),
    img: roomsImages['../assets/room-2.jpg']
  },
  {
    title: t('roomsData.room3.title'),
    description: t('roomsData.room3.description'),
    img: roomsImages['../assets/room-3.jpg']
  }
];
const services = [
    {
      title: t('servicesData.restaurants.title'),
      description: t('servicesData.restaurants.description')
    },
    {
      title:t('servicesData.spa.title'),
      description: t('servicesData.spa.description')
    },
    {
      title: t('servicesData.conference.title'),
      description: t('servicesData.conference.description')
    },
    {
      title: t('servicesData.pool.title'),
      description: t('servicesData.pool.description')
    },
    {
      title: t('servicesData.fitness.title'),
      description: t('servicesData.fitness.description')
    },
    {
      title: t('servicesData.honey.title'),
      description: t('servicesData.honey.description')
    },
    {
      title: t('servicesData.horses.title'),
      description: t('servicesData.horses.description')
    },
    {
      title: t('servicesData.buffet.title'),
      description: t('servicesData.buffet.description')
    },
    {
      title: t('servicesData.mosque.title'),
      description: t('servicesData.mosque.description')
    }
  ]


  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero">
        <Slider autoplay interval={5000}>
          {heroImages.map((url, idx) => (
          <img
            key={idx}
            src={url}
            alt={`Slide ${idx + 1}`}
            style={{
              width: '100%',
              height: '60vh',
              objectFit: 'cover',
            }}
          />
          ))}
        </Slider>
      </section>

      {/* Booking */}
      <section className="booking-section">
        <BookingForm />
      </section>

      {/* About Section */}
      <section className="about">
        <h2>Eco-Life, {t('charvak')}</h2>
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque tempus, nisi vel ultricies pretium, 
          nisi purus porta tellus, ut faucibus orci mauris vitae mi. Pellentesque semper tellus quis risus semper, non laoreet 
          elit laoreet. Phasellus eu posuere tortor. Duis vulputate tortor ac mauris interdum vestibulum. Mauris consequat pretium erat,
           id tristique ex aliquam eget. Proin quis eleifend neque. Duis eu augue dapibus, fringilla quam consequat, viverra turpis. Etiam ullamcorper gravida sem dictum semper. Proin ut efficitur purus. Maecenas id nulla finibus, viverra ipsum mollis, pharetra magna. Sed at porta lectus. Etiam semper, massa nec vehicula maximus, dolor lectus eleifend ipsum, sit amet lobortis neque nunc vitae nunc.
        </p>
      </section>

      {/* Rooms Section with Slider */}
      <section className="rooms-section">
        <h2>
          {t('rooms')}
        </h2>
        <Slider autoplay interval={4000}>
          {roomSlides.map((room, idx) => (
              <div className="room-slide" key={idx}>
                <div className="room-slide__content">
                  <h3>{room.title}</h3>
                  <p>{room.description}</p>
                  <button className="room-slide__btn">{t('price')}</button>
                </div>
                <div className="room-slide__image">
                  <img
                    src={room.img}
                    alt={room.title}
                    className="room-slide__img"
                  />
                </div>
              </div>

          ))}
        </Slider>
      </section>

      {/* Services */}
      <section className="services">
      <h2>{t('services')}</h2>
      <div className="service-grid">
        {services.map((svc) => (
          <div key={svc.title} className="service-card">
            <h3>{t(svc.title)}</h3>
            <p>{t(svc.description)}</p>
          </div>
        ))}
      </div>
    </section>

      <Gallery />
    </div>
  );
}

export default Home;
