import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Slider from '../components/Slider';
import BookingFind from '../components/BookingFind';
import Gallery from '../components/Gallery';

const heroImages = Object.entries(
  import.meta.glob('../assets/photo-*.jpg', { eager: true, as: 'url' })
)
  .sort(([a], [b]) => a.localeCompare(b))
  .slice(0, 5)
  .map(([, url]) => url);

const roomsImages = import.meta.glob('../assets/room-*.jpg', { eager: true, as: 'url' });

function Home() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const response = await axios.post('http://localhost:5000/api/search', {
          date: new Date().toISOString().split('T')[0],
          guests: 1,
        });
        setRooms(response.data);
      } catch (err) {
        console.error('Error fetching rooms:', err);
      }
    };
    fetchRooms();
  }, []);

  const roomSlides = rooms.length > 0
    ? rooms.map((room) => ({
        id: room.id,
        title: room.name[i18n.language],
        description: room.description[i18n.language],
        img: roomsImages[`../assets/room-${room.id}.jpg`] || roomsImages['../assets/room-1.jpg'],
      }))
    : [
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
    { title: 'servicesData.restaurants.title', description: 'servicesData.restaurants.description' },
    { title: 'servicesData.spa.title', description: 'servicesData.spa.description' },
    { title: 'servicesData.conference.title', description: 'servicesData.conference.description' },
    { title: 'servicesData.pool.title', description: 'servicesData.pool.description' },
    { title: 'servicesData.fitness.title', description: 'servicesData.fitness.description' },
    { title: 'servicesData.honey.title', description: 'servicesData.honey.description' },
    { title: 'servicesData.horses.title', description: 'servicesData.horses.description' },
    { title: 'servicesData.buffet.title', description: 'servicesData.buffet.description' },
    { title: 'servicesData.mosque.title', description: 'servicesData.mosque.description' },
  ];

  const handleSearch = ({ checkIn, checkOut, guests, name, phone }) => {
    navigate('/booking', {
      state: { checkIn, checkOut, guests, name, phone },
    });
  };

  return (
    <div className="home-page">
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

      <section className="booking-section">
        <BookingFind onResults={handleSearch} />
      </section>

      <section className="about">
        <h2>Eco-Life, {t('charvak')}</h2>
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque tempus, nisi vel ultricies pretium,
          nisi purus porta tellus, ut faucibus orci mauris vitae mi. Pellentesque semper tellus quis risus semper, non laoreet
          elit laoreet. Phasellus eu posuere tortor. Duis vulputate tortor ac mauris interdum vestibulum. Mauris consequat pretium erat,
          id tristique ex aliquam eget. Proin quis eleifend neque. Duis eu augue dapibus, fringilla quam consequat, viverra turpis. Etiam
          ullamcorper gravida sem dictum semper. Proin ut efficitur purus. Maecenas id nulla finibus, viverra ipsum mollis, pharetra magna.
          Sed at porta lectus. Etiam semper, massa nec vehicula maximus, dolor lectus eleifend ipsum, sit amet lobortis neque nunc vitae nunc.
        </p>
      </section>

      <section className="rooms-section">
        <h2>{t('rooms')}</h2>
        <Slider autoplay interval={4000}>
          {roomSlides.map((room, idx) => (
            <div className="room-slide" key={idx}>
              <div className="room-slide__content">
                <h3>{room.title}</h3>
                <p>{room.description}</p>
                <button className="room-slide__btn">
                  <Link
                    to="/booking"
                    state={{ roomId: room.id, checkIn: new Date().toISOString().split('T')[0] }}
                  >
                    {t('price')}
                  </Link>
                </button>
              </div>
              <div className="room-slide__image">
                <img src={room.img} alt={room.title} className="room-slide__img" />
              </div>
            </div>
          ))}
        </Slider>
      </section>

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