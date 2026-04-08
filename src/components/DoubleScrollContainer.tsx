import React, { useRef, useEffect, useState } from 'react';

interface DoubleScrollContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const DoubleScrollContainer: React.FC<DoubleScrollContainerProps> = ({ children, className = "" }) => {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    const updateWidth = () => {
      if (contentRef.current) {
        setContentWidth(contentRef.current.scrollWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    
    // Also update when children change (e.g. table columns toggle)
    const observer = new MutationObserver(updateWidth);
    if (contentRef.current) {
      observer.observe(contentRef.current, { childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener('resize', updateWidth);
      observer.disconnect();
    };
  }, [children]);

  const handleTopScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleBottomScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Top Scrollbar */}
      <div 
        ref={topScrollRef}
        onScroll={handleTopScroll}
        className="overflow-x-auto overflow-y-hidden h-3 mb-[-1px] hidden md:block border-b"
        style={{ scrollbarWidth: 'thin', borderColor: 'var(--border-color)', backgroundColor: 'color-mix(in srgb, var(--bg-secondary), transparent 70%)' }}
      >
        <div style={{ width: contentWidth, height: '1px' }} />
      </div>

      {/* Main Content */}
      <div 
        ref={bottomScrollRef}
        onScroll={handleBottomScroll}
        className="overflow-x-auto scroll-horizontal"
      >
        <div ref={contentRef} className="inline-block min-w-full">
          {children}
        </div>
      </div>
    </div>
  );
};
