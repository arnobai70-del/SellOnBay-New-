import Link from 'next/link';

type Look = { variant?: 'primary' | 'ghost' | 'warn'; size?: 'md' | 'sm' };
type AsLink = Look & { href: string } & Omit<React.ComponentProps<typeof Link>, 'href'>;
type AsButton = Look & { href?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>;

const classes = ({ variant = 'primary', size = 'md' }: Look, extra?: string) =>
  ['g-btn', variant === 'ghost' && 'g-btn-ghost', variant === 'warn' && 'g-btn-warn', size === 'sm' && 'g-btn-sm', extra].filter(Boolean).join(' ');

/* A link when it has an href, otherwise a button that never submits a form by accident. */
export function Button(props: AsLink | AsButton) {
  if (props.href !== undefined) {
    const { variant, size, className, ...rest } = props;
    return <Link className={classes({ variant, size }, className)} {...rest} />;
  }
  const { variant, size, className, type = 'button', ...rest } = props;
  return <button type={type} className={classes({ variant, size }, className)} {...rest} />;
}
