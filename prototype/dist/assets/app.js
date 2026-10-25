/* Launchbay front-end: data, renderers, interactions (no dependencies) */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = n => '$' + n.toLocaleString('en-US');

const THEMES = {
  restaurant: { a:'#E4572E', b:'#FFD9A8', bg:'#FFF6EA', tx:'#2B1608', v:'v1', brand:'Saffron Table', h:'Dinner worth the wait', p:'Book a table and see tonight\'s menu.', cta:'Book now', nav:['Menu','Story','Visit'] },
  clinic:     { a:'#0E9F76', b:'#BFEBDD', bg:'#F2FBF8', tx:'#07271E', v:'v3', brand:'Clinic Desk', h:'Care that fits your day', p:'Pick a doctor and a time in two taps.', cta:'Book visit', nav:['Doctors','Services','Contact'] },
  portfolio:  { a:'#111111', b:'#EDEDED', bg:'#FFFFFF', tx:'#111111', v:'v2', brand:'Folio Studio', h:'Design that gets noticed', p:'Selected work from the last five years.', cta:'See work', nav:['Work','About','Hire me'] },
  store:      { a:'#2B3DFF', b:'#D6DCFF', bg:'#F4F6FF', tx:'#0F1330', v:'v4', brand:'Shopline', h:'New this season', p:'', cta:'Shop', nav:['Shop','Sale','Cart'] },
  saas:       { a:'#7A3CFF', b:'#E3D6FF', bg:'#14102B', tx:'#FFFFFF', v:'v1', brand:'Leadform', h:'Turn visitors into leads', p:'Forms, follow-ups and a waitlist in one page.', cta:'Join waitlist', nav:['Features','Pricing','Login'], dark:1 },
  estate:     { a:'#C2410C', b:'#FBD9C0', bg:'#FFF8F2', tx:'#2A1305', v:'v3', brand:'Brickwork', h:'Find a home you will love', p:'Browse listings and book a viewing.', cta:'View homes', nav:['Buy','Rent','Agents'] },
  gym:        { a:'#FFB52E', b:'#2B2F55', bg:'#0F1330', tx:'#FFFFFF', v:'v1', brand:'Ironclad Gym', h:'Train hard. Join today.', p:'Memberships, classes and trainers.', cta:'Join now', nav:['Classes','Trainers','Join'], dark:1, ac:'#0F1330' },
  tutor:      { a:'#F0476B', b:'#FFD3DC', bg:'#FFF5F7', tx:'#2D0A14', v:'v2', brand:'Tutorly', h:'Learn with a real tutor', p:'Book a lesson, pay once, start today.', cta:'Find a tutor', nav:['Subjects','Tutors','Login'] },
  pet:        { a:'#0891B2', b:'#C6EEF7', bg:'#F0FBFE', tx:'#07262E', v:'v3', brand:'Pawprint', h:'Happy pets, happy you', p:'Grooming and boarding, booked online.', cta:'Book a stay', nav:['Services','Prices','Book'] },
  tool:       { a:'#12B886', b:'#CBF3E5', bg:'#F4FCF9', tx:'#06281E', v:'v1', brand:'Invoicer', h:'Invoices in ten seconds', p:'Create, send and track payment.', cta:'Create invoice', nav:['Features','Pricing','Login'] },
  bio:        { a:'#FF5C7A', b:'#FFE0E6', bg:'#FFFFFF', tx:'#1A0A10', v:'v2', brand:'Bioboard', h:'All your links, one page', p:'A simple page for your profile.', cta:'Create yours', nav:['Home','Pricing','Login'] },
  quote:      { a:'#2563EB', b:'#D5E3FF', bg:'#F5F8FF', tx:'#0B1B3D', v:'v4', brand:'QuoteBot', h:'Quotes in minutes', p:'', cta:'Get a quote', nav:['How it works','Pricing','Login'] },
};

