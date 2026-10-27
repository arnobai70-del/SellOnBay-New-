import { test } from '@playwright/test';

/*
 * Browser tests of behaviour that SellOnBay 2.0 retired on purpose. They are SKIPPED with this reason, never counted as passing:
 *   - instant checkout is closed (commit 2715e58): POST /api/demo/orders answers 410, so a demo order can no longer be bought, paid,
 *     delivered or accepted in the browser. Do not reopen it to make these pass (owner rule). The 2.0 chain is covered in process by
 *     tests/unit/sob2-chain.test.ts, release.test.ts, payments-manual.test.ts and revisions.test.ts; browser coverage of it needs staging
 *     accounts (BLOCKED).
 *   - new listings are websites only (13b98ae), so the digital-product listing checks have no form to run against.
 * Listed by file and exact title, found from the 2026-10-28 full run. Remove an entry when its test is rewritten for the 2.0 flow.
 */
const RETIRED: [string, string][] = [
  ['admin.spec.ts', 'the buyer reports a problem: reason and real detail needed, contact details refused, only while reviewing'],
  ['admin.spec.ts', 'opening one holds the order; a second is refused; the admin refunds; everything is in the history and the audit log'],
  ['admin.spec.ts', 'a full refund sends the order to refunded'],
  ['admin.spec.ts', 'an open dispute shows in the queue with its evidence and a decision form'],
  ['admin.spec.ts', 'the order page offers "Report a problem" while reviewing and shows the dispute afterwards'],
  ['consent.spec.ts', 'the box must be ticked: no body, false and a missing box are refused, the ticked box works once'],
  ['consent.spec.ts', 'on the order page the button waits for the box, then accepts'],
  ['consent.spec.ts', 'is a PDF for the buyer of a paid order, never for an unpaid or unknown one'],
  ['consent.spec.ts', 'the order page links to it'],
  ['extras.spec.ts', 'the order page shows the same, with the end date'],
  ['guard.spec.ts', 'a connection that creates too many orders is refused, another connection is not'],
  ['handover.spec.ts', 'a repository product needs a GitHub username'],
  ['handover.spec.ts', 'the demo seller invites on its own; the review starts only after the buyer confirms access'],
  ['handover.spec.ts', 'checkout asks for a GitHub username on a repository product only'],
  ['handover.spec.ts', 'a request, approve and pay into escrow, the deadline moves out; a declined one costs nothing'],
  ['handover.spec.ts', 'needs a funded order that is not yet accepted'],
  ['handover.spec.ts', 'the order page shows the request and its buttons'],
  ['handover.spec.ts', 'made when the order is accepted, a real PDF, once; none before'],
  ['handover.spec.ts', 'the order page offers the certificate once accepted'],
  ['handover.spec.ts', 'after the invite the buyer is told the date it runs out'],
  ['handover.spec.ts', 'a refund after the invite shows the buyer that the seller was asked to remove the access'],
  ['listing.spec.ts', 'empty form: clear list of what is missing, then a draft can still be saved'],
  ['listing.spec.ts', 'a script needs a demo link, and one more thing at a time disappears from the list'],
  ['listing.spec.ts', 'a complete listing is accepted'],
  ['orders.spec.ts', 'a new order waits for payment; nothing can move it before it is paid'],
  ['orders.spec.ts', 'a declined card changes nothing; a good card funds the order and logs it'],
  ['orders.spec.ts', 'funded, delivered, accepted: dates and history are right, wrong moves are refused'],
  ['orders.spec.ts', 'doing nothing for the review window accepts the order by itself, and the log says so'],
  ['orders.spec.ts', 'an as-is digital product is delivered the moment it is funded, and only then are the files available'],
  ['orders.spec.ts', 'a developer trial is an order of kind trial; a bad id or a made-up id is a plain 404'],
  ['orders.spec.ts', 'the order page shows the history and the state'],
  ['orders.spec.ts', 'an unsigned or wrongly signed webhook is refused before anything is read'],
  ['orders.spec.ts', 'a signed payment event funds the order once; the same event again does nothing; the wrong amount is refused'],
  ['orders.spec.ts', 'an overdue-style cancel: a buyer can cancel before paying, and an unpaid order cannot be cancelled twice'],
  ['refunds.spec.ts', 'the checkout of a digital product has the short line, a website does not'],
  ['refunds.spec.ts', 'the buy box shows the sellers prices for setup help and customisation (the defaults on a starter listing)'],
  ['reviews.spec.ts', 'only an accepted order can be reviewed; then one review, with the rating shown on the product page and in the structured data'],
  ['reviews.spec.ts', 'the order page offers the review form after acceptance'],
];
const KEYS = new Set(RETIRED.map(([f, t]) => f + '::' + t));
export function skipRetired(file: string) {
  test.beforeEach(({}, info) => {
    test.skip(
      KEYS.has(file + '::' + info.title),
      file === 'listing.spec.ts'
        ? 'Retired: new listings are websites only (13b98ae).'
        : 'Retired: instant checkout is closed in SellOnBay 2.0 (2715e58); covered by unit tests, browser coverage needs staging.',
    );
  });
}
