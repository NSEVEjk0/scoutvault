import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export const cn = (...values: Parameters<typeof clsx>) => twMerge(clsx(...values));

export function Button({ className, variant = 'primary', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={cn('button', `button-${variant}`, className)} {...props}>{children}</button>;
}

export function Sheet({ open, onOpenChange, title, description, children, wide = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay" />
      <DialogPrimitive.Content className={cn('dialog-content', wide && 'dialog-wide')}
        onOpenAutoFocus={() => { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={event => { if (previousFocus.current?.isConnected) { event.preventDefault(); previousFocus.current.focus(); } }}>
        <header className="dialog-header">
          <div><DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className={description ? 'muted dialog-description' : 'sr-only'}>{description ?? title}</DialogPrimitive.Description></div>
          <DialogPrimitive.Close asChild><Button variant="ghost" className="icon-button" aria-label="Close dialog"><X size={20} aria-hidden /></Button></DialogPrimitive.Close>
        </header>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

export function Field({ label, id, children, hint, error }: { label: string; id: string; children: ReactNode; hint?: string; error?: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}{error ? <p className="field-error" role="alert">{error}</p> : hint && <p className="field-hint">{hint}</p>}</div>;
}

export function Spinner({ label = 'Working…' }: { label?: string }) {
  return <span className="working-label" role="status"><span className="loading-dot" aria-hidden />{label}</span>;
}
