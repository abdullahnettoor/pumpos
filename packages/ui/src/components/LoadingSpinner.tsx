import React from 'react';

export interface LoadingSpinnerProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  text = 'Loading...',
  size = 'md',
  className = '',
}) => {
  const sizeClass = size === 'sm' ? 'loading-spinner-sm' : 
                    size === 'lg' ? 'loading-spinner-lg' : '';
  
  return (
    <div className={`loading-container ${className}`}>
      <div className={`loading-spinner ${sizeClass}`} />
      {text && <span className="loading-text">{text}</span>}
    </div>
  );
};
