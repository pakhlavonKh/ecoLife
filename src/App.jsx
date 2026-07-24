import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import BookingPage from './pages/BookingPage';
import BookingSuccessPage from './pages/BookingSuccessPage';
import BookingFailPage from './pages/BookingFailPage';

import Home from './pages/Home';
import HowToGet from './pages/HowToget';

function App() {
  return (
    <>
      <Header />

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/booking" element={<BookingPage />} />
          <Route path="/booking/success" element={<BookingSuccessPage />} />
          <Route path="/booking/fail" element={<BookingFailPage />} />
          <Route path="/how-to-get" element={<HowToGet />} />
        </Routes>
      </main>

      <Footer />
    </>
  );
}

export default App;
