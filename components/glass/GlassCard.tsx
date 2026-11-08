type Props = {
  as?: 'div' | 'section' | 'article' | 'aside';
  /* The card's inner padding (.card); off for a table that runs to the edge. */
  pad?: boolean;
  /* Kept for callers; the design's .glass always rises in. */
  rise?: boolean;
  /* Kept for callers; hover lift lives on the design's own classes. */
  lift?: boolean;
  /* Reveal on scroll (the design's .reveal). */
  reveal?: boolean;
} & React.HTMLAttributes<HTMLElement>;

/* The design's glass card: <section class="glass card">. */
export function GlassCard({ as: Tag = 'div', pad = true, rise: _rise, lift: _lift, reveal = false, className = '', children, ...rest }: Props) {
  const cls = ['glass', pad && 'card', reveal && 'reveal', className].filter(Boolean).join(' ');
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
