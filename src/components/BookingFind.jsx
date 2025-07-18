// frontend/components/BookingFindForm.jsx

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

function BookingFindForm({ onResults }) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // One week later
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  const [checkIn, setCheckIn] = useState(todayStr);
  const [checkOut, setCheckOut] = useState(nextWeekStr);
  const [guests, setGuests] = useState(2);
  const { t } = useTranslation();

  const handleSubmit = (e) => {
    e.preventDefault();

    // Pass search data to parent (Home or BookingPage)
    onResults({ checkIn, checkOut, guests });
  };

  return (
    <form className="booking-form" onSubmit={handleSubmit}>
      <div className="booking-title">
        <strong>{t('book')}</strong>
        <span>{t('official')}</span>
      </div>

      <div className="booking-field">
        <label>{t('check-in')}</label>
        <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} min={today} />
      </div>

      <div className="booking-field">
        <label>{t('check-out')}</label>
        <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} min={checkIn} />
      </div>

      <div className="booking-field">
        <label>{t('guests')}</label>
        <select value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <button type="submit" className="booking-button">
        {t('find')}
      </button>
    </form>
  );
}

export default BookingFindForm;
