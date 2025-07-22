import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import BookingFind from '../components/BookingFind';
import axios from 'axios';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'; // Import plugin

// Extend dayjs with isSameOrBefore plugin
dayjs.extend(isSameOrBefore);

const roomsImages = import.meta.glob('../assets/room-*.jpg', { eager: true, as: 'url' });

const BookingPage = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [availableRooms, setAvailableRooms] = useState([]);
  const [searchParams, setSearchParams] = useState(location.state || {});
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Update searchParams when location.state changes
    if (location.state) {
      console.log('Location state updated:', location.state);
      setSearchParams(location.state);
    }
  }, [location.state]);

  useEffect(() => {
    console.log('Current searchParams:', searchParams);
    const { checkIn, checkOut, guests } = searchParams;

    // Use defaults if parameters are missing or invalid
    const formattedCheckIn = checkIn && dayjs(checkIn).isValid() ? dayjs(checkIn).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    const formattedCheckOut = checkOut && dayjs(checkOut).isValid() ? dayjs(checkOut).format('YYYY-MM-DD') : dayjs().add(7, 'day').format('YYYY-MM-DD');
    const guestsCount = Number(guests) > 0 ? Number(guests) : 1;

    // Validate date range
    if (dayjs(formattedCheckOut).isSameOrBefore(dayjs(formattedCheckIn))) {
      console.log('Invalid date range:', { formattedCheckIn, formattedCheckOut });
      setError(t('invalidDateRange', 'Check-out must be after check-in'));
      return;
    }

    fetchAvailableRooms({
      checkIn: formattedCheckIn,
      checkOut: formattedCheckOut,
      guests: guestsCount,
    });
  }, [searchParams]);

  const fetchAvailableRooms = async (filter = {}, retries = 3) => {
    try {
      setIsLoading(true);
      setError('');

      const payload = {
        checkIn: filter.checkIn || dayjs().format('YYYY-MM-DD'),
        checkOut: filter.checkOut || dayjs().add(7, 'day').format('YYYY-MM-DD'),
        guests: Number(filter.guests) > 0 ? Number(filter.guests) : 1,
      };

      console.log('Fetching rooms with payload:', payload);
      const res = await axios.post('http://localhost:5005/api/search', payload, { timeout: 5000 });
      console.log('API response:', res.data);
      setAvailableRooms(res.data);
    } catch (err) {
      console.error('❌ Error fetching rooms:', err.message, err.response?.data);
      let errorMessage;

      if (err.code === 'ERR_NETWORK' && retries > 0) {
        console.log(`Retrying request (${retries} attempts left)...`);
        setTimeout(() => fetchAvailableRooms(filter, retries - 1), 1000);
        return;
      } else if (err.code === 'ERR_NETWORK') {
        errorMessage = t('networkError', 'Unable to connect to the server. Please try again.');
      } else if (err.response) {
        errorMessage = err.response.data?.error || t('serverError', 'Server error occurred.');
      } else {
        errorMessage = t('searchError', 'Failed to fetch rooms. Please try again.');
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = ({ checkIn, checkOut, guests }) => {
    // Validate inputs
    if (!checkIn || !checkOut || !dayjs(checkIn).isValid() || !dayjs(checkOut).isValid()) {
      console.log('Invalid date input:', { checkIn, checkOut });
      setError(t('invalidDateRange', 'Invalid dates provided.'));
      return;
    }
    if (dayjs(checkOut).isSameOrBefore(dayjs(checkIn))) {
      console.log('Check-out is same or before check-in:', { checkIn, checkOut });
      setError(t('invalidDateRange', 'Check-out must be after check-in'));
      return;
    }
    const guestsNum = Number(guests);
    if (isNaN(guestsNum) || guestsNum <= 0) {
      console.log('Invalid guests:', guests);
      setError(t('invalidGuests', 'Please select a valid number of guests.'));
      return;
    }

    const formattedParams = {
      checkIn: dayjs(checkIn).format('YYYY-MM-DD'),
      checkOut: dayjs(checkOut).format('YYYY-MM-DD'),
      guests: guestsNum,
    };
    console.log('Updating searchParams:', formattedParams);
    setSearchParams(formattedParams);
  };

  return (
    <>
      <section className="booking-section">
        <BookingFind onResults={handleSearch} initialParams={searchParams} />
      </section>

      <div className="booking-page">
        <h1 className="booking-page__title">{t('roomsTitle', 'Available Rooms')}</h1>

        {error && (
          <p className="error-message">
            {error}
            <button onClick={() => fetchAvailableRooms(searchParams, 3)} className="retry-button">
              {t('retry', 'Retry')}
            </button>
          </p>
        )}

        {isLoading && <p className="loading-message">{t('loading', 'Loading...')}</p>}

        <div className="room-list">
          {availableRooms.length === 0 && !isLoading && !error ? (
            <p>{t('noRooms', 'No rooms available for the selected dates. Try different dates or fewer guests.')}</p>
          ) : (
            availableRooms.map((room) => (
              <div className="room-card" key={room.id}>
                <img
                  src={roomsImages[`../assets/room-${room.id}.jpg`] || roomsImages['../assets/room-1.jpg']}
                  alt={room.name?.[i18n.language] || 'Room'}
                  className="room-card__image"
                />
                <div className="room-card__content">
                  <h2>{room.name?.[i18n.language] || 'Unnamed Room'}</h2>
                  <p>{room.description?.[i18n.language] || 'No description available'}</p>
                  <button className="room-card__button" onClick={() => setSelectedRoom(room)}>
                    {t('price', 'View Price')}
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

// BookingForm component (unchanged from your provided code)
const BookingForm = ({ room, checkIn, checkOut, onClose }) => {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  console.log('BookingForm props:', { room, checkIn, checkOut, language: i18n.language });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!name || name.length < 2) {
      setError(t('invalidName', 'Name must be at least 2 characters long'));
      setIsLoading(false);
      return;
    }
    if (!phone || !/^\+?[1-9]\d{1,14}$/.test(phone)) {
      setError(t('invalidPhone', 'Invalid phone number'));
      setIsLoading(false);
      return;
    }

    try {
      const payload = {
        name,
        phone,
        roomId: room.id,
        checkIn,
        checkOut
      };
      console.log('Sending booking request:', payload);
      await axios.post('http://localhost:5005/api/booking', payload, { timeout: 5000 });
      alert(t('bookingSuccess', 'Booking request sent successfully'));
      onClose();
    } catch (err) {
      console.error('Error submitting booking:', err.message);
      const errorMessage = err.code === 'ERR_NETWORK'
        ? t('networkError', 'Unable to connect to the server. Please try again later.')
        : err.response?.data?.error || t('bookingError', 'Failed to submit booking. Please try again.');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="booking-form">
      <h2>{t('bookRoom', 'Book Room')}</h2>
      <p>{room.name?.[i18n.language] || room.name || 'Unnamed Room'}</p>
      <p>{t('checkIn', 'Check-in')}: {checkIn || 'Not specified'}</p>
      <p>{t('checkOut', 'Check-out')}: {checkOut || 'Not specified'}</p>
      <div>
        <label>{t('name', 'Name')}:</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label>{t('phone', 'Phone')}:</label>
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      {error && <p className="error-message">{error}</p>}
      <button type="submit" disabled={isLoading}>
        {isLoading ? t('loading', 'Loading...') : t('submit', 'Submit')}
      </button>
      <button type="button" onClick={onClose}>
        {t('cancel', 'Cancel')}
      </button>
    </form>
  );
};

export default BookingPage;