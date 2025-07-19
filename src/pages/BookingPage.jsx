// import React, { useState, useEffect } from 'react';
// import { useTranslation } from 'react-i18next';
// import { useLocation } from 'react-router-dom';
// import axios from 'axios';
// import dayjs from 'dayjs';
// import BookingFind from '../components/BookingFind';
// import BookingForm from '../components/BookingForm';

// const roomsImages = import.meta.glob('../assets/room-*.jpg', { eager: true, as: 'url' });

// const BookingPage = () => {
//   const { t, i18n } = useTranslation();
//   const location = useLocation();
//   const [availableRooms, setAvailableRooms] = useState([]);
//   const [searchParams, setSearchParams] = useState(location.state || {});
//   const [selectedRoom, setSelectedRoom] = useState(null);
//   const [error, setError] = useState('');
//   const [isLoading, setIsLoading] = useState(false);

//   useEffect(() => {
//     const checkIn = searchParams.checkIn ? dayjs(searchParams.checkIn).format('YYYY-MM-DD') : null;
//     const checkOut = searchParams.checkOut ? dayjs(searchParams.checkOut).format('YYYY-MM-DD') : null;
//     const guests = searchParams.guests ? Number(searchParams.guests) : null;

//     if (
//       checkIn &&
//       checkOut &&
//       guests &&
//       dayjs(checkIn).isValid() &&
//       dayjs(checkOut).isValid() &&
//       guests > 0
//     ) {
//       fetchAvailableRooms({ checkIn, checkOut, guests });
//     }
//   }, []); // only on mount

//   const fetchAvailableRooms = async (filter = {}, retries = 3) => {
//     try {
//       setIsLoading(true);
//       setError('');

//       const payload = {
//         checkIn: filter.checkIn || dayjs().format('YYYY-MM-DD'),
//         checkOut: filter.checkOut || dayjs().add(1, 'day').format('YYYY-MM-DD'),
//         guests: filter.guests || 1,
//       };

//       console.log('✅ Sending request to /api/search with:', payload);

//       const res = await axios.post('http://localhost:5005/api/search', payload, { timeout: 5000 });
//       setAvailableRooms(res.data);
//     } catch (err) {
//       console.error('❌ Error fetching rooms:', err.message, err.stack);

//       let errorMessage;
//       if (err.code === 'ERR_NETWORK' && retries > 0) {
//         console.log(`Retrying request (${retries} attempts left)...`);
//         setTimeout(() => fetchAvailableRooms(filter, retries - 1), 1000);
//         return;
//       } else if (err.code === 'ERR_NETWORK') {
//         errorMessage = t('networkError');
//       } else if (err.response) {
//         errorMessage = err.response.data?.error || t('serverError');
//       } else {
//         errorMessage = t('searchError');
//       }

//       setError(errorMessage);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleSearch = ({ checkIn, checkOut, guests }) => {
//     const formattedParams = {
//       checkIn: dayjs(checkIn).format('YYYY-MM-DD'),
//       checkOut: dayjs(checkOut).format('YYYY-MM-DD'),
//       guests: Number(guests),
//     };

//     setSearchParams(formattedParams);
//     fetchAvailableRooms(formattedParams); // 🔥 FIXED: Immediately fetch
//   };

//   return (
//     <>
//       <section className="booking-section">
//         <BookingFind onResults={handleSearch} initialParams={searchParams} />
//       </section>

//       <div className="booking-page">
//         <h1 className="booking-page__title">{t('roomsTitle')}</h1>

//         {error && (
//           <p className="error-message">
//             {error}
//             <button onClick={() => fetchAvailableRooms(searchParams, 3)} className="retry-button">
//               {t('retry')}
//             </button>
//           </p>
//         )}

//         {isLoading && <p className="loading-message">{t('loading')}</p>}