const PRODUCTS = [
  { id:'saffron-table', name:'Saffron Table', theme:'restaurant', cat:'Restaurants', price:39, seller:'Mira Chen', rating:4.8, reviews:112, sold:214, days:1, tag:'Menu, bookings', desc:'A warm restaurant site with a menu, photo gallery and a table booking form that emails you every request.', inc:['Home, menu, gallery and contact pages','Table booking form with email alerts','Google Maps and opening hours','Works on phones and tablets','Basic SEO and social preview','Editable from one settings file'] },
  { id:'clinic-desk', name:'Clinic Desk', theme:'clinic', cat:'Health', price:59, seller:'Arif Hossain', rating:4.9, reviews:87, sold:141, days:2, tag:'Appointments', desc:'A calm, trustworthy site for clinics and solo doctors with doctor profiles and online appointment requests.', inc:['Doctor profiles and service pages','Appointment request form','Patient privacy page','Opening hours and map','Works on every screen size','Fast load, good accessibility'] },
  { id:'folio-studio', name:'Folio Studio', theme:'portfolio', cat:'Portfolios', price:19, seller:'Noor Rahman', rating:4.7, reviews:203, sold:530, days:1, tag:'Designers, writers', desc:'A clean one-page portfolio for designers, photographers and writers. Add your work, change colours, publish.', inc:['Project grid with detail pages','About and contact sections','Dark and light mode','Contact form','Fast, lightweight pages','Simple content file'] },
  { id:'shopline', name:'Shopline', theme:'store', cat:'Stores', price:79, seller:'Tomás Rivera', rating:4.6, reviews:64, sold:98, days:3, tag:'Cart, checkout', desc:'A small online store with a product catalog, cart and checkout that connects to your payment account.', inc:['Product catalog and categories','Cart and checkout','Payment account connection','Order emails','Discount codes','Admin page for products'] },
  { id:'leadform', name:'Leadform', theme:'saas', cat:'Landing pages', price:29, seller:'Priya Nair', rating:4.8, reviews:149, sold:377, days:1, tag:'Waitlist', desc:'A sharp landing page for a new product with pricing, FAQ and a waitlist that saves every signup.', inc:['Hero, features, pricing and FAQ','Waitlist with email export','Analytics-ready','Dark theme','Sections you can reorder','Contact form'] },
  { id:'brickwork', name:'Brickwork', theme:'estate', cat:'Real estate', price:69, seller:'Samir Khan', rating:4.5, reviews:41, sold:73, days:3, tag:'Listings', desc:'Property listings with filters, photo galleries and a viewing request form for small agencies.', inc:['Listing pages with galleries','Search and filters','Viewing request form','Agent profiles','Map for each listing','Admin page for listings'] },
  { id:'ironclad', name:'Ironclad Gym', theme:'gym', cat:'Health', price:45, seller:'Leo Park', rating:4.7, reviews:58, sold:120, days:2, tag:'Memberships', desc:'A bold gym site with class timetable, trainer profiles and a membership sign-up form.', inc:['Class timetable','Trainer profiles','Membership plans','Sign-up form','Photo gallery','Instagram feed block'] },
  { id:'tutorly', name:'Tutorly', theme:'tutor', cat:'Landing pages', price:35, seller:'Hana Sato', rating:4.8, reviews:72, sold:166, days:2, tag:'Lessons', desc:'A friendly site for tutors and small schools with subject pages and lesson booking.', inc:['Subject and tutor pages','Lesson booking form','Pricing table','Reviews section','Blog starter','Contact form'] },
  { id:'pawprint', name:'Pawprint', theme:'pet', cat:'Landing pages', price:25, seller:'Mira Chen', rating:4.6, reviews:39, sold:88, days:1, tag:'Pet care', desc:'A cheerful site for groomers, sitters and vets with price list and booking requests.', inc:['Service and price pages','Booking request form','Gallery','Opening hours and map','Reviews section','Contact page'] },
  { id:'invoicer', name:'Invoicer', theme:'tool', cat:'Tools', price:49, seller:'Arif Hossain', rating:4.9, reviews:95, sold:210, days:3, tag:'Micro-SaaS', desc:'A tiny invoicing tool with client list, PDF invoices and payment status. Ready to run under your own domain.', inc:['Client list and invoice builder','PDF download','Paid and unpaid status','Email sending','Account sign-in','Simple settings page'] },
  { id:'bioboard', name:'Bioboard', theme:'bio', cat:'Tools', price:9, seller:'Noor Rahman', rating:4.4, reviews:301, sold:940, days:1, tag:'Link in bio', desc:'One page for all your links with themes, icons and click counts.', inc:['Unlimited links','Themes and icons','Click counts','Custom domain ready','Fast loading','Social preview image'] },
  { id:'quotebot', name:'QuoteBot', theme:'quote', cat:'Tools', price:55, seller:'Priya Nair', rating:4.7, reviews:33, sold:61, days:3, tag:'AI quotes', desc:'An AI quote generator for contractors. Customers describe the job and get a priced estimate you approve.', inc:['Customer request form','AI-written estimate drafts','You approve before sending','Price list settings','Email to customer','Admin view of requests'] },
];
const CATS = ['All','Restaurants','Health','Portfolios','Stores','Landing pages','Real estate','Tools'];

