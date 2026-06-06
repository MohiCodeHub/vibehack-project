import React from 'react';
import { cn } from './utils.ts';
import './ui.css';

export type CardVariant = 'default' | 'elevated' | 'highlight' | 'ghost' | 'muted';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

const variantClass: Record<CardVariant, string> = {
  default: 'ui-card--default',
  elevated: 'ui-card--elevated',
  highlight: 'ui-card--highlight',
  ghost: 'ui-card--ghost',
  muted: 'ui-card--muted',
};

const paddingClass: Record<CardPadding, string> = {
  none: 'ui-card--pad-none',
  sm: 'ui-card--pad-sm',
  md: 'ui-card--pad-md',
  lg: 'ui-card--pad-lg',
};

export function Card({
  variant = 'default',
  padding = 'md',
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div className={cn('ui-card', variantClass[variant], paddingClass[padding], className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('ui-card__header', className)} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('ui-card__body', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('ui-card__footer', className)} {...props}>
      {children}
    </div>
  );
}
