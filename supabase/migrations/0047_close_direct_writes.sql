-- Abuse reports are written only by the server (lib/abuse.ts, with its limits and checks), so signed-in clients lose the direct insert from 0004.
revoke insert on abuse_reports from authenticated;
-- Reviews are read only by the server (lib/reviews.ts). The public read showed buyer_id and order_id, which let a seller find who wrote a review.
revoke select on reviews from anon, authenticated;
