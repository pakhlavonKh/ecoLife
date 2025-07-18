import React, { useState } from "react";
import BookingFindForm from "../components/BookingFind"; // renamed
import { useTranslation } from 'react-i18next';

const BookingPage = () => {
  const [availableRooms, setAvailableRooms] = useState([]);
  const { t } = useTranslation();

  return (
    <>
      <section className="booking-section">
        <BookingFindForm onResults={setAvailableRooms} />
      </section>

      <div className="booking-page">
        <h1 className="booking-page__title">{t("our-rooms")}</h1>
        <div className="room-list">
          {availableRooms.map((room) => (
            <div className="room-card" key={room.id}>
              <img src={`/images/${room.id}.jpg`} alt={room.name} className="room-card__image" />
              <div className="room-card__content">
                <h2>{room.name}</h2>
                <p>{room.description}</p>
                <button className="room-card__button">{t("get-price")}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default BookingPage;
