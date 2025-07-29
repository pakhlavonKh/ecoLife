import React from 'react';

function Gallery() {
  const images = import.meta.glob('../assets/gallery-*.webp', { eager: true, as: 'url' });

  const sortedImages = Object.entries(images)
    .map(([, url]) => url);

  return (
    <section className="gallery">
      <ul className="gallery__list">
        {sortedImages.map((src, idx) => (
          <li key={idx} className={`gallery__item gallery__item--${idx + 1}`}>
            <img src={src} alt={`Gallery ${idx + 1}`} className="gallery__image" loading='lazy' />
          </li>
        ))}

      </ul>
    </section>
  );
}

export default Gallery;
