// frontend/components/BookingFindForm.jsx

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

function BookingFindForm({ onResults }) {
  const today = new Date().toISOString().split('T')[0];

  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(today);
  const [guests, setGuests] = useState(2);
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await fetch('http://localhost:5000/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: checkIn,
          guests,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        onResults(data); // Pass found rooms to parent
      } else {
        alert(data.error || 'Something went wrong');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to fetch rooms');
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
