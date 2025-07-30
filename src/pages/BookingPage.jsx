import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'; // Import plugin
import CurtainReveal from '../components/CurtainReveal';

// Extend dayjs with isSameOrBefore plugin
dayjs.extend(isSameOrBefore);

const roomsImages = import.meta.glob('../assets/room-*.webp', { eager: true, as: 'url' });

function BookingPage() {
  const { t, i18n } = useTranslation();
  
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
  

  const roomsData = [
        {
          id: '1',
          title: t('roomsData.room1.title'),
          description: t('roomsData.room1.description'),
        },
        {
          id: '2',
          title: t('roomsData.room2.title'),
          description: t('roomsData.room2.description'),
        },
        {
          id: '3',
          title: t('roomsData.room3.title'),
          description: t('roomsData.room3.description'),
        },
        {
          id: '4',
          title: t('roomsData.room4.title'),
          description: t('roomsData.room4.description'),
        }
      ]


  return (
    <>

      <div className="booking-page">
        <h1 className="booking-page__title" style={{ marginTop: '80px' }}>{t('roomsTitle')}</h1>


        <CurtainReveal type={type}>
        <div className="room-list">
          {roomsData.map((room, idx) => (
            <div className="room-card" key={idx}>
              <img src={roomsImages[`../assets/room-${room.id}.webp`] } alt={room.title} className="room-card__image" />
              
              <div className="room-card__content">
                <h2>{room.title}</h2>
                <p>{room.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CurtainReveal>
      </div>

    </>
  );
};

export default BookingPage;