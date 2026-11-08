import { useId } from 'react';

type Common = {
  label: string;
  /* Keeps the label for screen readers only, for a box whose purpose is plain from its place. */
  hideLabel?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
};
type Props =
  | (Common & { as?: 'input' } & React.InputHTMLAttributes<HTMLInputElement>)
  | (Common & { as: 'textarea' } & React.TextareaHTMLAttributes<HTMLTextAreaElement>)
  | (Common & { as: 'select' } & React.SelectHTMLAttributes<HTMLSelectElement>);

/* A label with its input, select or textarea, its hint and its error, tied together for screen readers. */
export function Field(props: Props) {
  const auto = useId();
  const { label, hideLabel, hint, error, className, id = auto, ...rest } = props;
  const notes = [hint ? `${id}-h` : null, error ? `${id}-e` : null].filter(Boolean).join(' ') || undefined;
  const shared = { id, className: `input ${className ?? ''}`.trim(), 'aria-describedby': notes, 'aria-invalid': error ? true : undefined };
  let control: React.ReactNode;
  if (rest.as === 'textarea') {
    const { as: _as, ...own } = rest;
    control = <textarea {...own} {...shared} />;
  } else if (rest.as === 'select') {
    const { as: _as, ...own } = rest;
    control = <select {...own} {...shared} />;
  } else {
    const { as: _as, ...own } = rest;
    control = <input {...own} {...shared} />;
  }
  return (
    <div className="field">
      <label className={hideLabel ? 'hidden-label' : undefined} htmlFor={id}>
        {label}
      </label>
      {control}
      {hint && (
        <div className="tag" id={`${id}-h`}>
          {hint}
        </div>
      )}
      {error && (
        <div className="tag" style={{ color: '#7A2E24' }} id={`${id}-e`} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
