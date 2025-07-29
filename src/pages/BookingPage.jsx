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
  

  const roomsData = [{
    id: 1,
    name: { en: "Standard", ru: "Стандарт", uz: "Standart" },
    description: {
      en: "Comfortable and affordable room, ideal for short stays.",
      ru: "Уютный и недорогой номер, идеален для краткосрочного проживания.",
      uz: "Qulay va arzon xona, qisqa muddatli qolish uchun mos."
    }
  },
  {
    id: 2,
    name: { en: "Semi-Luxury", ru: "Полулюкс", uz: "Yarim lyuks" },
    description: {
      en: "Spacious suite offering high-end comfort and amenities.",
      ru: "Просторный номер с высоким уровнем комфорта и удобств.",
      uz: "Yuqori darajadagi shinamlik va kenglik bilan ta'minlangan xona."
    }
  },
  {
    id: 3,
    name: { en: "Luxury", ru: "Люкс", uz: "Lyuks" },
    description: {
      en: "A very spacious and roomy family suite with a large balcony.",
      ru: "Очень вместительный и просторный семейный номер с большим балконом.",
      uz: "Juda keng va qulay oilaviy xona, katta balkon bilan."
    }
  },
  {
    id: 4,
    name: { en: "Apartment", ru: "Апартаменты", uz: "Apartament" },
    description: {
      en: "Cozy double room with a private bathroom.",
      ru: "Уютный двухместный номер с собственным санузлом.",
      uz: "Shaxsiy hojatxonali qulay ikki kishilik xona."
    }
  }]


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
                <h2>{room.name?.[i18n.language]}</h2>
                <p>{room.description?.[i18n.language]}</p>
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