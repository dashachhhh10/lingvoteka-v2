import type { ComponentProps, ReactNode } from 'react';
import { type LinkProps } from 'react-router-dom';
import GradientButton, { GradientLink } from './button-1';

type Variant = 'primary' | 'secondary' | 'ghost';
type ActionIcon = 'arrow' | 'plus' | 'close';
type Appearance = { variant?: Variant; icon?: ActionIcon; children: ReactNode; className?: string };

export function ControlIcon({
  name,
  className = '',
}: {
  name: ActionIcon | 'search' | 'chevron';
  className?: string;
}) {
  return (
    <svg
      className={`size-4 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'arrow' && <path d="M6 18 18 6M6 6h12v12" />}
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
      {name === 'close' && <path d="m6 6 12 12M6 18 18 6" />}
      {name === 'chevron' && <path d="m7 10 5 5 5-5" />}
      {name === 'search' && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4 4" />
        </>
      )}
    </svg>
  );
}

function Content({ children, icon }: Pick<Appearance, 'children' | 'icon'>) {
  return (
    <>
      {children}
      {icon && icon !== 'arrow' && <ControlIcon name={icon} />}
    </>
  );
}

export function Button({
  variant = 'primary',
  icon,
  children,
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'> & Appearance) {
  return (
    <GradientButton {...props} type={type} variant={variant} className={className}>
      <Content icon={icon}>{children}</Content>
    </GradientButton>
  );
}

export function ActionLink({
  variant = 'primary',
  icon,
  children,
  className = '',
  ...props
}: LinkProps & Appearance) {
  return (
    <GradientLink {...props} variant={variant} className={className}>
      <Content icon={icon}>{children}</Content>
    </GradientLink>
  );
}
