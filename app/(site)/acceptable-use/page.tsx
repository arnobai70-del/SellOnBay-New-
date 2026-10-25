import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { CONFIG } from '@/lib/config';
import { pageMetadata } from '@/lib/seo/pageMeta';

export const generateMetadata = () => pageMetadata('/acceptable-use');

export default function AcceptableUse() {
  return (
    <LegalPage path="/acceptable-use">
      <h2>Not allowed</h2>
      <ul>
        <li>Phishing, fake login pages, or pages that pretend to be another person or company.</li>
        <li>Counterfeit goods and copyrighted material you do not own.</li>
        <li>Malware, hidden trackers, or code that takes data without telling the user.</li>
        <li>Adult content and anything illegal where the site is shown.</li>
        <li>Spam, scams, and asking people to pay or talk outside the platform.</li>
      </ul>

      <h2>What happens</h2>
      <p>
        Anyone can report a site on the <Link href="/report-abuse">abuse report page</Link>. Reports reach our admins. A hosted site that gets several independent reports from verified accounts is
        paused until an admin has looked at it. Admins can suspend a site or an account at once. Chat messages that share contact details are blocked. After {CONFIG.chat.warnAtBlocks} blocks in{' '}
        {CONFIG.chat.windowDays} days you get a warning, and after {CONFIG.chat.suspendAtBlocks} your account can be suspended.
      </p>
    </LegalPage>
  );
}
