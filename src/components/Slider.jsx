import React, { useState, useEffect, useRef } from 'react';

function Slider({ children, autoplay = true, interval = 5000 }) {
  const [index, setIndex] = useState(0);
  const total = React.Children.count(children);
  const startX = useRef(null);
  const sliderRef = useRef(null);

  const next = () => setIndex((i) => (i + 1) % total);
  const prev = () => setIndex((i) => (i - 1 + total) % total);
  const goTo = (i) => setIndex(i);

  useEffect(() => {
    if (!autoplay) return;
    const timer = setInterval(next, interval);
    return () => clearInterval(timer);
  }, [autoplay, interval]);

  // Touch swipe handlers
  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (!startX.current) return;
    const endX = e.changedTouches[0].clientX;
    const diff = startX.current - endX;

    if (diff > 50) next();
    else if (diff < -50) prev();

    startX.current = null;
  };

  return (
    <div
      className="slider"
      ref={sliderRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button className="slider__arrow left" onClick={prev}>←</button>

      <div className="slider__container-wrapper">
        <div
          className="slider__container"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {React.Children.map(children, (child, i) => (
            <div className="slider__slide" key={i}>
              {child}
            </div>
          ))}
        </div>
      </div>

      <button className="slider__arrow right" onClick={next}>→</button>

      <div className="slider__dots">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            className={`slider__dot ${i === index ? 'active' : ''}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  );
}

export default Slider;
