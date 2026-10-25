import { LegalPage } from '@/components/LegalPage';
import { BUGFIX_DAYS, FEE_CUSTOM_TEXT, FEE_SALE_TEXT, PAYOUT_HOLD_DAYS, REVIEW_HOURS } from '@/lib/config';
import { pageMetadata } from '@/lib/seo/pageMeta';

export const generateMetadata = () => pageMetadata('/seller-agreement');

export default function SellerAgreement() {
  return (
    <LegalPage path="/seller-agreement">
      <h2>What you promise</h2>
      <ul>
        <li>You own what you list, or you have the right to sell it. Third-party code is declared with its licence.</li>
        <li>What you list matches the demo, the pictures and the description. You do not hide harmful code.</li>
        <li>You deliver in the number of days you chose on the listing.</li>
      </ul>

      <h2>Licences</h2>
      <p>You choose one licence for each product.</p>
      <ul>
        <li>Single project: the buyer uses it for one site or project, with no resale.</li>
        <li>Multi project: the buyer uses it for any number of their own projects, with no resale of the product itself.</li>
        <li>Full transfer: ownership of the product moves to the buyer and you stop selling it.</li>
      </ul>
      <p>The handover certificate is a record of what was delivered. This agreement decides which rights pass to the buyer.</p>

      <h2>Money</h2>
      <ul>
        <li>
          We keep {FEE_SALE_TEXT} of ready-made sales and {FEE_CUSTOM_TEXT} of custom, extra and trial work.
        </li>
        <li>The buyer&apos;s payment is held in escrow. After acceptance, earnings wait {PAYOUT_HOLD_DAYS} days and are paid out weekly.</li>
        <li>Orders in dispute are held. Refunds and fixes follow the outcome of the dispute.</li>
      </ul>

      <h2>After the sale</h2>
      <p>
        The buyer has {REVIEW_HOURS} hours to check the order and a {BUGFIX_DAYS}-day bug-fix guarantee after accepting. You fix faults that were in what you delivered. The files you upload are
        released to the buyer once the order is paid. Every download is logged.
      </p>

      <h2>Stock video, photos, music and fonts</h2>
      <p className="muted">[LAWYER REVIEW] Draft wording for stock media, added October 2026.</p>
      <ul>
        <li>Everything in your files is yours, or licensed to you in a way that lets you sell it on. That covers music, footage, photos, fonts, samples and any AI tool you used.</li>
        <li>Anyone who can be recognised in a photo or video has signed a model release. Private property, buildings that need permission, and artwork have a property release.</li>
        <li>You keep the releases and show them to us when asked, for example during a dispute or a copyright complaint.</li>
        <li>No logos, brands or trademarks that you do not own, unless the listing says the file is for editorial use only.</li>
        <li>If a release or licence turns out to be missing, we can pause the listing, refund the buyer and recover the money from your earnings.</li>
      </ul>

      <h2>App templates and store rules</h2>
      <p>Apple and Google can reject rebranded template apps. You tell the buyer about that risk before they order. Store approval is not part of the delivery time.</p>

      <h2>Keep it on the platform</h2>
      <p>No emails, phone numbers or outside payment. Accounts that repeat this are warned, then suspended.</p>
    </LegalPage>
  );
}
