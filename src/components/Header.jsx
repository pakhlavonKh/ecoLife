import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import logoDesktop from '../assets/logo-big.png';
import logoMobile from '../assets/logo-white.png';

function Header() {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [show, setShow] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const location = useLocation();

  const handleScroll = () => {
    const currentScrollY = window.scrollY;
    setShow(currentScrollY <= lastScrollY || currentScrollY <= 50);
    setLastScrollY(currentScrollY);
  };

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  useEffect(() => {
    setIsOpen(false); // Auto-close menu on route change
  }, [location]);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <>
      <nav className="navigation">
        <input
          type="checkbox"
          id="nav-toggle"
          className="navigation__checkbox"
          checked={isOpen}
          onChange={() => setIsOpen(!isOpen)}
        />
        <label htmlFor="nav-toggle" className="navigation__button">
          <span className={`navigation__icon ${isOpen ? 'open' : ''}`}>&nbsp;</span>
        </label>
        <div className="navigation__background">&nbsp;</div>
        <div className="navigation__nav">
          <div className="navigation__list">
            <Link to="/" className="navigation__item" onClick={() => setIsOpen(false)}>
              {t('home')}
            </Link>
            <Link to="/how-to-get" className="navigation__item" onClick={() => setIsOpen(false)}>
              {t('howToGet')}
              </Link>
              <Link to="/booking" className="navigation__item" state={{ showAll: true }} onClick={() => setIsOpen(false)}>
                {t('rooms')}
              </Link>
            <div className="header__lang navigation__item">
              <select onChange={(e) => changeLanguage(e.target.value)} value={i18n.language}>
                <option value="en">EN</option>
                <option value="ru">RU</option>
                <option value="uz">UZ</option>
              </select>
            </div>
          </div>
        </div>
      </nav>
      <header className={`header ${show ? 'visible' : 'hidden'}`}>
        <div className="header__menu">
          <Link to="/">{t('home')}</Link>
          <Link to="/how-to-get">{t('howToGet')}</Link>
          <div className="header__logo">
            <Link to="/" onClick={() => setIsOpen(false)}>
              <img src={logoDesktop} alt="logo" className="logo logo--desktop" />
              <img src={logoMobile} alt="logo mobile" className="logo logo--mobile" />
            </Link>
          </div>
          <div className="header__lang">
            <select onChange={(e) => changeLanguage(e.target.value)} value={i18n.language}>
              <option value="en">EN</option>
              <option value="ru">RU</option>
              <option value="uz">UZ</option>
            </select>
          </div>
          <Link to="/booking" className="book-link btn" state={{ showAll: true }}>
            {t('rooms')}
          </Link>
        </div>
      </header>
    </>
  );
}

export default Header;