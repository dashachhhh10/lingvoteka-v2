import { useRef, type ComponentProps } from 'react';
import { ControlIcon } from './button';

export function SearchField({
  id,
  label,
  value,
  onValueChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="relative min-w-0 w-full sm:max-w-[460px]">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <ControlIcon
        name="search"
        className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted"
      />
      <input
        ref={input}
        id={id}
        className="control-field control-search"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-olive-soft hover:text-ink"
          aria-label={`Очистить: ${label.toLocaleLowerCase('ru')}`}
          onClick={() => {
            onValueChange('');
            input.current?.focus();
          }}
        >
          <ControlIcon name="close" />
        </button>
      )}
    </div>
  );
}

export function SelectField({ className = '', children, ...props }: ComponentProps<'select'>) {
  return (
    <span className="relative block min-w-0">
      <select {...props} className={`control-field control-select ${className}`}>
        {children}
      </select>
      <ControlIcon
        name="chevron"
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
      />
    </span>
  );
}
