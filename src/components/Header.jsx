import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router-dom';
import logo from '../assets/logo.png';

const LANGS = ['ru', 'uz', 'en'];

function LangSwitch() {
  const { i18n } = useTranslation();
  const active = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2).toLowerCase();

  return (
    <div className="lang-switch" role="group" aria-label="Language">
      {LANGS.map((lng, index) => (
        <React.Fragment key={lng}>
          {index > 0 && (
            <span className="lang-switch__sep" aria-hidden="true">
              |
            </span>
          )}
          <button
            type="button"
            className={`lang-switch__btn${active === lng ? ' is-active' : ''}`}
            onClick={() => i18n.changeLanguage(lng)}
            aria-pressed={active === lng}
          >
            {lng.toUpperCase()}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function Header() {
  const { t } = useTranslation();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(() => window.scrollY > 40);
  const [open, setOpen] = useState(false);

  const isClear = location.pathname === '/' && !scrolled && !open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const linkClass = ({ isActive }) =>
    `header__link${isActive ? ' is-active' : ''}`;

  const closeDrawer = () => setOpen(false);

  return (
    <>
      <header className={`header${isClear ? ' header--clear' : ''}`}>
        <div className="header__inner">
          <Link to="/" className="header__brand" onClick={closeDrawer}>
            <img src={logo} alt="Eco-Life Etiqod" className="header__logo" />
          </Link>

          <nav className="header__nav" aria-label="Primary">
            <NavLink to="/" end className={linkClass}>
              {t('home')}
            </NavLink>
            <NavLink to="/booking" className={linkClass}>
              {t('rooms')}
            </NavLink>
            <NavLink to="/how-to-get" className={linkClass}>
              {t('howToGet')}
            </NavLink>
            <a href="#footer" className="header__link">
              {t('contact')}
            </a>
          </nav>

          <div className="header__tools">
            <LangSwitch />
            <Link to="/booking" className="btn btn--primary btn--compact">
              {t('booking')}
            </Link>
          </div>

          <button
            type="button"
            className={`header__burger${open ? ' open' : ''}`}
            onClick={() => setOpen((prev) => !prev)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <div className={`drawer${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <nav className="drawer__nav" aria-label="Mobile">
          <NavLink to="/" end onClick={closeDrawer}>
            {t('home')}
          </NavLink>
          <NavLink to="/booking" onClick={closeDrawer}>
            {t('rooms')}
          </NavLink>
          <NavLink to="/how-to-get" onClick={closeDrawer}>
            {t('howToGet')}
          </NavLink>
          <a href="#footer" onClick={closeDrawer}>
            {t('contact')}
          </a>
          <Link to="/booking" className="btn btn--primary" onClick={closeDrawer}>
            {t('booking')}
          </Link>
        </nav>
        <div className="drawer__lang">
          <LangSwitch />
        </div>
      </div>
    </>
  );
}

export default Header;
