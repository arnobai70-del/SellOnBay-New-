import Image from 'next/image';
import Link from 'next/link';
import { PRODUCTS, imageFor, money } from '@/lib/data';

/* Endless sliding strip of real listings. Hover pauses it. With reduced motion it becomes a normal scrollable row. */
export function HeroMarquee() {
  const items = PRODUCTS.map((p) => ({ p, img: imageFor(p.id) })).filter((x) => x.img);
  if (!items.length) return null;

  const row = (copy: number) =>
    items.map(({ p, img }) => (
      <Link key={copy + p.id} href={`/product/${p.id}`} className="mq-card" tabIndex={copy ? -1 : undefined} aria-hidden={copy ? true : undefined}>
        <Image src={img!.src} alt={copy ? '' : `${p.name} website preview`} width={img!.width} height={img!.height} sizes="220px" />
        <span className="mq-tag">
          <b>{p.name}</b> {money(p.price)}
        </span>
      </Link>
    ));

  return (
    <div className="mq" aria-label="Sites people launch on SellOnBay">
      <div className="mq-track">
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}
