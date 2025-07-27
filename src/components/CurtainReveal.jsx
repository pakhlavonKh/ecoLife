import React, { useEffect, useRef } from 'react';

const CurtainReveal = ({ children, type = 'vertical' }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    const node = containerRef.current;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add('revealed');
        }
      },
      { threshold: 0.5 }
    );

    if (node) observer.observe(node);

    return () => {
      if (node) observer.unobserve(node);
    };
  }, []);

  return (
    <div className={`curtain-reveal ${type}`} ref={containerRef}>
      <div className="curtain"></div>
      <div className="curtain-content">{children}</div>
    </div>
  );
};

export default CurtainReveal;
