import { CSSProperties, ReactNode } from 'react';

/**
 * A surface card with Filo's signature "sticker shadow" — a hard 2px ink
 * offset with zero blur. The `sm` variant uses the tighter 1.5px offset.
 */
export function Sticker({
  children,
  className = '',
  small = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  small?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`${small ? 'sticker-sm' : 'sticker'} rounded-xl ${className}`}
      style={{ background: 'var(--color-surface)', ...style }}
    >
      {children}
    </div>
  );
}
