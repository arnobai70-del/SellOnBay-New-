import Link from 'next/link';

type Look = { variant?: 'primary' | 'ghost' | 'warn'; size?: 'md' | 'sm' };
type AsLink = Look & { href: string } & Omit<React.ComponentProps<typeof Link>, 'href'>;
type AsButton = Look & { href?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>;

/* The design's .btn (design-reference/*.html): mint, .ghost, .warn, and .sm. */
const classes = ({ variant = 'primary', size = 'md' }: Look, extra?: string) =>
  ['btn', size === 'sm' && 'sm', variant === 'ghost' && 'ghost', variant === 'warn' && 'warn', extra].filter(Boolean).join(' ');

/* A link when it has an href, otherwise a button that never submits a form by accident. */
export function Button(props: AsLink | AsButton) {
  if (props.href !== undefined) {
    const { variant, size, className, prefetch = false, ...rest } = props;
    return <Link className={classes({ variant, size }, className)} prefetch={prefetch} {...rest} />;
  }
  const { variant, size, className, type = 'button', ...rest } = props;
  return <button type={type} className={classes({ variant, size }, className)} {...rest} />;
}
