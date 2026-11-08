-- Smart search (owner, 2026-11-08): full-text plus pg_trgm for any part of a word, any letter sequence and typos, weighted
-- title > category and stack > seller > description > tags. Server only: the functions are executed by the service role.
-- requires: products, seller_profiles
create extension if not exists pg_trgm with schema extensions;

create index if not exists products_name_trgm on products using gin (name extensions.gin_trgm_ops);
create index if not exists products_description_trgm on products using gin (description extensions.gin_trgm_ops);
create index if not exists products_search_fts on products using gin (
  (setweight(to_tsvector('simple', coalesce(name, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(category, '') || ' ' || coalesce(frontend, '') || ' ' || coalesce(backend_db, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(description, '')), 'D'))
);
create index if not exists seller_profiles_name_trgm on seller_profiles using gin ((coalesce(display_name, '') || ' ' || coalesce(username, '')) extensions.gin_trgm_ops);

-- Live listings ranked for a query. Returns slugs and scores; the app keeps only listings that are public.
create or replace function search_listings(p_q text, p_limit int default 50) returns table (slug text, score real)
language sql stable security definer set search_path = public, extensions as $$
  with q as (
    select lower(trim(p_q)) as s,
           replace(replace(replace(lower(trim(p_q)), '\', '\\'), '%', '\%'), '_', '\_') as e,
           nullif((select string_agg(w || ':*', ' & ') from regexp_split_to_table(lower(p_q), '[^a-z0-9]+') as w where w <> ''), '') as t
  ), d as (
    select p.slug, p.name, coalesce(p.category, '') as cat,
           coalesce(p.category, '') || ' ' || coalesce(p.frontend, '') || ' ' || coalesce(p.backend_db, '') as stack,
           coalesce(sp.display_name, '') || ' ' || coalesce(sp.username, '') as seller,
           coalesce(p.description, '') as descr,
           coalesce(array_to_string(p.tags, ' '), '') as tags,
           setweight(to_tsvector('simple', coalesce(p.name, '')), 'A')
             || setweight(to_tsvector('simple', coalesce(p.category, '') || ' ' || coalesce(p.frontend, '') || ' ' || coalesce(p.backend_db, '')), 'B')
             || setweight(to_tsvector('simple', coalesce(p.description, '')), 'D') as doc
    from products p left join seller_profiles sp on sp.user_id = p.seller_id
    where p.status = 'live'
  )
  select d.slug,
    (case when q.t is not null then ts_rank(d.doc, to_tsquery('simple', q.t)) * 2 else 0 end
     + greatest(similarity(d.name, q.s), word_similarity(q.s, d.name)) * 1.5
     + case when lower(d.name) like q.e || '%' then 1.2 when lower(d.name) like '%' || q.e || '%' then 0.8 else 0 end
     + case when d.stack ilike '%' || q.e || '%' then 0.6 else word_similarity(q.s, d.stack) * 0.4 end
     + case when d.seller ilike '%' || q.e || '%' then 0.4 else word_similarity(q.s, d.seller) * 0.25 end
     + case when d.descr ilike '%' || q.e || '%' then 0.25 else 0 end
     + case when d.tags ilike '%' || q.e || '%' then 0.1 else 0 end)::real as score
  from d, q
  where length(q.s) >= 2
    and ((q.t is not null and d.doc @@ to_tsquery('simple', q.t))
      or d.name ilike '%' || q.e || '%' or d.stack ilike '%' || q.e || '%' or d.seller ilike '%' || q.e || '%'
      or d.descr ilike '%' || q.e || '%' or d.tags ilike '%' || q.e || '%'
      or word_similarity(q.s, d.name) > 0.35 or similarity(d.name, q.s) > 0.25 or word_similarity(q.s, d.stack) > 0.45)
  order by score desc, d.slug
  limit least(greatest(p_limit, 1), 100);
$$;
revoke all on function search_listings(text, int) from public, anon, authenticated;
grant execute on function search_listings(text, int) to service_role;

-- Seller stores ranked for a query (name, store name, headline, skills).
create or replace function search_sellers(p_q text, p_limit int default 20) returns table (user_id uuid, score real)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select lower(trim(p_q)) as s, replace(replace(replace(lower(trim(p_q)), '\', '\\'), '%', '\%'), '_', '\_') as e)
  select sp.user_id,
    (greatest(similarity(coalesce(sp.display_name, '') || ' ' || coalesce(sp.username, ''), q.s), word_similarity(q.s, coalesce(sp.display_name, '') || ' ' || coalesce(sp.username, ''))) * 1.5
     + case when (coalesce(sp.display_name, '') || ' ' || coalesce(sp.username, '')) ilike '%' || q.e || '%' then 1 else 0 end
     + case when coalesce(sp.headline, '') || ' ' || coalesce(array_to_string(sp.skills, ' '), '') ilike '%' || q.e || '%' then 0.5 else 0 end)::real as score
  from seller_profiles sp, q
  where length(q.s) >= 2
    and ((coalesce(sp.display_name, '') || ' ' || coalesce(sp.username, '') || ' ' || coalesce(sp.headline, '') || ' ' || coalesce(array_to_string(sp.skills, ' '), '')) ilike '%' || q.e || '%'
      or word_similarity(q.s, coalesce(sp.display_name, '') || ' ' || coalesce(sp.username, '')) > 0.35)
  order by score desc
  limit least(greatest(p_limit, 1), 50);
$$;
revoke all on function search_sellers(text, int) from public, anon, authenticated;
grant execute on function search_sellers(text, int) to service_role;
