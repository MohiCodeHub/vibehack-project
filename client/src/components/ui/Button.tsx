import React from 'react';
import { cn } from './utils.ts';
import './ui.css';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'success'
  | 'destructive'
  | 'ghost'
  | 'outline'
  | 'disabled';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'ui-btn--primary',
  secondary: 'ui-btn--secondary',
  accent: 'ui-btn--accent',
  success: 'ui-btn--success',
  destructive: 'ui-btn--destructive',
  ghost: 'ui-btn--ghost',
  outline: 'ui-btn--outline',
  disabled: 'ui-btn--disabled',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'ui-btn--sm',
  md: '',
  lg: 'ui-btn--lg',
  icon: 'ui-btn--icon',
};

export function Button({
  variant = 'primary',
  size = 'md',
  block = true,
  className,
  disabled,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || variant === 'disabled';

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={cn(
        'ui-btn',
        variantClass[variant],
        sizeClass[size],
        block && size !== 'icon' && 'ui-btn--block',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
