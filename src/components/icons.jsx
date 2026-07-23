import React from 'react';

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const icons = {
  restaurants: (props) => (
    <svg {...base} {...props}>
      <path d="M4 3v7a2 2 0 0 0 2 2h1v9" />
      <path d="M7 3v9" />
      <path d="M10 3v4a3 3 0 0 0 3 3v11" />
      <path d="M17 21V10.5" />
      <path d="M17 10.5c2.2 0 3.5-1.4 3.5-3.5S19.2 3.5 17 3.5 13.5 4.9 13.5 7s1.3 3.5 3.5 3.5Z" />
    </svg>
  ),
  horses: (props) => (
    <svg {...base} {...props}>
      <path d="M5 19c1.5-3 3-5 5-6.5" />
      <path d="M9.5 12.5c1.2-2.2 3.4-3.8 6.2-4.2 1.4-.2 2.3-1.4 2.1-2.7L17 3c1.8.4 3.2 1.7 3.8 3.4.5 1.5.2 3.2-.8 4.4l-1.5 1.7c-.6.7-.9 1.6-.9 2.5V21" />
      <path d="M14 21v-4.5" />
      <path d="M8 21v-3" />
      <path d="M18.5 7.2h.01" />
    </svg>
  ),
  conference: (props) => (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
      <path d="M7 9h4" />
      <path d="M7 12h6" />
    </svg>
  ),
  pool: (props) => (
    <svg {...base} {...props}>
      <path d="M3 15c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0" />
      <path d="M3 19c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0" />
      <path d="M8 4v7" />
      <path d="M6.5 6.5c1 .8 2 .8 3 0" />
      <path d="M16 6c0 2.2-1.8 3.5-1.8 5.5" />
    </svg>
  ),
  water: (props) => (
    <svg {...base} {...props}>
      <path d="M12 3c-3.5 4.2-6 7.4-6 10.2a6 6 0 0 0 12 0C18 10.4 15.5 7.2 12 3Z" />
      <path d="M9.5 14.5c.4 1.4 1.5 2.3 2.8 2.3" />
    </svg>
  ),
  honey: (props) => (
    <svg {...base} {...props}>
      <path d="M12 3v3" />
      <path d="M8.5 8.5 12 6l3.5 2.5v5L12 16l-3.5-2.5v-5Z" />
      <path d="M8.5 13.5 12 16l3.5-2.5" />
      <path d="M12 16v5" />
      <path d="M9 21h6" />
      <path d="M7 11.5h10" />
    </svg>
  ),
};

export default icons;
