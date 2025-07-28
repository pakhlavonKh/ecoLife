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
          <a href="tel:+998559000110">{t('phoneN')}</a>
          <a href="https://t.me/EcoLifeEtiqod?fbclid=PAZXh0bgNhZW0CMTEAAacnEUDTxTa1RbDFFjNf077cMCdn19WR2NExBsLTIHJpZnNh8R7SK8R7-nJorA_aem_fovIWFQAaJIgE39cUWcUWA">Telegram</a>
          <a href="https://www.instagram.com/eco_life_etiqod/">Instagram</a>
          <a href="">Email</a>
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
