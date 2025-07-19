import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

function BookingFind({ onResults }) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  const [checkIn, setCheckIn] = useState(todayStr);
  const [checkOut, setCheckOut] = useState(nextWeekStr);
  const [guests, setGuests] = useState(2);
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
  e.preventDefault();

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ checkIn, checkOut, guests }),
    });

    const text = await response.text(); // Read raw response
    if (!response.ok) {
      throw new Error(text || 'Unknown error');
    }

    if (!text) {
      throw new Error('Empty response from server');
    }

    const data = JSON.parse(text);
    onResults(data);
  } catch (err) {
    console.error('❌ Booking search failed:', err.message);
    alert('Search failed: ' + err.message);
  }
};


  return (
    <form className="booking-form" onSubmit={handleSubmit}>
      <div className="booking-title">
        <strong>{t('book')}</strong>
        <span>{t('official')}</span>
      </div>

      <div className="booking-field">
        <label>{t('check-in')}</label>
        <input
          type="date"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          min={todayStr}
        />
      </div>

      <div className="booking-field">
        <label>{t('check-out')}</label>
        <input
          type="date"
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          min={checkIn}
        />
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

export default BookingFind;