/* ---------- mini site renderer ---------- */
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function mini(key, o = {}) {
  const t = THEMES[key];
  const brand = esc(o.brand || t.brand);
  const style = `--a:${t.a};--b:${t.b};--bg:${t.bg};--tx:${t.tx};--ac:${t.ac||'#fff'}`;
  const tiles = t.v === 'v4' ? '<div class="m-art"></div><div class="m-art"></div><div class="m-art"></div><div class="m-art"></div><div class="m-art"></div><div class="m-art"></div>' : '<div class="m-art"></div>';
  return `<div class="mini ${t.v}${t.dark?' dark':''}" style="${style}">
    <div class="m-nav"><b>${brand}</b>${t.nav.slice(0,2).map(n=>`<em>${n}</em>`).join('')}<u>${t.cta}</u></div>
    <div class="m-hero"><div class="m-copy"><h4>${esc(o.h || t.h)}</h4><p>${esc(t.p)}</p><u>${t.cta}</u></div>${tiles}</div>
    <div class="m-row"><div></div><div></div><div></div></div></div>`;
}
function frame(key, o = {}) {
  const url = o.url || (THEMES[key].brand.toLowerCase().replace(/[^a-z]/g,'') + '.com');
  return `<div class="frame"><div class="frame-bar"><i></i><i></i><i></i><span>https://${esc(url)}</span></div><div class="screen">${mini(key,o)}</div></div>`;
}
function thumbS(key){ return `<div class="thumb-s"><div class="screen">${mini(key)}</div></div>`; }

function pcard(p) {
  return `<a class="pcard" href="product.html?id=${p.id}">
    ${frame(p.theme)}
    <div class="row"><h3>${p.name}</h3><span class="price">${money(p.price)}</span></div>
    <div class="meta"><span><span class="star">★</span> ${p.rating} (${p.reviews})</span><span>by ${p.seller}</span><span class="chip">${p.days === 1 ? '1 day' : '1-' + p.days + ' days'}</span></div>
  </a>`;
}

/* ---------- toast ---------- */
function toast(msg) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role','status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- shell ---------- */
$('.nav-toggle')?.addEventListener('click', () => { const n = $('.nav'); n.classList.toggle('open'); $('.nav-toggle').setAttribute('aria-expanded', n.classList.contains('open')); });
$('.menu-btn')?.addEventListener('click', () => $('.dash').classList.toggle('open'));

