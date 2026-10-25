import Link from 'next/link';
import { CONFIG } from '@/lib/config';
import { LegalPage } from '@/components/LegalPage';
import { pageMetadata } from '@/lib/seo/pageMeta';

export const generateMetadata = () => pageMetadata('/privacy');

export default function Privacy() {
  return (
    <LegalPage path="/privacy" stamp="Last updated October 2026">
      <p>This explains what SellOnBay collects, why, and the choices you have.</p>

      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email and sign-in method.</li>
        <li>Order details: the site you bought, your domain, and the messages you send in an order chat.</li>
        <li>For sellers: payout details and the verification needed to pay you.</li>
        <li>Basic technical data such as device type and error logs, used to keep the service secure.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To run your orders, hold and release payments, and set up your domain.</li>
        <li>To keep the platform safe, including blocking contact details in chat and reviewing reports.</li>
        <li>To contact you about your account and orders.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>Only the providers needed to run the service, such as payments, domain registration and hosting. Sellers see what they need to deliver your order. We do not sell your data.</p>

      <h2 id="cookies">Cookies</h2>
      <p>
        We use only what the site needs to work: a sign-in session so you stay signed in, and a few choices kept in your browser (for example that you closed the cookie notice, or paused an
        animation). To stop abuse we also set a random device id cookie and keep a hashed form of it and of your connection address with the actions you take (sign up, order, list), for{' '}
        {CONFIG.limits.keepDays} days. When you accept an order we keep a record of the click (time, your connection address, your browser and the words you saw) as evidence in case of a dispute or a
        chargeback. To see how many people visit and which products and categories they open, we count page opens with a hashed form of your connection address and browser (no cookie, and the address
        itself is not kept) for {CONFIG.analytics.keepDays} days; a browser that sends Global Privacy Control or Do Not Track is not counted. The live chat on public pages is run by Tawk.to: it loads
        from their servers, sets its own cookies so a conversation carries on between pages, and what you type in it (and any name or email you give) goes to Tawk.to. If you choose &quot;Accept
        analytics&quot; in the cookie notice, we also load Google Analytics, which sets its own cookies and sends your page views (page address, browser, approximate location from your connection
        address) to Google so we can see which pages help; it is never loaded before you accept, or for a browser that sends Global Privacy Control or Do Not Track, and you can change your mind by
        clearing this site&apos;s data in your browser. We do not use advertising cookies.
      </p>

      <h2>Your choices</h2>
      <p>
        You can download a copy of your data and ask us to delete your account on the <Link href="/account/privacy">Your data</Link> page. Deleting removes your name, payout details, developer profile
        and notifications, and locks the sign-in. Payments, orders and accounting records are kept for the time the law requires (usually several years), without a link to your name. We cannot delete
        while an order, a dispute or a payout is open. You can also ask us to correct your data.
      </p>

      <h2>Security</h2>
      <p>Data is stored with access rules per account. Sellers and admins sign in with a code from an authenticator app.</p>
    </LegalPage>
  );
}
