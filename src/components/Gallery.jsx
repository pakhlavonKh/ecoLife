import React from 'react';

function Gallery() {
  const images = import.meta.glob('../assets/photo-*.jpg', { eager: true, as: 'url' });

  // Get sorted array of image URLs
  const sortedImages = Object.entries(images)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url);

  return (
    <section className="gallery">
      {sortedImages.map((src, index) => (
        <figure key={index} className={`gallery__item gallery__item--${index + 1}`}>
          <img src={src} alt={`Gallery image ${index + 1}`} className="gallery__img" />
        </figure>
      ))}
    </section>
  );
}

export default Gallery;
