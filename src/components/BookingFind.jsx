import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

// Extend dayjs with isSameOrBefore plugin
dayjs.extend(isSameOrBefore);

function BookingFind({ onResults, initialParams = {} }) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  const [checkIn, setCheckIn] = useState(initialParams.checkIn || todayStr);
  const [checkOut, setCheckOut] = useState(initialParams.checkOut || nextWeekStr);
  const [guests, setGuests] = useState(initialParams.guests || 2);
  const [error, setError] = useState('');
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate dates
    if (!dayjs(checkIn).isValid() || !dayjs(checkOut).isValid()) {
      setError(t('invalidDateRange', 'Please select valid dates.'));
      console.log('Invalid dates in BookingFind:', { checkIn, checkOut });
      return;
    }
    if (dayjs(checkOut).isSameOrBefore(dayjs(checkIn))) {
      setError(t('invalidDateRange', 'Check-out must be after check-in'));
      console.log('Check-out is same or before check-in:', { checkIn, checkOut });
      return;
    }

    // Validate guests
    const guestsNum = Number(guests);
    if (isNaN(guestsNum) || guestsNum <= 0) {
      setError(t('invalidGuests', 'Please select a valid number of guests.'));
      console.log('Invalid guests in BookingFind:', guests);
      return;
    }

    const payload = {
      checkIn: dayjs(checkIn).format('YYYY-MM-DD'),
      checkOut: dayjs(checkOut).format('YYYY-MM-DD'),
      guests: guestsNum,
    };

    console.log('📤 Submitting search:', payload);

    try {
      const response = await axios.post('http://localhost:5005/api/search', payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      });
      console.log('Search response:', response.data);
      onResults(payload);
    } catch (err) {
      console.error('❌ Booking search failed:', err.message, err.response?.data);
      const errorMessage = err.response?.data?.error || t('searchError', 'Search failed. Please try again.');
      setError(errorMessage);
    }
  };

  return (
    <form className="booking-find" onSubmit={handleSubmit}>
      <div className="booking-title">
        <strong>{t('book', 'Book')}</strong>
        <span>{t('official', 'Official Site')}</span>
      </div>

      <div className="booking-field">
        <label>{t('check-in', 'Check-in')}</label>
        <input
          type="date"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          min={todayStr}
        />
      </div>

      <div className="booking-field">
        <label>{t('check-out', 'Check-out')}</label>
        <input
          type="date"
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          min={dayjs(checkIn).add(1, 'day').format('YYYY-MM-DD')}
        />
      </div>

      <div className="booking-field">
        <label>{t('guests', 'Guests')}</label>
        <select
          value={guests}
          onChange={(e) => setGuests(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error-message">{error}</p>}
      <button type="submit" className="booking-button">
        {t('find', 'Find')}
      </button>
    </form>
  );
}

export default BookingFind;