import React from 'react';
import { cn } from './utils.ts';
import './ui.css';

export type InputVariant = 'default' | 'code' | 'search';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  /** Icon rendered inside the field (used with `search` variant). */
  icon?: React.ReactNode;
}

const variantClass: Record<InputVariant, string> = {
  default: '',
  code: 'ui-input--code',
  search: 'ui-input--search',
};

export function Input({ variant = 'default', icon, className, ...props }: InputProps) {
  const input = (
    <input className={cn('ui-input', variantClass[variant], className)} {...props} />
  );

  if (variant === 'search' || icon) {
    return (
      <div className="ui-input-wrap">
        {icon && <span className="ui-input-wrap__icon">{icon}</span>}
        {input}
      </div>
    );
  }

  return input;
}
