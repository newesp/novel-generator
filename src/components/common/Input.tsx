import type { InputHTMLAttributes } from 'react';

export function Input(props: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <div className="form-group" style={{ flex: 1 }}>
      {label && <label className="form-label">{label}</label>}
      <input className="form-input" style={style} {...rest} />
    </div>
  );
}
