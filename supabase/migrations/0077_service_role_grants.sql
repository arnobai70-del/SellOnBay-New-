-- Fix: 0075 and 0076 closed their new tables to clients but never opened them to the server, so writes failed with "permission denied". Found by the real-database flow check.
-- requires: contact_messages, newsletter_subscribers (0075), beta_requests, beta_feedback (0076)
grant select, insert, update on contact_messages, newsletter_subscribers to service_role;
grant select, insert, update on beta_requests to service_role;
grant select, insert on beta_feedback to service_role;
