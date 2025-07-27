import React from 'react';
import { useTranslation } from 'react-i18next';
import logo from '../assets/logo.png'; 

function Footer() {

  const { t } = useTranslation();

  return (
    <footer className="footer">
      <div className="footer__logo-box">
        <img src={logo} alt="Eco-Life Logo" className="footer__logo" />
      </div>
      <div className="footer-text">
        <div className="footer-links">
          <a href="">Contact</a>
          <a href="">Contact</a>
          <a href="">Contact</a>
          <a href="">Contact</a>
        </div>
        <div className='footer-copyright'>
          <p>© {new Date().getFullYear()} Eco-Life. {t('rights')}.</p>
          <p>Made by Pakhlavon Khamidov</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
