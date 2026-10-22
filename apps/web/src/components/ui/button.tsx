import type { ComponentProps, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

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
  if (!icon) return children;
  return (
    <>
      <span className="control-action-label">{children}</span>
      <span className="control-action-icon" aria-hidden="true">
        <ControlIcon name={icon} className={icon === 'arrow' ? 'control-arrow-out' : ''} />
        {icon === 'arrow' && <ControlIcon name="arrow" className="control-arrow-in" />}
      </span>
    </>
  );
}

function classes(variant: Variant, icon: ActionIcon | undefined, className: string) {
  return `control-button control-${variant}${icon ? ' control-with-icon' : ''} ${className}`;
}

/** A single pill surface with its action icon inside. */
export function Button({
  variant = 'primary',
  icon,
  children,
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'> & Appearance) {
  return (
    <button {...props} type={type} className={classes(variant, icon, className)}>
      <Content icon={icon}>{children}</Content>
    </button>
  );
}

export function ActionLink({
  variant = 'primary',
  icon = 'arrow',
  children,
  className = '',
  ...props
}: LinkProps & Appearance) {
  return (
    <Link {...props} className={classes(variant, icon, className)}>
      <Content icon={icon}>{children}</Content>
    </Link>
  );
}
