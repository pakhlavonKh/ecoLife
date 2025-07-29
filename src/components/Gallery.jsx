import React from 'react';

function Gallery() {
  const images = [
    "https://ik.imagekit.io/hyp089vmms/assets/gallery-1.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/gallery-3.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/gallery-4.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/gallery-5.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/gallery-6.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/gallery-7.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/gallery-8.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/gallery-9.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/gallery-10.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/gallery-11.webp?tr=f-auto,q-80",
    "https://ik.imagekit.io/hyp089vmms/assets/gallery-12.webp?tr=f-auto,q-80"
  ]

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
