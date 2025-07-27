// src/components/BookingForm.jsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const BookingForm = ({ room, checkIn, checkOut, onClose }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!name || name.length < 2) {
      setError(t('invalidName', 'Name must be at least 2 characters long'));
      setIsLoading(false);
      return;
    }

    if (!/^\d{9,}$/.test(phone)) {
      setError(t('invalidPhone', 'Phone number must contain only digits and be at least 9 digits long'));
      setIsLoading(false);
      return;
    }

    try {
      const payload = {
        name,
        phone,
        roomId: room.id,
        date: checkIn,
      };
      console.log('Sending booking request:', payload);
      await axios.post('/api/booking', payload, { timeout: 5000 });
      alert(t('bookingSuccess', 'Booking request sent successfully'));
      onClose();
    } catch (err) {
      console.error('Error submitting booking:', err.message, err.stack);
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
      <p>{room.name}</p>
      <p>{t('check-in')}: {checkIn}</p>
      <p>{t('check-out')}: {checkOut}</p>
      <div>
        <label htmlFor="name">{t('name', 'Name')}:</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="phone">{t('phone', 'Phone')}:</label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
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

export default BookingForm;
