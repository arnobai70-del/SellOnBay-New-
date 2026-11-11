import { BRAND_NAME } from '../lib/brand';
import { BUGFIX_DAYS, CONFIG, REVIEW_HOURS } from '../lib/config';

/*
 * The words of every notification, in one place. Plain text for now (React Email templates can replace these without touching the callers).
 * Short, plain verbs. Never put a secret, a card detail or somebody else's private data in here.
 */
export type NotificationKind =
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
const t = (v: unknown, fallback = 'your order') => (typeof v === 'string' && v ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : fallback);

export const TEMPLATES: Record<NotificationKind, (p: Payload) => { subject: string; text: string }> = {
  beta_requested: (p) => ({
    subject: "Request received, we'll review it shortly",
    text: `We have your request for ${t(p.title)}. It is free during the beta and no payment is taken. We'll email you when it has been reviewed.`,
  }),
  sub_active: (p) => ({ subject: `Your ${t(p.title)} subscription is active`, text: `You can now choose ${t(p.credits)} websites with full source code. Open Subscription in your dashboard.` }),
  sub_renewed: (p) => ({ subject: `Your ${t(p.title)} subscription is renewed`, text: `Your licence and support for the websites you chose now run until ${t(p.until)}.` }),
  sub_expiring: (p) => ({
    subject: `Your ${t(p.title)} subscription ends soon`,
    text: `It ends on ${t(p.until)}. Renew to keep the licence and free support for your chosen websites. Your sites keep running either way.`,
  }),
  beta_approved: (p) => ({ subject: `Your request for ${t(p.title)} is approved`, text: 'Your files are ready. Open the order in your dashboard to download them and to start your domain steps.' }),
  beta_declined: (p) => ({ subject: `About your request for ${t(p.title)}`, text: `We could not approve this request. ${t(p.reason)}` }),
  identity_checked: (p) =>
    p.ok
      ? { subject: 'Your identity is verified', text: 'Thank you. Your weekly payouts can now be sent.' }
      : { subject: 'Your identity check needs another look', text: `We could not accept the document: ${t(p.reason, 'it was not clear enough')}. Please send it again from Earnings & payouts.` },
  beta_feedback: (p) => ({ subject: `How is ${t(p.title)} working for you?`, text: `It has been a week. Two minutes of feedback helps us a lot: ${t(p.url)}` }),
  repo_invite_resent: (p) => ({
    subject: `A new GitHub invite for ${t(p.title)}`,
    text: `The seller sent your invite again. Accept it on GitHub within ${t(p.days, '7')} days, then confirm in your order that you can open it.`,
  }),
  repo_invite_expiring: (p) => ({
    subject: `Your GitHub invite for ${t(p.title)} runs out soon`,
    text: 'GitHub removes an invitation that is not accepted in time. Accept it now and confirm in your order. If it already ran out, ask the seller to send it again.',
  }),
  repo_invite_expired: (p) => ({
    subject: `The GitHub invite for ${t(p.title)} has run out`,
    text: 'The buyer did not accept it in time. Send the invite again from your seller dashboard so the order can go on.',
  }),
  repo_invite_lapsed: (p) => ({
    subject: `The GitHub invite for ${t(p.title)} has run out`,
    text: `We asked the seller to send a new one. Accept it and confirm in your order. If you do not confirm, access counts as confirmed on ${t(p.date)} and your time to check it starts then.`,
  }),
  repo_revoke_request: (p) => ({
    subject: `Remove the buyer from the repository: ${t(p.title)}`,
    text: `The order was ${t(p.outcome, 'refunded')}. Remove GitHub user ${t(p.github, 'the buyer')} from your private repository, then press "I removed the access" on your seller dashboard. Our team then confirms it.`,
  }),
  repo_revoke_ready: (p) => ({
    subject: `Repository access removal to confirm: ${t(p.title)}`,
    text: 'The seller says the buyer was removed from the repository. Check it, then confirm in Repository access in the admin dashboard.',
  }),
  repo_revoke_confirmed: (p) => ({ subject: `Repository access removed: ${t(p.title)}`, text: 'Our team confirmed that the buyer no longer has access to the repository for this order.' }),
  product_update: (p) => ({
    subject: `A new version of ${t(p.title, 'your product')} is ready`,
    text: `Version ${t(p.version, 'new')} is out. What changed: ${t(p.changelog, 'see your order')}. Open your order and use "Get my files" to download it. Your updates run until ${t(p.until, 'the end of your update period')}.`,
  }),
  version_decision: (p) => ({
    subject: p.decision === 'approved' ? `Version ${t(p.version)} of ${t(p.title, 'your product')} is live` : `Version ${t(p.version)} of ${t(p.title, 'your product')} was not published`,
    text:
      p.decision === 'approved'
        ? 'Buyers whose update period is still running have been told and can download it.'
        : t(p.note, 'The version was not approved. Fix what the note says and publish it again.'),
  }),
  version_review: (p) => ({
    subject: `New version waiting for review: ${t(p.title, 'a product')} ${t(p.version, '')}`,
    text: 'Open Versions in the admin dashboard, check the files, then approve or reject.',
  }),
  order_held: (p) => ({
    subject: `Payment received for ${t(p.title)}, waiting for a short check`,
    text: 'The payment is safe in escrow. Our team is doing a short safety check on this order before work starts. Please do not start yet. We will tell you as soon as it is cleared, and your delivery time starts again then.',
  }),
  order_hold_alert: (p) => ({
    subject: `Order waiting for a safety check: ${t(p.title)}`,
    text: `${t(p.reason, 'This order needs a look')} (${t(p.price, '0')} USD). Release or cancel it in Risk in the admin dashboard.`,
  }),
  order_hold_decided: (p) => ({
    subject: p.decision === 'released' ? `${t(p.title)} is cleared, you can start` : `${t(p.title)} was cancelled after a safety check`,
    text:
      p.decision === 'released'
        ? 'The safety check is done. You can start now. The delivery time you had left when the check began starts again now.'
        : 'The buyer was refunded from escrow. You do not need to do anything for this order.',
  }),
  order_funded: (p) => ({
    subject: `Payment received for ${t(p.title)}`,
    text: `The payment is held safely in escrow. The seller can start now, and delivery is due in ${Number(p.hours) > 0 ? `${t(p.hours)} hours` : `${t(p.days, `${CONFIG.delivery.minDays} to ${CONFIG.delivery.maxDays}`)} days`}.`,
  }),
  order_due_soon: (p) => ({ subject: `Delivery of ${t(p.title)} is due soon`, text: `This order is due within ${t(p.hours, '6')} hours. Deliver it on time to keep the buyer's trust.` }),
  order_delivered: (p) => ({
    subject: `${t(p.title)} is ready to review`,
    text: `You have ${REVIEW_HOURS} hours to check it. Accept it, or open a problem. If you do nothing it is accepted for you.`,
  }),
  review_ending: (p) => ({ subject: `Review time for ${t(p.title)} ends soon`, text: `About ${t(p.hours, '12')} hours are left. After that the order is accepted for you.` }),
  order_accepted: (p) => ({
    subject: `${t(p.title)} was accepted`,
    text: `Your earnings are paid out weekly, ${CONFIG.payout.holdDays} days after acceptance. The buyer has a ${BUGFIX_DAYS}-day bug-fix guarantee.`,
  }),
  order_overdue: (p) => ({ subject: `${t(p.title)} is late`, text: 'The delivery time has passed. The buyer can cancel for a full refund.' }),
  order_cancelled: (p) => ({ subject: `${t(p.title)} was cancelled`, text: 'The order is closed. The money held in escrow goes back to the buyer.' }),
  extra_work_request: (p) => ({
    subject: `Extra work for ${t(p.title)}: ${t(p.request, 'a request')}`,
    text: `The seller asks for ${t(p.price, 'more money')} and ${t(p.days, '1')} more days. Approve and pay it into escrow, or decline. Nothing starts before it is paid.`,
  }),
  extra_work_funded: (p) => ({
    subject: `Extra work paid for ${t(p.title)}`,
    text: `The buyer paid ${t(p.price, 'the extra work')} into escrow. The deadline moved out by ${t(p.days, '1')} days. You can start.`,
  }),
  dispute_opened: (p) => ({
    subject: `A problem was reported on ${t(p.title)}`,
    text: `Reason: ${t(p.reason, 'not given')}. Payment for this order is held. The seller replies within ${CONFIG.dispute.sellerReplyHours} hours and an admin decides within ${CONFIG.dispute.adminDecisionDays} days.`,
  }),
  dispute_reply: (p) => ({ subject: `The seller replied on ${t(p.title)}`, text: 'Open the order to read the reply and add evidence if you need to.' }),
  dispute_decided: (p) => ({ subject: `Decision on ${t(p.title)}`, text: `Decision: ${t(p.decision, 'made')}. ${t(p.note, '')}`.trim() }),
  payout_sent: (p) => ({
    subject: 'Your payout was sent',
    text: `${t(p.amount, 'Your earnings')} were sent with ${t(p.method, 'the payout method on your account')}. It can take a few days to show.`,
  }),
  payout_details_changed: (p) => ({
    subject: 'Your payout details were changed',
    text: `Your earnings will now be sent to: ${t(p.now, 'the new account')}. Before: ${t(p.was, 'none')}. If you did not do this, change your password and contact support at once.`,
  }),
  listing_decision: (p) => ({ subject: `Your listing ${t(p.name, '')} was ${t(p.decision, 'reviewed')}`, text: t(p.note, 'Open your dashboard for details.') }),
  domain_expiring: (p) => ({ subject: `${t(p.domain, 'Your domain')} expires soon`, text: `It expires on ${t(p.date, 'soon')}. Renew it so your site stays online.` }),
  new_message: (p) => ({ subject: `New message about ${t(p.title)}`, text: 'Open the order to read it and reply. Keep everything on the platform, it protects both of you.' }),
  chat_warning: () => ({
    subject: 'A warning about your messages',
    text: `Some of your messages were blocked because they shared contact details or asked to pay outside ${BRAND_NAME}. After ${CONFIG.chat.suspendAtBlocks} blocked messages in ${CONFIG.chat.windowDays} days your account is suspended for a while. Keep everything on the platform, it protects both sides.`,
  }),
  account_suspended: (p) => ({
    subject: 'Your account is suspended for a while',
    text: `Too many messages were blocked. You can use the account again after ${t(p.until, 'a few days')}. Contact support if you think this is a mistake.`,
  }),
  admin_payout: (p) => ({
    subject: `Payout: ${t(p.what, 'something to look at')}`,
    text: `${t(p.detail, 'Open Payouts in the admin dashboard.')}

All details are in the admin dashboard under Payouts.`,
  }),
  abuse_alert: (p) => ({ subject: `Admin alert: ${t(p.what, 'something needs a look')}`, text: t(p.detail, 'Open the admin dashboard.') }),
  // ---- SellOnBay 2.0 (requests, quotations, payments, release, files, plans, messages) ----
  plan_changed: (p) => ({
    subject: `Your seller plan: ${t(p.plan, 'your plan')} is ${t(p.status, 'updated')}`,
    text: `SellOnBay updated your seller plan (${t(p.plan, 'your plan')}): it is now ${t(p.status, 'updated')}. Open your seller dashboard for the details.`,
  }),
  plan_requested: (p) => ({
    subject: `Plan request from a seller: ${t(p.plan, 'a plan')}`,
    text: `A seller asked for the ${t(p.plan, '')} plan (${t(p.billing, '')}). Send payment instructions and activate it under Sellers once Finance has reconciled the payment.`,
  }),
  request_received: (p) => ({
    subject: `We received your request for ${t(p.title)}`,
    text: 'SellOnBay will review your request and reply with a quotation or a question. Nothing is charged until you accept a quotation.',
  }),
  request_update: (p) => ({
    subject: `Update on your request for ${t(p.title)}`,
    text: `${t(p.note, 'There is an update on your request.')} Open your requests to see it.`,
  }),
  quote_issued: (p) => ({
    subject: `Your quotation for ${t(p.title)} is ready`,
    text: `SellOnBay sent you a quotation of ${t(p.total, 'the agreed amount')}. It is valid until ${t(p.until, 'the date shown')}. Review the terms and accept it to continue.`,
  }),
  quote_needs_super: (p) => ({
    subject: `Price change waiting for Super Admin: ${t(p.title)}`,
    text: `A quotation differs from the listed price (${t(p.listed, '?')} listed, ${t(p.quoted, '?')} quoted). A Super Admin must approve it before it is sent.`,
  }),
  quote_accepted: (p) => ({
    subject: `Quotation accepted: ${t(p.title)}`,
    text: 'The buyer accepted the quotation and an order was created. It waits for payment.',
  }),
  payment_submitted: (p) => ({
    subject: `Payment to reconcile: ${t(p.title)}`,
    text: `A buyer reported a payment of ${t(p.amount, '?')} by ${t(p.method, 'a manual method')}. Check it against the funds actually received before marking it reconciled.`,
  }),
  payment_reconciled: (p) => ({
    subject: `Payment received for ${t(p.title)}`,
    text: 'SellOnBay has confirmed your payment. Your order now waits for its files to be approved and released by our team.',
  }),
  payment_rejected: (p) => ({
    subject: `We could not confirm your payment for ${t(p.title)}`,
    text: `${t(p.reason, 'The payment could not be matched to funds received.')} Open your order to see what to do next.`,
  }),
  release_waiting: (p) => ({
    subject: `Release waiting: ${t(p.title)}`,
    text: `Payment is verified and the files are ready. Approve or refuse the release by ${t(p.due, 'the deadline shown')}.`,
  }),
  release_overdue: (p) => ({
    subject: `Release overdue: ${t(p.title)}`,
    text: 'This order has waited longer than the 12-hour release target. Nothing is released automatically; please decide now.',
  }),
  files_released: (p) => ({
    subject: `Your files for ${t(p.title)} are ready`,
    text: 'SellOnBay approved the release. Your files, licence and documents are in your order. Download links expire after 24 hours; you can ask for a new one.',
  }),
  file_checked: (p) => ({
    subject: `File check for ${t(p.title)}: ${t(p.result, 'done')}`,
    text: `${t(p.note, 'Your upload was checked.')} Open your listing to see the details.`,
  }),
  file_review_needed: (p) => ({
    subject: `File passed the automatic checks: ${t(p.title)}`,
    text: 'An uploaded file passed archive, secret and malware checks and waits for human review in Catalog.',
  }),
  message_new: (p) => ({
    subject: `New message about ${t(p.title)}`,
    text: 'You have a new message from SellOnBay. Open your messages to read it.',
  }),
  revision_update: (p) => ({
    subject: `Revision update: ${t(p.title)}`,
    text: `${t(p.note, 'There is an update on a revision.')} Open the order to see it.`,
  }),
  refund_issued: (p) => ({
    subject: `Refund for ${t(p.title)}`,
    text: `SellOnBay refunded ${t(p.amount, 'your payment')}. ${t(p.note, '')}`.trim(),
  }),
  work_authorised: (p) => ({
    subject: `You can start: ${t(p.title)}`,
    text: 'Payment is verified and SellOnBay authorised the work. Send your delivery through your seller dashboard; it is checked and released by our team.',
  }),
  delivery_returned: (p) => ({
    subject: `Delivery returned: ${t(p.title)}`,
    text: `${t(p.reason, 'SellOnBay returned the delivery.')} Please fix it and send it again.`,
  }),
  daily_report: (p) => ({
    subject: `Daily report for ${t(p.day, 'yesterday')}: ${t(p.visitors, '0')} visitors`,
    text: `${t(p.visitors, '0')} visitors (${t(p.repeat, '0')} came back), ${t(p.pages, '0')} pages opened, ${t(p.orders, '0')} orders. Most opened product: ${t(p.top, 'none yet')}. The full report is under Visitors in the admin dashboard.`,
  }),
};
