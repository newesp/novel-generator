import type { InputHTMLAttributes, ReactNode } from 'react';

export function Input(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'label'> & { label?: ReactNode }) {
  const { label, style, ...rest } = props;
  return (
    <div className="form-group" style={{ flex: 1 }}>
      {label && <label className="form-label">{label}</label>}
      <input className="form-input" style={style} {...rest} />
    </div>
  );
}