/* ---------- home ---------- */
if ($('[data-hero-demo]')) {
  const input = $('#hero-domain'), box = $('[data-hero-frame]');
  let theme = 'restaurant';
  const label = d => { const w = (d.split('.')[0] || 'your name').replace(/[-_]+/g,' ').trim(); return w.replace(/\b\w/g, c => c.toUpperCase()) || 'Your Name'; };
  const draw = () => { const d = (input.value.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'')) || 'yourdomain.com'; box.innerHTML = frame(theme, { brand: label(d), url: d }); };
  const chip = $('#live-chip'), chipText = chip && $('span', chip);
  const setTheme = t => { theme = t; $$('[data-theme-tab]').forEach(x => x.setAttribute('aria-pressed', x.dataset.themeTab === t)); };
  let auto = !matchMedia('(prefers-reduced-motion: reduce)').matches, timer;
  const stop = () => { if (!auto) return; auto = false; clearTimeout(timer); delete input.dataset.typing; if (chip) { chip.dataset.state = 'live'; chipText.textContent = 'Live on ' + (input.value.trim() || 'your domain'); } };
  input.addEventListener('input', () => { stop(); draw(); });
  input.addEventListener('focus', () => { const keep = input.value || SCRIPT[n][0]; stop(); input.value = keep; draw(); chipText.textContent = 'Live on ' + keep; });
  $$('[data-theme-tab]').forEach(b => b.addEventListener('click', () => { stop(); setTheme(b.dataset.themeTab); draw(); }));
  $('#hero-form').addEventListener('submit', e => { e.preventDefault(); location.href = 'browse.html?domain=' + encodeURIComponent(input.value.trim()); });
  draw();

  /* headline: words rise in once */
  const h1 = $('.hero h1');
  if (h1 && auto) h1.innerHTML = h1.textContent.trim().split(/\s+/).map((w, i) => `<span class="w"><i style="--i:${i}">${w}</i></span>`).join(' ');

  /* the demo types a domain, the site on the right follows, then it goes "live" */
  const SCRIPT = [['mariasbakery.com', 'restaurant'], ['alvarezdental.com', 'clinic'], ['noorrahman.design', 'portfolio'], ['harborshop.co', 'store'], ['forgefit.com', 'gym']];
  let n = 0;
  const wait = (ms, fn) => { timer = setTimeout(() => auto && fn(), ms); };
  const setChip = (state, txt) => { if (!chip) return; chip.dataset.state = state; chipText.textContent = txt; };
  const type = (text, i = 0) => {
    input.dataset.typing = '1'; input.value = text.slice(0, i); draw();
    if (i < text.length) return wait(70 + Math.random() * 60, () => type(text, i + 1));
    delete input.dataset.typing; setChip('live', 'Live on ' + text);
    wait(2600, erase);
  };
  const erase = () => {
    input.dataset.typing = '1'; setChip('work', 'Adding your domain');
    const step = () => { if (!input.value.length) { n = (n + 1) % SCRIPT.length; setTheme(SCRIPT[n][1]); draw(); return wait(350, () => type(SCRIPT[n][0])); } input.value = input.value.slice(0, -2); draw(); wait(28, step); };
    step();
  };
  if (auto) { setChip('work', 'Adding your domain'); wait(900, () => { input.value = ''; setTheme(SCRIPT[0][1]); type(SCRIPT[0][0]); }); }
  else setChip('live', 'Live on mariasbakery.com');
}
if ($('[data-fresh]')) $('[data-fresh]').innerHTML = PRODUCTS.slice(0, 6).map(pcard).join('');

/* seller calculator */
if ($('#calc')) {
  const r = $('#calc-range'), out = $('#calc-out'), pr = $('#calc-price'), sales = $('#calc-sales');
  const u = () => { const price = +r.value; pr.textContent = money(price); const n = +$('#calc-n').value; sales.textContent = n; out.textContent = money(Math.round(price * 0.85 * n)); };
  r.addEventListener('input', u); $('#calc-n').addEventListener('input', u); u();
}

/* ---------- browse ---------- */
if ($('[data-browse]')) {
  const q = $('#q'), sort = $('#sort'), pills = $('#cats'), grid = $('#results'), count = $('#count');
  let cat = new URLSearchParams(location.search).get('cat') || 'All';
  pills.innerHTML = CATS.map(c => `<button type="button" aria-pressed="${c === cat}">${c}</button>`).join('');
  const dom = new URLSearchParams(location.search).get('domain');
  if (dom) { const n = $('#dom-note'); n.hidden = false; n.querySelector('b').textContent = dom; }
  const draw = () => {
    let list = PRODUCTS.filter(p => (cat === 'All' || p.cat === cat) && (p.name + p.tag + p.cat + p.desc).toLowerCase().includes(q.value.toLowerCase()));
    const s = sort.value;
    list.sort((a, b) => s === 'low' ? a.price - b.price : s === 'high' ? b.price - a.price : s === 'sold' ? b.sold - a.sold : b.rating - a.rating);
    count.textContent = list.length + (list.length === 1 ? ' site' : ' sites');
    grid.innerHTML = list.length ? list.map(pcard).join('') : '<p class="empty" style="grid-column:1/-1">No sites match yet. Try another word or clear the category.</p>';
  };
  pills.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cat = b.textContent; $$('button', pills).forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  q.addEventListener('input', draw); sort.addEventListener('change', draw); draw();
}

