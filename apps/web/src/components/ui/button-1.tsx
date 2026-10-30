import type { ComponentProps, CSSProperties } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import './button-1.css';

type GradientAppearance = {
  width?: string;
  height?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
};

function appearance(variant: string, className: string) {
  return `gradient-button relative isolate inline-flex min-h-12 max-w-full items-center justify-center rounded-full px-6 py-3 text-center text-sm font-medium leading-6 no-underline gradient-${variant} ${className}`;
}

function dimensions(width: string | undefined, height: string | undefined, style?: CSSProperties) {
  return { width, minHeight: height, ...style };
}

/** Adapted from the supplied GradientButton with native button semantics. */
export default function GradientButton({
  children,
  width,
  height,
  variant = 'primary',
  className = '',
  style,
  type = 'button',
  ...props
}: ComponentProps<'button'> & GradientAppearance) {
  return (
    <button
      {...props}
      type={type}
      className={appearance(variant, className)}
      style={dimensions(width, height, style)}
    >
      <span className="relative z-10 min-w-0">{children}</span>
    </button>
  );
}

export function GradientLink({
  children,
  width,
  height,
  variant = 'primary',
  className = '',
  style,
  ...props
}: LinkProps & GradientAppearance) {
  return (
    <Link
      {...props}
      className={appearance(variant, className)}
      style={dimensions(width, height, style)}
    >
      <span className="relative z-10 min-w-0">{children}</span>
    </Link>
  );
}
