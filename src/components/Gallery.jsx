import React from 'react';

const galleryModules = import.meta.glob('../assets/gallery-*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

const images = Object.entries(galleryModules)
  .sort(([a], [b]) => {
    const num = (path) => Number(path.match(/gallery-(\d+)/)?.[1] || 0);
    return num(a) - num(b);
  })
  .map(([, url]) => url);

const SPAN = {
  0: 'gallery-grid__item--wide',
  3: 'gallery-grid__item--tall',
  5: 'gallery-grid__item--wide',
  8: 'gallery-grid__item--tall',
};

function Gallery() {
  return (
    <div className="gallery-grid">
      {images.map((src, idx) => (
        <figure
          key={src}
          className={`gallery-grid__item${SPAN[idx] ? ` ${SPAN[idx]}` : ''}`}
        >
          <img src={src} alt="" loading="lazy" />
        </figure>
      ))}
    </div>
  );
}

export default Gallery;
