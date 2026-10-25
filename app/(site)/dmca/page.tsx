import { LegalPage } from '@/components/LegalPage';
import { BRAND_EMAIL } from '@/lib/brand';
import { pageMetadata } from '@/lib/seo/pageMeta';

export const generateMetadata = () => pageMetadata('/dmca');

export default function Dmca() {
  return (
    <LegalPage path="/dmca">
      <h2>If someone copied your work</h2>
      <p>Send a notice to {BRAND_EMAIL} with these things.</p>
      <ul>
        <li>Your name and how we can reach you.</li>
        <li>What you own, with a link to the original.</li>
        <li>The link to the listing or site you say copies it.</li>
        <li>A statement that you believe in good faith the use is not allowed, and that your notice is accurate.</li>
        <li>Your signature (typing your full name is enough).</li>
      </ul>

      <h2>What we do</h2>
      <p>We may pause the listing while we look. We tell the seller, who can answer the claim. Sellers who repeatedly copy other people&apos;s work are removed.</p>

      <h2>If you think we got it wrong</h2>
      <p>Sellers can send a counter-notice to the same address. A lawyer must check this process before launch.</p>
    </LegalPage>
  );
}
