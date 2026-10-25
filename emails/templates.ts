import { BRAND_NAME } from '../lib/brand';
import { BUGFIX_DAYS, CONFIG, REVIEW_HOURS } from '../lib/config';

/*
 * The words of every notification, in one place. Plain text for now (React Email templates can replace these without touching the callers).
 * Short, plain verbs. Never put a secret, a card detail or somebody else's private data in here.
 */
export type NotificationKind =
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
  | 'daily_report';

export type Payload = Record<string, string | number | boolean | null | undefined>;
const t = (v: unknown, fallback = 'your order') => (typeof v === 'string' && v ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : fallback);

export const TEMPLATES: Record<NotificationKind, (p: Payload) => { subject: string; text: string }> = {
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
    text: `The payment is held safely in escrow. The seller can start now, and delivery is due in ${t(p.days, `${CONFIG.delivery.minDays} to ${CONFIG.delivery.maxDays}`)} days.`,
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
  daily_report: (p) => ({
    subject: `Daily report for ${t(p.day, 'yesterday')}: ${t(p.visitors, '0')} visitors`,
    text: `${t(p.visitors, '0')} visitors (${t(p.repeat, '0')} came back), ${t(p.pages, '0')} pages opened, ${t(p.orders, '0')} orders. Most opened product: ${t(p.top, 'none yet')}. The full report is under Visitors in the admin dashboard.`,
  }),
};
