import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';

function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer id="footer" className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <Link to="/" className="footer__brand-link">
              <img src={logo} alt="Eco-Life Etiqod" className="footer__logo" />
              <span className="footer__wordmark">Eco-Life Etiqod</span>
            </Link>
            <p className="footer__tagline">{t('heroLead')}</p>
          </div>

          <div>
            <h4 className="footer__heading">{t('menu')}</h4>
            <nav className="footer__menu" aria-label="Footer menu">
              <Link to="/">{t('home')}</Link>
              <Link to="/booking">{t('booking')}</Link>
              <Link to="/how-to-get">{t('howToGet')}</Link>
            </nav>
          </div>

          <div>
            <h4 className="footer__heading">{t('contact')}</h4>
            <div className="footer__contacts">
              <a href="tel:+998559000110">+998 55 900 01 10</a>
              <a href="tel:+998981505080">+998 98 150 50 80</a>
              <a
                href="https://t.me/EcoLifeEtiqod"
                target="_blank"
                rel="noopener noreferrer"
              >
                Telegram
              </a>
              <a
                href="https://www.instagram.com/eco_life_etiqod/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Instagram
              </a>
              <a href="mailto:salimov.umid@icloud.com">Email</a>
            </div>
          </div>
        </div>

        <div className="footer__bottom">
          <p>
            © {year} Eco-Life. {t('rights')}.
          </p>
          <p className="footer__credits">
            Made by Pakhlavon Khamidov
            <br />
            Vision and production by Mukhsin Kamolov
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
