type Props = {
  as?: 'div' | 'section' | 'article' | 'aside';
  /* The card's inner padding; turn it off for a table that runs to the edge. */
  pad?: boolean;
  /* The rise-in with blur. Turn it off for anything that holds the page's main headline or picture. */
  rise?: boolean;
  /* Hover lift and sheen, for cards that are links. */
  lift?: boolean;
  /* Reveal on scroll instead of rising in. */
  reveal?: boolean;
} & React.HTMLAttributes<HTMLElement>;

export function GlassCard({ as: Tag = 'div', pad = true, rise = true, lift = false, reveal = false, className = '', children, ...rest }: Props) {
  const cls = ['g-glass', pad && 'g-card', reveal ? 'g-reveal' : rise && 'g-rise', lift && 'g-lift', className].filter(Boolean).join(' ');
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
