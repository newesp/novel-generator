import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'text';
  size?: 'sm' | 'md';
}

const VARIANT_STYLES: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
  primary: { background: 'var(--accent)', color: '#fff' },
  secondary: { background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' },
  ghost: { background: 'transparent', color: 'var(--text-primary)' },
  text: { background: 'transparent', color: 'var(--text-secondary)' },
};

export function Button({
  variant = 'secondary',
  size = 'md',
  style: styleProp,
  ...props
}: ButtonProps) {
  const sizeStyle = size === 'sm'
    ? { height: 28, padding: '0 10px', fontSize: 13 }
    : { height: 32, padding: '0 14px', fontSize: 14 };

  return (
    <button
      {...props}
      style={{
        borderRadius: 'var(--radius-md)',
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 150ms ease-out',
        border: 'none',
        ...VARIANT_STYLES[variant],
        ...sizeStyle,
        ...styleProp,
      }}
    />
  );
}
