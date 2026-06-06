import type { ReactNode } from 'react';

interface ScreenProps {
  children: ReactNode;
  center?: boolean;
  className?: string;
}

export function Screen({ children, center = false, className = '' }: ScreenProps) {
  return (
    <div className={`screen${center ? ' screen--center' : ''}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
