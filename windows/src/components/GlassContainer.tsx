import React from 'react';
import { clsx } from 'clsx';

interface GlassContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const GlassContainer: React.FC<GlassContainerProps> = ({ children, className }) => {
  return (
    <div
      className={clsx(
        'glass-panel rounded-2xl p-5 shadow-2xl transition-all duration-300',
        className
      )}
    >
      {children}
    </div>
  );
};
