import React, {useState} from 'react';
import { useTranslation } from 'react-i18next';
import logoDesktop from '../assets/logo.png';
import logoMobile from '../assets/logo-white.png'; // make this image simpler or smaller

import { Link } from 'react-router-dom';


function Header() {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <>
      <input
        type="checkbox"
        id="nav-toggle"
        className="navigation__checkbox"
        checked={isOpen}
        onChange={() => setIsOpen(!isOpen)}
      />
      <label htmlFor="nav-toggle" className="navigation__button">
        <span className="navigation__icon">&nbsp;</span>
      </label>
      <header className="header">
      <div className="header__logo">
        <Link to="/">
          <img src={logoDesktop} alt="logo" className="logo logo--desktop"/>
          <img src={logoMobile} alt="logo mobile" className="logo logo--mobile" />
        </Link>
      </div>

      <div className='header__menu'>
        <nav className="header__nav">
          <Link to="/">{t('home')}</Link>
          <Link to="/booking">{t('booking')}</Link>
          <a href="#contact">{t('contact')}</a>
          <Link to="/how-to-get">{t('howToGet')}</Link>
        </nav>

        <div className="header__lang">
          <select
            onChange={(e) => changeLanguage(e.target.value)}
            value={i18n.language}
          >
            <option value="en">EN</option>
            <option value="ru">RU</option>
            <option value="uz">UZ</option>
          </select>
        </div>
      </div>  
    </header>

    </>

  );
}

export default Header;
