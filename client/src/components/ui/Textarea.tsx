import React from 'react';
import { cn } from './utils.ts';
import './ui.css';

export type TextareaVariant = 'default' | 'sketch';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: TextareaVariant;
}

const variantClass: Record<TextareaVariant, string> = {
  default: '',
  sketch: 'ui-textarea--sketch',
};

export function Textarea({ variant = 'default', className, ...props }: TextareaProps) {
  return <textarea className={cn('ui-textarea', variantClass[variant], className)} {...props} />;
}
