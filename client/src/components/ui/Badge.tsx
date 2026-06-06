import React from 'react';
import { cn } from './utils.ts';
import './ui.css';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'warning'
  | 'success'
  | 'outline'
  | 'host'
  | 'bot';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClass: Record<BadgeVariant, string> = {
  default: 'ui-badge--default',
  secondary: 'ui-badge--secondary',
  warning: 'ui-badge--warning',
  success: 'ui-badge--success',
  outline: 'ui-badge--outline',
  host: 'ui-badge--host',
  bot: 'ui-badge--bot',
};

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span className={cn('ui-badge', variantClass[variant], className)} {...props}>
      {children}
    </span>
  );
}
