import { BRAND_NAME } from '../lib/brand';
import { BUGFIX_DAYS, CONFIG, REVIEW_HOURS } from '../lib/config';
import { txLookup } from '../lib/i18n/tx';

/*
 * The words of every notification, in one place. Plain text for now (React Email templates can replace these without touching the callers).
 * Short, plain verbs. Never put a secret, a card detail or somebody else's private data in here.
 * Every sentence goes through tx() (lib/i18n/tx.ts), so the email reaches a person in the language saved on their account when that language is
 * published (lib/i18n/recipient.ts); English otherwise. Names, amounts and dates from the payload are filled in as they are, never translated.
 */
export type NotificationKind =
  | 'aff_qualified'
  | 'aff_commission'
  | 'aff_withdrawal'
  | 'sub_active'
  | 'sub_renewed'
  | 'sub_expiring'
  | 'beta_requested'
  | 'beta_approved'
  | 'beta_declined'
  | 'beta_feedback'
  | 'identity_checked'
  | 'order_funded'
  | 'order_due_soon'
  | 'order_delivered'
  | 'review_ending'
  | 'order_accepted'
  | 'order_overdue'
  | 'order_cancelled'
  | 'extra_work_request'
  | 'extra_work_funded'
  | 'dispute_opened'
  | 'dispute_reply'
  | 'dispute_decided'
  | 'payout_sent'
  | 'payout_details_changed'
  | 'listing_decision'
  | 'domain_expiring'
  | 'new_message'
  | 'chat_warning'
  | 'account_suspended'
  | 'repo_invite_resent'
  | 'repo_invite_expiring'
  | 'repo_invite_expired'
  | 'repo_invite_lapsed'
  | 'repo_revoke_request'
  | 'repo_revoke_ready'
  | 'repo_revoke_confirmed'
  | 'product_update'
  | 'version_decision'
  | 'version_review'
  | 'order_hold_alert'
  | 'order_hold_decided'
  | 'order_held'
  | 'abuse_alert'
  | 'admin_payout'
  | 'daily_report'
  | 'plan_changed'
  | 'plan_requested'
  | 'request_received'
  | 'request_update'
  | 'quote_issued'
  | 'quote_needs_super'
  | 'quote_accepted'
  | 'payment_submitted'
  | 'payment_reconciled'
  | 'payment_rejected'
  | 'release_waiting'
  | 'release_overdue'
  | 'files_released'
  | 'file_checked'
  | 'file_review_needed'
  | 'message_new'
  | 'revision_update'
  | 'refund_issued'
  | 'work_authorised'
  | 'delivery_returned';

export type Payload = Record<string, string | number | boolean | null | undefined>;
/* Turns an English sentence into the reader's language. English by default. */
export type Tx = (english: string, vars?: Record<string, string | number>) => string;
export const englishTx: Tx = (e, v) => txLookup(null, e, v);
type Mail = { subject: string; text: string };

/* A payload value as text, or the fallback. Never translated: names, amounts and dates stay as they were sent. */
const val = (v: unknown, fallback = ''): string => (typeof v === 'string' && v ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : fallback);

