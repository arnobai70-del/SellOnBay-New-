import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { BUGFIX_DAYS, CONFIG, REVIEW_HOURS } from '@/lib/config';
import { pageMetadata } from '@/lib/seo/pageMeta';

export const generateMetadata = () => pageMetadata('/refunds');

export default function Refunds() {
  return (
    <LegalPage path="/refunds">
      <h2>How your money is held</h2>
      <p>Your payment is held in escrow until you accept the order. You have {REVIEW_HOURS} hours after delivery to check it. If you do nothing, it is accepted for you.</p>

      <h2>After you accept</h2>
      <p>An accepted order is final. There are two exceptions.</p>
      <ul>
        <li>A dispute for a serious problem: not as described, does not work, malware, or a copyright claim.</li>
        <li>A {BUGFIX_DAYS}-day bug-fix guarantee. The seller must fix faults that were in what they delivered. This is a fix, not a refund.</li>
      </ul>

      <h2 id="digital-products">Digital products (files, kits, plugins, scripts, automations)</h2>
      <p>
        A digital product is delivered the moment you pay: you get a download link and a licence key at once. Because you have the files,{' '}
        <b>changing your mind after you have downloaded them is not a reason for a refund</b>. This is also why the seller is only paid after the review time and the hold.
      </p>
      <ul>
        <li>
          <b>If something is wrong, tell the seller first.</b> Use the order chat. Most problems are fixed quickly, and the seller can send a new file.
        </li>
        <li>
          <b>If the product is not as described, does not work, contains harmful code or breaks somebody&apos;s copyright</b>, open a dispute while you are reviewing the order ({REVIEW_HOURS} hours)
          or in the {BUGFIX_DAYS} days after you accept. Add evidence such as screenshots, the steps you took and any error text. The seller can fix it first; if they cannot, you can be refunded.
        </li>
        <li>
          <b>Not a reason:</b> you bought the wrong thing, you no longer need it, it was harder to use than you expected but it works as described, or you did not read what it needs to run on the
          listing.
        </li>
        <li>Our records of the download (time, address and file fingerprint) are used as evidence in a dispute, by both sides.</li>
      </ul>

      <h2>Opening a dispute</h2>
      <p>
        Open a dispute during the review window or the bug-fix window, give a reason and add evidence such as screenshots. The seller replies within {CONFIG.dispute.sellerReplyHours} hours. We decide
        within {CONFIG.dispute.adminDecisionDays} days. The outcome can be a full refund, a partial refund, a request to the seller to fix the problem, or no refund. Payment for that order is held
        while we decide.
      </p>

      <h2>Your rights</h2>
      <p>Nothing here limits rights you have under the consumer law where you live, and we do not promise that refunds are never possible.</p>
      <p>
        See also the <Link href="/terms">terms of service</Link>.
      </p>
    </LegalPage>
  );
}