/* ---------- product ---------- */
if ($('[data-pdp]')) {
  const id = new URLSearchParams(location.search).get('id') || 'saffron-table';
  const p = PRODUCTS.find(x => x.id === id) || PRODUCTS[0];
  document.title = p.name + ' · Launchbay';
  $('#p-crumb').textContent = p.name; $('#p-frame').innerHTML = frame(p.theme);
  $('#p-cat').textContent = p.cat; $('#p-name').textContent = p.name;
  $('#p-meta').innerHTML = `<span><span class="star">★</span> ${p.rating} (${p.reviews} reviews)</span><span>${p.sold} sold</span><span>by <b>${p.seller}</b></span>`;
  $('#p-desc').textContent = p.desc;
  $('#p-inc').innerHTML = p.inc.map(i => `<li>${i}</li>`).join('');
  $('#p-tags').innerHTML = [p.tag, p.cat, 'Built with AI', 'Checked by Launchbay'].map(t => `<span class="chip">${t}</span>`).join('');
  const base = p.price, setup = 30, custom = 100;
  $('#p-days').textContent = p.days === 1 ? '1 day' : '1 to ' + p.days + ' days';
  const upd = () => { const v = $('input[name=pkg]:checked').value; const add = v === 'setup' ? setup : v === 'custom' ? custom : 0; $('#p-price').textContent = money(base + add); $('#p-go').href = `checkout.html?id=${p.id}&pkg=${v}`; };
  $('#o-asis-p').textContent = money(base); $('#o-setup-p').textContent = '+' + money(setup); $('#o-custom-p').textContent = '+' + money(custom);
  $$('input[name=pkg]').forEach(i => i.addEventListener('change', upd)); upd();
  const more = PRODUCTS.filter(x => x.id !== p.id && x.cat === p.cat).concat(PRODUCTS.filter(x => x.id !== p.id && x.cat !== p.cat)).slice(0, 3);
  $('#p-more').innerHTML = more.map(pcard).join('');
}