export const TEMPLATES: Record<NotificationKind, (p: Payload, tx?: Tx) => Mail> = {
  beta_requested: (p, tx = englishTx) => ({
    subject: tx("Request received, we'll review it shortly"),
    text: tx("We have your request for {title}. It is free during the beta and no payment is taken. We'll email you when it has been reviewed.", { title: val(p.title, tx('your order')) }),
  }),
  aff_qualified: (_p, tx = englishTx) => ({
    subject: tx('You are a SellOnBay Verified Affiliate'),
    text: tx('You reached the qualification target. Your green Verified Affiliate badge is on your affiliate dashboard.'),
  }),
  aff_commission: (p, tx = englishTx) => ({
    subject: tx('A commission of {amount} is approved', { amount: val(p.amount, tx('your order')) }),
    text: tx('The sale passed its refund period. The amount is now in your available balance on the affiliate dashboard.'),
  }),
  aff_withdrawal: (p, tx = englishTx) => ({
    subject: tx('Your withdrawal of {amount} is {status}', { amount: val(p.amount, tx('your order')), status: val(p.status, tx('your order')) }),
    text: val(p.note, tx('See the affiliate dashboard for details.')),
  }),
  sub_active: (p, tx = englishTx) => ({
    subject: tx('Your {title} subscription is active', { title: val(p.title, tx('your order')) }),
    text: tx('You can now choose {credits} websites with full source code. Open Subscription in your dashboard.', { credits: val(p.credits, tx('your order')) }),
  }),
  sub_renewed: (p, tx = englishTx) => ({
    subject: tx('Your {title} subscription is renewed', { title: val(p.title, tx('your order')) }),
    text: tx('Your licence and support for the websites you chose now run until {until}.', { until: val(p.until, tx('your order')) }),
  }),
  sub_expiring: (p, tx = englishTx) => ({
    subject: tx('Your {title} subscription ends soon', { title: val(p.title, tx('your order')) }),
    text: tx('It ends on {until}. Renew to keep the licence and free support for your chosen websites. Your sites keep running either way.', { until: val(p.until, tx('your order')) }),
  }),
  beta_approved: (p, tx = englishTx) => ({
    subject: tx('Your request for {title} is approved', { title: val(p.title, tx('your order')) }),
    text: tx('Your files are ready. Open the order in your dashboard to download them and to start your domain steps.'),
  }),
  beta_declined: (p, tx = englishTx) => ({
    subject: tx('About your request for {title}', { title: val(p.title, tx('your order')) }),
    text: tx('We could not approve this request. {reason}', { reason: val(p.reason, tx('your order')) }),
  }),
  identity_checked: (p, tx = englishTx) =>
    p.ok
      ? { subject: tx('Your identity is verified'), text: tx('Thank you. Your weekly payouts can now be sent.') }
      : {
          subject: tx('Your identity check needs another look'),
          text: tx('We could not accept the document: {reason}. Please send it again from Earnings & payouts.', { reason: val(p.reason, tx('it was not clear enough')) }),
        },
  beta_feedback: (p, tx = englishTx) => ({
    subject: tx('How is {title} working for you?', { title: val(p.title, tx('your order')) }),
    text: tx('It has been a week. Two minutes of feedback helps us a lot: {url}', { url: val(p.url, tx('your order')) }),
  }),
  repo_invite_resent: (p, tx = englishTx) => ({
    subject: tx('A new GitHub invite for {title}', { title: val(p.title, tx('your order')) }),
    text: tx('The seller sent your invite again. Accept it on GitHub within {days} days, then confirm in your order that you can open it.', { days: val(p.days, '7') }),
  }),
  repo_invite_expiring: (p, tx = englishTx) => ({
    subject: tx('Your GitHub invite for {title} runs out soon', { title: val(p.title, tx('your order')) }),
    text: tx('GitHub removes an invitation that is not accepted in time. Accept it now and confirm in your order. If it already ran out, ask the seller to send it again.'),
  }),
  repo_invite_expired: (p, tx = englishTx) => ({
    subject: tx('The GitHub invite for {title} has run out', { title: val(p.title, tx('your order')) }),
    text: tx('The buyer did not accept it in time. Send the invite again from your seller dashboard so the order can go on.'),
  }),
  repo_invite_lapsed: (p, tx = englishTx) => ({
    subject: tx('The GitHub invite for {title} has run out', { title: val(p.title, tx('your order')) }),
    text: tx('We asked the seller to send a new one. Accept it and confirm in your order. If you do not confirm, access counts as confirmed on {date} and your time to check it starts then.', {
      date: val(p.date, tx('your order')),
    }),
  }),
  repo_revoke_request: (p, tx = englishTx) => ({
    subject: tx('Remove the buyer from the repository: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('The order was {outcome}. Remove GitHub user {github} from your private repository, then press "I removed the access" on your seller dashboard. Our team then confirms it.', {
      outcome: val(p.outcome, tx('refunded')),
      github: val(p.github, tx('the buyer')),
    }),
  }),
  repo_revoke_ready: (p, tx = englishTx) => ({
    subject: tx('Repository access removal to confirm: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('The seller says the buyer was removed from the repository. Check it, then confirm in Repository access in the admin dashboard.'),
  }),
  repo_revoke_confirmed: (p, tx = englishTx) => ({
    subject: tx('Repository access removed: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('Our team confirmed that the buyer no longer has access to the repository for this order.'),
  }),
  product_update: (p, tx = englishTx) => ({
    subject: tx('A new version of {title} is ready', { title: val(p.title, tx('your product')) }),
    text: tx('Version {version} is out. What changed: {changelog}. Open your order and use "Get my files" to download it. Your updates run until {until}.', {
      version: val(p.version, tx('new')),
      changelog: val(p.changelog, tx('see your order')),
      until: val(p.until, tx('the end of your update period')),
    }),
  }),
  version_decision: (p, tx = englishTx) => {
    const vars = { version: val(p.version, tx('your order')), title: val(p.title, tx('your product')) };
    return p.decision === 'approved'
      ? { subject: tx('Version {version} of {title} is live', vars), text: tx('Buyers whose update period is still running have been told and can download it.') }
      : { subject: tx('Version {version} of {title} was not published', vars), text: val(p.note, tx('The version was not approved. Fix what the note says and publish it again.')) };
  },
  version_review: (p, tx = englishTx) => ({
    subject: tx('New version waiting for review: {title} {version}', { title: val(p.title, tx('a product')), version: val(p.version, '') }),
    text: tx('Open Versions in the admin dashboard, check the files, then approve or reject.'),
  }),
  order_held: (p, tx = englishTx) => ({
    subject: tx('Payment received for {title}, waiting for a short check', { title: val(p.title, tx('your order')) }),
    text: tx(
      'The payment is safe in escrow. Our team is doing a short safety check on this order before work starts. Please do not start yet. We will tell you as soon as it is cleared, and your delivery time starts again then.',
    ),
  }),
  order_hold_alert: (p, tx = englishTx) => ({
    subject: tx('Order waiting for a safety check: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('{reason} ({price} USD). Release or cancel it in Risk in the admin dashboard.', { reason: val(p.reason, tx('This order needs a look')), price: val(p.price, '0') }),
  }),
  order_hold_decided: (p, tx = englishTx) => {
    const title = val(p.title, tx('your order'));
    return p.decision === 'released'
      ? { subject: tx('{title} is cleared, you can start', { title }), text: tx('The safety check is done. You can start now. The delivery time you had left when the check began starts again now.') }
      : { subject: tx('{title} was cancelled after a safety check', { title }), text: tx('The buyer was refunded from escrow. You do not need to do anything for this order.') };
  },
  order_funded: (p, tx = englishTx) => ({
    subject: tx('Payment received for {title}', { title: val(p.title, tx('your order')) }),
    text:
      Number(p.hours) > 0
        ? tx('The payment is held safely in escrow. The seller can start now, and delivery is due in {hours} hours.', { hours: val(p.hours, tx('your order')) })
        : tx('The payment is held safely in escrow. The seller can start now, and delivery is due in {days} days.', {
            days: val(p.days, tx('{min} to {max}', { min: CONFIG.delivery.minDays, max: CONFIG.delivery.maxDays })),
          }),
  }),
  order_due_soon: (p, tx = englishTx) => ({
    subject: tx('Delivery of {title} is due soon', { title: val(p.title, tx('your order')) }),
    text: tx("This order is due within {hours} hours. Deliver it on time to keep the buyer's trust.", { hours: val(p.hours, '6') }),
  }),
  order_delivered: (p, tx = englishTx) => ({
    subject: tx('{title} is ready to review', { title: val(p.title, tx('your order')) }),
    text: tx('You have {hours} hours to check it. Accept it, or open a problem. If you do nothing it is accepted for you.', { hours: REVIEW_HOURS }),
  }),
  review_ending: (p, tx = englishTx) => ({
    subject: tx('Review time for {title} ends soon', { title: val(p.title, tx('your order')) }),
    text: tx('About {hours} hours are left. After that the order is accepted for you.', { hours: val(p.hours, '12') }),
  }),
  order_accepted: (p, tx = englishTx) => ({
    subject: tx('{title} was accepted', { title: val(p.title, tx('your order')) }),
    text: tx('Your earnings are paid out weekly, {holdDays} days after acceptance. The buyer has a {bugfixDays}-day bug-fix guarantee.', {
      holdDays: CONFIG.payout.holdDays,
      bugfixDays: BUGFIX_DAYS,
    }),
  }),
  order_overdue: (p, tx = englishTx) => ({
    subject: tx('{title} is late', { title: val(p.title, tx('your order')) }),
    text: tx('The delivery time has passed. The buyer can cancel for a full refund.'),
  }),
  order_cancelled: (p, tx = englishTx) => ({
    subject: tx('{title} was cancelled', { title: val(p.title, tx('your order')) }),
    text: tx('The order is closed. The money held in escrow goes back to the buyer.'),
  }),
  extra_work_request: (p, tx = englishTx) => ({
    subject: tx('Extra work for {title}: {request}', { title: val(p.title, tx('your order')), request: val(p.request, tx('a request')) }),
    text: tx('The seller asks for {price} and {days} more days. Approve and pay it into escrow, or decline. Nothing starts before it is paid.', {
      price: val(p.price, tx('more money')),
      days: val(p.days, '1'),
    }),
  }),
  extra_work_funded: (p, tx = englishTx) => ({
    subject: tx('Extra work paid for {title}', { title: val(p.title, tx('your order')) }),
    text: tx('The buyer paid {price} into escrow. The deadline moved out by {days} days. You can start.', { price: val(p.price, tx('the extra work')), days: val(p.days, '1') }),
  }),
  dispute_opened: (p, tx = englishTx) => ({
    subject: tx('A problem was reported on {title}', { title: val(p.title, tx('your order')) }),
    text: tx('Reason: {reason}. Payment for this order is held. The seller replies within {replyHours} hours and an admin decides within {decisionDays} days.', {
      reason: val(p.reason, tx('not given')),
      replyHours: CONFIG.dispute.sellerReplyHours,
      decisionDays: CONFIG.dispute.adminDecisionDays,
    }),
  }),
  dispute_reply: (p, tx = englishTx) => ({
    subject: tx('The seller replied on {title}', { title: val(p.title, tx('your order')) }),
    text: tx('Open the order to read the reply and add evidence if you need to.'),
  }),
  dispute_decided: (p, tx = englishTx) => ({
    subject: tx('Decision on {title}', { title: val(p.title, tx('your order')) }),
    text: tx('Decision: {decision}. {note}', { decision: val(p.decision, tx('made')), note: val(p.note, '') }).trim(),
  }),
  payout_sent: (p, tx = englishTx) => ({
    subject: tx('Your payout was sent'),
    text: tx('{amount} were sent with {method}. It can take a few days to show.', { amount: val(p.amount, tx('Your earnings')), method: val(p.method, tx('the payout method on your account')) }),
  }),
  payout_details_changed: (p, tx = englishTx) => ({
    subject: tx('Your payout details were changed'),
    text: tx('Your earnings will now be sent to: {now}. Before: {was}. If you did not do this, change your password and contact support at once.', {
      now: val(p.now, tx('the new account')),
      was: val(p.was, tx('none')),
    }),
  }),
  listing_decision: (p, tx = englishTx) => ({
    subject: tx('Your listing {name} was {decision}', { name: val(p.name, ''), decision: val(p.decision, tx('reviewed')) }),
    text: val(p.note, tx('Open your dashboard for details.')),
  }),
  domain_expiring: (p, tx = englishTx) => ({
    subject: tx('{domain} expires soon', { domain: val(p.domain, tx('Your domain')) }),
    text: tx('It expires on {date}. Renew it so your site stays online.', { date: val(p.date, tx('soon')) }),
  }),
  new_message: (p, tx = englishTx) => ({
    subject: tx('New message about {title}', { title: val(p.title, tx('your order')) }),
    text: tx('Open the order to read it and reply. Keep everything on the platform, it protects both of you.'),
  }),
  chat_warning: (_p, tx = englishTx) => ({
    subject: tx('A warning about your messages'),
    text: tx(
      'Some of your messages were blocked because they shared contact details or asked to pay outside {brand}. After {blocks} blocked messages in {days} days your account is suspended for a while. Keep everything on the platform, it protects both sides.',
      { brand: BRAND_NAME, blocks: CONFIG.chat.suspendAtBlocks, days: CONFIG.chat.windowDays },
    ),
  }),
  account_suspended: (p, tx = englishTx) => ({
    subject: tx('Your account is suspended for a while'),
    text: tx('Too many messages were blocked. You can use the account again after {until}. Contact support if you think this is a mistake.', { until: val(p.until, tx('a few days')) }),
  }),
  admin_payout: (p, tx = englishTx) => ({
    subject: tx('Payout: {what}', { what: val(p.what, tx('something to look at')) }),
    text: `${val(p.detail, tx('Open Payouts in the admin dashboard.'))}

${tx('All details are in the admin dashboard under Payouts.')}`,
  }),
  abuse_alert: (p, tx = englishTx) => ({
    subject: tx('Admin alert: {what}', { what: val(p.what, tx('something needs a look')) }),
    text: val(p.detail, tx('Open the admin dashboard.')),
  }),
  // ---- SellOnBay 2.0 (requests, quotations, payments, release, files, plans, messages) ----
  plan_changed: (p, tx = englishTx) => {
    const vars = { plan: val(p.plan, tx('your plan')), status: val(p.status, tx('updated')) };
    return {
      subject: tx('Your seller plan: {plan} is {status}', vars),
      text: tx('SellOnBay updated your seller plan ({plan}): it is now {status}. Open your seller dashboard for the details.', vars),
    };
  },
  plan_requested: (p, tx = englishTx) => ({
    subject: tx('Plan request from a seller: {plan}', { plan: val(p.plan, tx('a plan')) }),
    text: tx('A seller asked for the {plan} plan ({billing}). Send payment instructions and activate it under Sellers once Finance has reconciled the payment.', {
      plan: val(p.plan, ''),
      billing: val(p.billing, ''),
    }),
  }),
  request_received: (p, tx = englishTx) => ({
    subject: tx('We received your request for {title}', { title: val(p.title, tx('your order')) }),
    text: tx('SellOnBay will review your request and reply with a quotation or a question. Nothing is charged until you accept a quotation.'),
  }),
  request_update: (p, tx = englishTx) => ({
    subject: tx('Update on your request for {title}', { title: val(p.title, tx('your order')) }),
    text: tx('{note} Open your requests to see it.', { note: val(p.note, tx('There is an update on your request.')) }),
  }),
  quote_issued: (p, tx = englishTx) => ({
    subject: tx('Your quotation for {title} is ready', { title: val(p.title, tx('your order')) }),
    text: tx('SellOnBay sent you a quotation of {total}. It is valid until {until}. Review the terms and accept it to continue.', {
      total: val(p.total, tx('the agreed amount')),
      until: val(p.until, tx('the date shown')),
    }),
  }),
  quote_needs_super: (p, tx = englishTx) => ({
    subject: tx('Price change waiting for Super Admin: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('A quotation differs from the listed price ({listed} listed, {quoted} quoted). A Super Admin must approve it before it is sent.', {
      listed: val(p.listed, '?'),
      quoted: val(p.quoted, '?'),
    }),
  }),
  quote_accepted: (p, tx = englishTx) => ({
    subject: tx('Quotation accepted: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('The buyer accepted the quotation and an order was created. It waits for payment.'),
  }),
  payment_submitted: (p, tx = englishTx) => ({
    subject: tx('Payment to reconcile: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('A buyer reported a payment of {amount} by {method}. Check it against the funds actually received before marking it reconciled.', {
      amount: val(p.amount, '?'),
      method: val(p.method, tx('a manual method')),
    }),
  }),
  payment_reconciled: (p, tx = englishTx) => ({
    subject: tx('Payment received for {title}', { title: val(p.title, tx('your order')) }),
    text: tx('SellOnBay has confirmed your payment. Your order now waits for its files to be approved and released by our team.'),
  }),
  payment_rejected: (p, tx = englishTx) => ({
    subject: tx('We could not confirm your payment for {title}', { title: val(p.title, tx('your order')) }),
    text: tx('{reason} Open your order to see what to do next.', { reason: val(p.reason, tx('The payment could not be matched to funds received.')) }),
  }),
  release_waiting: (p, tx = englishTx) => ({
    subject: tx('Release waiting: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('Payment is verified and the files are ready. Approve or refuse the release by {due}.', { due: val(p.due, tx('the deadline shown')) }),
  }),
  release_overdue: (p, tx = englishTx) => ({
    subject: tx('Release overdue: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('This order has waited longer than the 12-hour release target. Nothing is released automatically; please decide now.'),
  }),
  files_released: (p, tx = englishTx) => ({
    subject: tx('Your files for {title} are ready', { title: val(p.title, tx('your order')) }),
    text: tx('SellOnBay approved the release. Your files, licence and documents are in your order. Download links expire after 24 hours; you can ask for a new one.'),
  }),
  file_checked: (p, tx = englishTx) => ({
    subject: tx('File check for {title}: {result}', { title: val(p.title, tx('your order')), result: val(p.result, tx('done')) }),
    text: tx('{note} Open your listing to see the details.', { note: val(p.note, tx('Your upload was checked.')) }),
  }),
  file_review_needed: (p, tx = englishTx) => ({
    subject: tx('File passed the automatic checks: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('An uploaded file passed archive, secret and malware checks and waits for human review in Catalog.'),
  }),
  message_new: (p, tx = englishTx) => ({
    subject: tx('New message about {title}', { title: val(p.title, tx('your order')) }),
    text: tx('You have a new message from SellOnBay. Open your messages to read it.'),
  }),
  revision_update: (p, tx = englishTx) => ({
    subject: tx('Revision update: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('{note} Open the order to see it.', { note: val(p.note, tx('There is an update on a revision.')) }),
  }),
  refund_issued: (p, tx = englishTx) => ({
    subject: tx('Refund for {title}', { title: val(p.title, tx('your order')) }),
    text: tx('SellOnBay refunded {amount}. {note}', { amount: val(p.amount, tx('your payment')), note: val(p.note, '') }).trim(),
  }),
  work_authorised: (p, tx = englishTx) => ({
    subject: tx('You can start: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('Payment is verified and SellOnBay authorised the work. Send your delivery through your seller dashboard; it is checked and released by our team.'),
  }),
  delivery_returned: (p, tx = englishTx) => ({
    subject: tx('Delivery returned: {title}', { title: val(p.title, tx('your order')) }),
    text: tx('{reason} Please fix it and send it again.', { reason: val(p.reason, tx('SellOnBay returned the delivery.')) }),
  }),
  daily_report: (p, tx = englishTx) => ({
    subject: tx('Daily report for {day}: {visitors} visitors', { day: val(p.day, tx('yesterday')), visitors: val(p.visitors, '0') }),
    text: tx('{visitors} visitors ({repeat} came back), {pages} pages opened, {orders} orders. Most opened product: {top}. The full report is under Visitors in the admin dashboard.', {
      visitors: val(p.visitors, '0'),
      repeat: val(p.repeat, '0'),
      pages: val(p.pages, '0'),
      orders: val(p.orders, '0'),
      top: val(p.top, tx('none yet')),
    }),
  }),
};
