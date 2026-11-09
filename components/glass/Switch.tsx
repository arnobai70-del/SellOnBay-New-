'use client';
import { useState } from 'react';

type Props = {
  /* What it turns on or off, for screen readers. */
  label: string;
  /* Give `checked` to control it from outside, or `defaultChecked` to let it keep its own state. */
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
};

export function Switch({ label, checked, defaultChecked = false, onChange, disabled }: Props) {
  const [own, setOwn] = useState(defaultChecked);
  const on = checked ?? own;
  return (
    <button
      type="button"
      className={on ? 'sw on' : 'sw'}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (checked === undefined) setOwn(!on);
        onChange?.(!on);
      }}
    />
  );
}