//         <div className="room-list">
//           {availableRooms.length === 0 && !isLoading && !error ? (
//             <p>{t('noRooms')}</p>
//           ) : (
//             availableRooms.map((room) => (
//               <div className="room-card" key={room.id}>
//                 <img
//                   src={roomsImages[`../assets/room-${room.id}.jpg`] || roomsImages['../assets/room-1.jpg']}
//                   alt={room.name[i18n.language]}
//                   className="room-card__image"
//                 />
//                 <div className="room-card__content">
//                   <h2>{room.name[i18n.language]}</h2>
//                   <p>{room.description[i18n.language]}</p>
//                   <button
//                     className="room-card__button"
//                     onClick={() => setSelectedRoom(room)}
//                   >
//                     {t('price')}
//                   </button>
//                 </div>
//               </div>
//             ))
//           )}
//         </div>
//       </div>

//       {selectedRoom && (
//         <div className="modal-backdrop">
//           <div className="modal">
//             <BookingForm
//               room={selectedRoom}
//               checkIn={searchParams.checkIn}
//               checkOut={searchParams.checkOut}
//               onClose={() => setSelectedRoom(null)}
//             />
//           </div>
//         </div>
//       )}
//     </>
//   );
// };

// export default BookingPage;
// BookingPage.jsx
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
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const { checkIn, checkOut, guests, roomId } = searchParams;
    const formattedCheckIn = checkIn ? dayjs(checkIn).format('YYYY-MM-DD') : null;
    const formattedCheckOut = checkOut ? dayjs(checkOut).format('YYYY-MM-DD') : null;

    if (roomId && !checkIn) {
      fetchAllRooms();
    } else if (
      formattedCheckIn &&
      formattedCheckOut &&
      guests &&
      dayjs(formattedCheckIn).isValid() &&
      dayjs(formattedCheckOut).isValid() &&
      guests > 0
    ) {
      fetchAvailableRooms({ checkIn: formattedCheckIn, checkOut: formattedCheckOut, guests });
    } else {
      fetchAllRooms();
    }
  }, []);

  const fetchAvailableRooms = async (filter = {}, retries = 3) => {
    try {
      setIsLoading(true);
      setError('');

      const payload = {
        checkIn: filter.checkIn || dayjs().format('YYYY-MM-DD'),
        checkOut: filter.checkOut || dayjs().add(1, 'day').format('YYYY-MM-DD'),
        guests: filter.guests || 1,
      };

      console.log('✅ Sending request to /api/search with:', payload);
      const res = await axios.post('http://localhost:5005/api/search', payload, { timeout: 5000 });
      setAvailableRooms(res.data);
    } catch (err) {
      console.error('❌ Error fetching rooms:', err.message, err.stack);
      let errorMessage;

      if (err.code === 'ERR_NETWORK' && retries > 0) {
        console.log(`Retrying request (${retries} attempts left)...`);
        setTimeout(() => fetchAvailableRooms(filter, retries - 1), 1000);
        return;
      } else if (err.code === 'ERR_NETWORK') {
        errorMessage = t('networkError');
      } else if (err.response) {
        errorMessage = err.response.data?.error || t('serverError');
      } else {
        errorMessage = t('searchError');
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllRooms = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get('http://localhost:5005/api/rooms');
      setAvailableRooms(res.data);
    } catch (err) {
      setError(t('serverError'));
      console.error('Error fetching all rooms:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = ({ checkIn, checkOut, guests }) => {
    const formattedParams = {
      checkIn: dayjs(checkIn).format('YYYY-MM-DD'),
      checkOut: dayjs(checkOut).format('YYYY-MM-DD'),
      guests: Number(guests),
    };
    setSearchParams(formattedParams);
    fetchAvailableRooms(formattedParams);
  };

  return (
    <>
      <section className="booking-section">
        <BookingFind onResults={handleSearch} initialParams={searchParams} />
      </section>

      <div className="booking-page">
        <h1 className="booking-page__title">{t('roomsTitle')}</h1>

        {error && (
          <p className="error-message">
            {error}
            <button onClick={() => fetchAvailableRooms(searchParams, 3)} className="retry-button">
              {t('retry')}
            </button>
          </p>
        )}

        {isLoading && <p className="loading-message">{t('loading')}</p>}

        <div className="room-list">
          {availableRooms.length === 0 && !isLoading && !error ? (
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
                  <button className="room-card__button" onClick={() => setSelectedRoom(room)}>
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
