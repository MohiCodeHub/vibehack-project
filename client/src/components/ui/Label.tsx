import React from 'react';
import { cn } from './utils.ts';
import './ui.css';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function Label({ required, className, children, ...props }: LabelProps) {
  return (
    <label className={cn('ui-label', required && 'ui-label--required', className)} {...props}>
      {children}
    </label>
  );
}
