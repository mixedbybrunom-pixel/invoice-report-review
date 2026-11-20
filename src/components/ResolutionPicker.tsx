import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { RESOLUTION_REASON_GROUPS } from '@/lib/resolutionReasons';

interface ResolutionPickerProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  placement?: 'top' | 'bottom';
}

export function ResolutionPicker({
  value,
  onChange,
  label,
  placeholder = 'Choose a resolution',
  className = 'w-full',
  placement = 'bottom',
}: ResolutionPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = RESOLUTION_REASON_GROUPS.flatMap((group) => group.options).find((option) => option === value);

  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeIfOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className="field flex h-11 items-center justify-between gap-3 truncate px-3.5 py-2 text-left text-[15px] font-medium"
      >
        <span className={selected ? 'truncate text-ink' : 'truncate text-ink-3'}>{selected ?? placeholder}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          id={menuId}
          role="listbox"
          aria-label={label}
          className={`scrollbar-thin absolute left-0 z-[80] max-h-[min(72vh,560px)] w-full min-w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-pop ${placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          {RESOLUTION_REASON_GROUPS.map((group) => (
            <section key={group.label} role="group" aria-label={group.label}>
              <h3 className="px-3 pb-1.5 pt-3 text-xs font-semibold tracking-normal text-ink-2">{group.label}</h3>
              {group.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={value === option}
                  onClick={() => { onChange(option); setOpen(false); }}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] font-medium leading-snug transition-colors ${value === option ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}
                >
                  <span>{option}</span>
                  {value === option && <Check className="h-4 w-4 shrink-0" />}
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
