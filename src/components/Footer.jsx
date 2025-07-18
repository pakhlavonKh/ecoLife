import React from 'react';
import { useTranslation } from 'react-i18next';

function Footer() {

  const { t } = useTranslation();

  return (
    <footer className="footer">
      <p>© {new Date().getFullYear()} Eco-Life. {t('rights')}.</p>
      <p>Made by Pakhlavon Khamidov</p>
    </footer>
  );
}

export default Footer;
