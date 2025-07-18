import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import BookingFind from '../components/BookingFind';
import BookingForm from '../components/BookingForm';

const roomsImages = import.meta.glob('../assets/room-*.jpg', { eager: true, as: 'url' });

const BookingPage = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [availableRooms, setAvailableRooms] = useState([]);
  const [searchParams, setSearchParams] = useState(location.state || {});
  const [selectedRoom, setSelectedRoom] = useState(null);

  useEffect(() => {
    if (searchParams.checkIn && searchParams.guests) {
      fetchAvailableRooms({ date: dayjs(searchParams.checkIn).format('YYYY-MM-DD'), guests: searchParams.guests });
    } else {
      fetchAvailableRooms();
    }
  }, [searchParams]);

  const fetchAvailableRooms = async (filter = {}) => {
    try {
      const res = await axios.post('http://localhost:5000/api/search', filter);
      setAvailableRooms(res.data);
    } catch (err) {
      console.error('Error fetching rooms:', err);
      alert(t('searchError'));
    }
  };

  const handleSearch = ({ checkIn, checkOut, guests, name, phone, rooms }) => {
    setSearchParams({ checkIn, checkOut, guests, name, phone });
    setAvailableRooms(rooms || []);
  };

  return (
    <>
      <section className="booking-section">
        <BookingFind onResults={handleSearch} initialParams={searchParams} />
      </section>

      <div className="booking-page">
        <h1 className="booking-page__title">{t('roomsTitle')}</h1>
        <div className="room-list">
          {availableRooms.length === 0 ? (
            <p>{t('noRooms')}</p>
          ) : (
            availableRooms.map((room) => (
              <div className="room-card" key={room.id}>
                <img
                  src={roomsImages[`../assets/room-${room.id}.jpg`] || roomsImages['../assets/room-1.jpg']}
                  alt={room.name[i18n.language]}
                  className="room-card__image"
                />
                <div className="room-card__content">
                  <h2>{room.name[i18n.language]}</h2>
                  <p>{room.description[i18n.language]}</p>
                  <button
                    className="room-card__button"
                    onClick={() => setSelectedRoom(room)}
                  >
                    {t('price')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedRoom && (
        <div className="modal-backdrop">
          <div className="modal">
            <BookingForm
              room={selectedRoom}
              checkIn={searchParams.checkIn}
              checkOut={searchParams.checkOut}
              onClose={() => setSelectedRoom(null)}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default BookingPage;