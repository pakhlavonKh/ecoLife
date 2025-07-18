import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import dayjs from 'dayjs';

function BookingForm({ room, checkIn, checkOut, onClose }) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (name.length < 2) {
      setError(t('invalidName'));
      return;
    }
    if (!/^\+?\d{10,15}$/.test(phone)) {
      setError(t('invalidPhone'));
      return;
    }

    try {
      const res = await axios.post('http://localhost:5000/api/book', {
        name,
        phone,
        roomId: room.id,
        date: dayjs(checkIn).format('YYYY-MM-DD'),
      });

      if (res.status === 200) {
        alert(t('bookingSuccess'));
        setName('');
        setPhone('');
        onClose();
      }
    } catch (err) {
      console.error('Error in BookingForm:', err);
      setError(err.response?.data?.error || t('bookingError'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="booking-popup-form">
      <h2>{t('bookRoom')}: {room.name[i18n.language]}</h2>
      <p><strong>{t('check-in')}:</strong> {checkIn}</p>
      <p><strong>{t('check-out')}:</strong> {checkOut}</p>
      <div className="booking-field">
        <label>{t('name')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('name')}
          required
        />
      </div>
      <div className="booking-field">
        <label>{t('phone')}</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1234567890"
          required
        />
      </div>
      {error && <p className="error-message">{error}</p>}
      <button type="submit">{t('bookRoom')}</button>
      <button type="button" onClick={onClose}>{t('cancel')}</button>
    </form>
  );
}

export default BookingForm;