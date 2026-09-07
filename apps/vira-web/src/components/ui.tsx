import * as Dialog from "@radix-ui/react-dialog";
import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from "react";
import type { Tone } from "../types.js";

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}

export function StatusBadge({ tone = "neutral", children }: PropsWithChildren<{ readonly tone?: Tone }>) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Icon({ name }: { readonly name: string }) {
  const paths: Record<string, ReactNode> = {
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><path d="M12 8v5" /><path d="M12 17h.01" /><path d="M10.3 3.7 2.5 18a2 2 0 0 0 1.8 3h15.4a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /></>,
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? <circle cx="12" cy="12" r="8" />}</svg>;
}

export function MobileDrawer({ open, onOpenChange, children }: PropsWithChildren<{ readonly open: boolean; readonly onOpenChange: (open: boolean) => void }>) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content className="drawer-content" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Vira navigation</Dialog.Title>
          <Dialog.Close className="icon-button drawer-close" aria-label="Close navigation"><Icon name="close" /></Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