/* ---------- checkout ---------- */
if ($('[data-checkout]')) {
  const sp = new URLSearchParams(location.search);
  const p = PRODUCTS.find(x => x.id === sp.get('id')) || PRODUCTS[0];
  const pkg = sp.get('pkg') || 'asis';
  const addPkg = pkg === 'setup' ? 30 : pkg === 'custom' ? 100 : 0;
  const state = { mode: 'own', domain: 0, ai: false, host: false };
  $('#c-thumb').innerHTML = frame(p.theme);
  $('#c-name').textContent = p.name;
  const tlds = [['.com', 14], ['.co', 29], ['.site', 6], ['.shop', 12], ['.online', 8]];
  const seg = $$('[data-mode]');
  const sum = () => {
    const lines = [[p.name + (pkg === 'asis' ? '' : pkg === 'setup' ? ' with setup help' : ' with customisation'), p.price + addPkg]];
    if (state.mode === 'new' && state.domain) lines.push(['Domain ' + state.domainName + ' (1 year)', state.domain]);
    if (state.ai) lines.push(['AI content and SEO', 3]);
    if (state.host) lines.push(['Managed hosting, first month', 4]);
    $('#c-lines').innerHTML = lines.map(l => `<div class="line"><span>${l[0]}</span><b>${money(l[1])}</b></div>`).join('');
    const total = lines.reduce((s, l) => s + l[1], 0);
    $('#c-total').textContent = money(total); $('#c-pay').textContent = 'Pay ' + money(total);
  };
  const domains = () => {
    const base = ($('#d-search').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'mybusiness');
    $('#d-list').innerHTML = tlds.map(([t, pr], i) => { const taken = (base.length < 5 && t === '.com'); return `<label class="${taken ? 'taken' : ''}"><input type="radio" name="dom" value="${i}" ${taken ? 'disabled' : ''}><b>${base}${t}</b>${taken ? '<em>Taken</em>' : `<em>${money(pr)}/yr</em>`}</label>`; }).join('');
    state.domain = 0; sum();
  };
  seg.forEach(b => b.addEventListener('click', () => { state.mode = b.dataset.mode; seg.forEach(x => x.setAttribute('aria-pressed', x === b)); $('#m-own').hidden = state.mode !== 'own'; $('#m-new').hidden = state.mode !== 'new'; sum(); }));
  $('#d-search').addEventListener('input', domains);
  $('#d-list').addEventListener('change', e => { const [t, pr] = tlds[+e.target.value]; state.domain = pr; state.domainName = ($('#d-search').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'mybusiness') + t; sum(); });
  $('#a-ai').addEventListener('change', e => { state.ai = e.target.checked; sum(); });
  $('#a-host').addEventListener('change', e => { state.host = e.target.checked; sum(); });
  $('#c-form').addEventListener('submit', e => {
    e.preventDefault();
    const d = state.mode === 'own' ? ($('#own-domain').value.trim() || 'yourdomain.com') : (state.domainName || 'your new domain');
    $('#c-main').innerHTML = `<div class="done"><span class="chip mint"><i></i>Payment held safely</span><h2 style="margin-top:16px">Order placed. We're setting up ${esc(d)}.</h2><p class="muted" style="margin-top:10px">Your seller has been told to start. Expect your site in ${p.days === 1 ? '1 day' : '1 to ' + p.days + ' days'}.</p>
    <ul class="tl"><li class="on"><b>Payment received</b><small>Held until you accept the site</small></li><li class="now"><b>Seller is setting up your site</b><small>Due within ${p.days === 1 ? '24 hours' : p.days * 24 + ' hours'}</small></li><li><b>You review and accept</b><small>You have 48 hours after delivery</small></li><li><b>Seller is paid</b><small>In the weekly payout, 7 days after you accept</small></li></ul>
    <div style="margin-top:28px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap"><a class="btn btn-blue" href="dashboard-buyer.html">Go to my orders</a><a class="btn btn-line" href="messages.html">Message the seller</a></div></div>`;
    $('#c-side').hidden = true; window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  domains(); sum();
}

/* ---------- sell ---------- */
if ($('[data-sell]')) {
  const r = $('#s-price'), u = () => { $('#s-price-v').textContent = money(+r.value); $('#s-you').textContent = money(+(r.value * .85).toFixed(2)); $('#s-fee').textContent = money(+(r.value * .15).toFixed(2)); };
  r.addEventListener('input', u); u();
  $('#s-form').addEventListener('submit', e => { e.preventDefault(); $('#s-form').innerHTML = `<div class="done"><span class="chip amber"><i></i>In review</span><h2 style="margin-top:14px">Submitted. We'll reply within 24 hours.</h2><p class="muted" style="margin-top:10px">We scan your files and check the demo. You'll get an email when the listing is live.</p><a class="btn btn-dark" style="margin-top:22px" href="dashboard-seller.html">Open seller dashboard</a></div>`; });
}

/* ---------- login ---------- */
if ($('[data-auth]')) {
  const seg = $$('[data-role]');
  seg.forEach(b => b.addEventListener('click', () => { seg.forEach(x => x.setAttribute('aria-pressed', x === b)); $('#auth-go').textContent = b.dataset.role === 'seller' ? 'Continue as seller' : 'Continue as buyer'; $('#auth-form').dataset.to = b.dataset.role === 'seller' ? 'dashboard-seller.html' : 'dashboard-buyer.html'; }));
  $('#auth-form').addEventListener('submit', e => { e.preventDefault(); location.href = e.target.dataset.to || 'dashboard-buyer.html'; });
}

/* ---------- dashboards ---------- */
function bars(el, data, fmt) {
  const max = Math.max(...data.map(d => d[1]));
  el.innerHTML = data.map(([l, v]) => `<div><b>${fmt(v)}</b><i style="height:${Math.max(4, v / max * 78)}%"></i><span>${l}</span></div>`).join('');
}
function spark(vals, color = '#2B3DFF') {
  const w = 120, h = 36, max = Math.max(...vals), min = Math.min(...vals);
  const pts = vals.map((v, i) => [i / (vals.length - 1) * w, h - 4 - (v - min) / (max - min || 1) * (h - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}L${w} ${h}L0 ${h}Z" fill="${color}" opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
$$('[data-spark]').forEach(el => el.innerHTML = spark(el.dataset.spark.split(',').map(Number), el.dataset.color || '#2B3DFF'));
$$('[data-thumb]').forEach(el => el.innerHTML = thumbS(el.dataset.thumb));
if ($('#earn-bars')) bars($('#earn-bars'), [['Aug 16', 180], ['Aug 23', 255], ['Aug 30', 210], ['Sep 6', 340], ['Sep 13', 295], ['Sep 20', 410], ['Sep 27', 385], ['Oct 4', 520]], v => '$' + v);
if ($('#vis-bars')) bars($('#vis-bars'), [['Mon', 82], ['Tue', 96], ['Wed', 74], ['Thu', 120], ['Fri', 143], ['Sat', 165], ['Sun', 131]], v => v);

$$('[data-accept]').forEach(b => b.addEventListener('click', () => {
  const tr = b.closest('tr, .q-item'); const st = $('[data-status]', tr);
  if (st) { st.className = 'chip mint'; st.innerHTML = '<i></i>Accepted'; }
  b.closest('td, .acts')?.replaceChildren(Object.assign(document.createElement('span'), { className: 'muted', textContent: 'Seller paid in next payout' }));
  toast('Accepted. Payment moves to the seller\'s pending balance.');
}));
$$('[data-action]').forEach(b => b.addEventListener('click', () => {
  const tr = b.closest('.q-item'); const msg = b.dataset.action;
  tr.style.opacity = '.45'; $$('button', tr).forEach(x => x.disabled = true); toast(msg);
}));
/* countdown timers */
$$('[data-due]').forEach(el => { let s = +el.dataset.due; const f = n => String(n).padStart(2, '0'); const t = () => { const h = Math.floor(s / 3600); el.textContent = `${f(h)}:${f(Math.floor(s % 3600 / 60))}:${f(s % 60)}`; if (s > 0) s--; }; t(); setInterval(t, 1000); });
$$('[data-tabs]').forEach(w => { const bs = $$('[role=tab]', w); bs.forEach(b => b.addEventListener('click', () => { bs.forEach(x => x.setAttribute('aria-selected', x === b)); $$('[data-pane]', w.parentElement).forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab); })); });

/* ---------- messages (off-platform filter + extra work requests) ---------- */
if ($('[data-chat]')) {
  const flow = $('#flow'), input = $('#msg');
  let role = 'buyer';
  const patterns = [/[\w.+-]+\s*(@|\[at\]|\(at\))\s*[\w-]+(\.|\s*dot\s*)\w+/i, /(\+?\d[\s\-().]*){8,}/, /\b(whats\s*app|telegram|signal|skype|gmail|hotmail|outlook|paypal|payoneer|bkash|wise\.com|venmo|cash\s*app)\b/i, /\b(pay|deal|talk|chat|contact)\s+(me\s+)?(outside|off\s*site|directly)\b/i, /\b(my\s+)?(email|e-mail|phone|number)\b.*\b(is|:)\b/i];
  const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const add = (txt, cls = '') => { const d = document.createElement('div'); d.className = 'bub ' + cls; d.innerHTML = txt + `<time>${time()}</time>`; flow.append(d); flow.scrollTop = flow.scrollHeight; return d; };
  const sys = t => { const d = document.createElement('div'); d.className = 'sys'; d.textContent = t; flow.append(d); flow.scrollTop = flow.scrollHeight; };

  /* extra work cards */
  const card = (title, price, days) => {
    const c = document.createElement('div'); c.className = 'xcard'; c.dataset.state = 'pending'; c.dataset.price = price; c.dataset.days = days;
    c.innerHTML = `<div class="xh"><b>Extra work request</b><span class="chip amber" data-s><i></i>Waiting for approval</span></div>
      <h4>${esc(title)}</h4>
      <dl class="xk"><dt>Extra price</dt><dd>${money(price)}</dd><dt>Adds to deadline</dt><dd>${days === 1 ? '1 day' : days + ' days'}</dd><dt>Paid from</dt><dd>Escrow, before work starts</dd></dl>
      <div class="xa"></div>`;
    flow.append(c); flow.scrollTop = flow.scrollHeight; paint(c); return c;
  };
  const paint = c => {
    const a = $('.xa', c), st = c.dataset.state;
    if (st === 'pending') {
      a.innerHTML = role === 'buyer'
        ? '<button class="btn btn-gold btn-sm" data-x="ok">Approve and pay into escrow</button><button class="btn btn-line btn-sm" data-x="no">Decline</button>'
        : '<span class="muted">Waiting for Maria to approve. No work until it is funded.</span>';
    } else a.innerHTML = '';
  };
  const decide = (c, ok) => {
    c.dataset.state = ok ? 'ok' : 'no';
    const s = $('[data-s]', c); s.className = 'chip ' + (ok ? 'mint' : 'rose'); s.innerHTML = '<i></i>' + (ok ? 'Approved and funded' : 'Declined');
    paint(c);
    sys(ok ? `${money(+c.dataset.price)} added to escrow. Deadline extended by ${c.dataset.days} day${c.dataset.days == 1 ? '' : 's'}.` : 'Request declined. Nothing was charged.');
    toast(ok ? 'Approved. The seller can start.' : 'Request declined.');
    refreshTracker();
  };
  const tracker = $('#xtrack');
  function refreshTracker() {
    if (!tracker) return;
    const cs = $$('.xcard', flow); tracker.hidden = !cs.length;
    $('#xlist').innerHTML = cs.map(c => { const st = c.dataset.state; return `<li><div class="grow"><b>${esc($('h4', c).textContent)}</b><small>${money(+c.dataset.price)} · +${c.dataset.days} day${c.dataset.days == 1 ? '' : 's'}</small></div><span class="chip ${st === 'ok' ? 'mint' : st === 'no' ? 'rose' : 'amber'}"><i></i>${st === 'ok' ? 'Funded' : st === 'no' ? 'Declined' : 'Pending'}</span></li>`; }).join('');
    const funded = cs.filter(c => c.dataset.state === 'ok').reduce((n, c) => n + +c.dataset.price, 0);
    $('#xsum').textContent = funded ? `${money(funded)} extra funded` : 'Nothing funded yet';
  }
  flow.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (b) decide(b.closest('.xcard'), b.dataset.x === 'ok'); });
  /* seed one pending request */
  card('Add an online ordering form to the menu page', 45, 1);

  /* role switch */
  $$('[data-chat-role]').forEach(b => b.addEventListener('click', () => {
    role = b.dataset.chatRole; $$('[data-chat-role]').forEach(x => x.setAttribute('aria-pressed', x === b));
    $('#xbtn').hidden = role !== 'seller'; $('#xform').hidden = true;
    $$('.xcard', flow).forEach(paint);
    $('#chat-who').innerHTML = role === 'buyer' ? '<b>Mira Chen</b><div class="muted" style="font-size:14px">Seller of Saffron Table</div>' : '<b>Maria Alvarez</b><div class="muted" style="font-size:14px">Buyer · mariasbakery.com</div>';
  }));
  $('#xbtn').addEventListener('click', () => { const f = $('#xform'); f.hidden = !f.hidden; if (!f.hidden) $('#x-title').focus(); });
  $('#xform').addEventListener('submit', e => {
    e.preventDefault();
    const t = $('#x-title').value.trim(), pr = Math.max(5, Math.round(+$('#x-price').value || 0)), d = +$('#x-days').value;
    if (patterns.some(r => r.test(t))) { add('<b>Request not sent.</b> Remove contact details or outside payment links from the description.', 'blocked'); return; }
    card(t, pr, d); sys('Mira sent an extra work request. Work starts after it is funded.'); e.target.reset(); e.target.hidden = true; refreshTracker();
  });
  refreshTracker();

  $('#send').addEventListener('submit', e => {
    e.preventDefault(); const v = input.value.trim(); if (!v) return;
    if (patterns.some(r => r.test(v))) { add('<b>Message not sent.</b> Contact details and outside payments aren\'t allowed. Keep chat and payment here so your money stays protected.', 'blocked'); }
    else { add(esc(v), 'me'); if (role === 'buyer') setTimeout(() => add('Sounds good. I\'ll update it today and send it for your review.'), 900); }
    input.value = '';
  });
  $$('.th').forEach(t => t.addEventListener('click', () => { $$('.th').forEach(x => x.removeAttribute('aria-current')); t.setAttribute('aria-current', 'true'); }));
  flow.scrollTop = flow.scrollHeight;
}
