/*
 * Words for the category pages (spec 12). Each page has its OWN text, written for what people in that field actually need, never one template with a
 * word swapped. A page only exists when it has at least three real products (MIN_PRODUCTS), so there are no thin pages; the sitemap follows the same rule.
 */
export const MIN_PRODUCTS = 3;

export type CategoryCopy = {
  slug: string;
  name: string; // the category name used by the catalogue ("Restaurants", "Figma kits")
  group: 'websites' | 'templates';
  title: string;
  description: string;
  h1: string;
  intro: string[];
  lookFor: string[];
  faq: [string, string][];
  /* Optional, for the template hubs (lib/seo/hubs.ts): where "see all" goes, and the crumb above the category. */
  shelfHref?: string;
  shelfName?: string;
  parent?: { name: string; href: string };
};

export const CATEGORIES: CategoryCopy[] = [
  {
    slug: 'restaurants',
    name: 'Restaurants',
    group: 'websites',
    title: 'Ready-made restaurant websites',
    description: 'Restaurant and cafe websites with menu, booking and gallery, live on your own domain in 1 to 7 days. Payment is held until you accept.',
    h1: 'Ready-made websites for restaurants and cafes',
    intro: [
      'A hungry visitor decides in a few seconds. The first thing they want is the menu and the price, then where you are and when you are open. The restaurant sites here put those three things on the first screen.',
      'Each one comes with a menu section you can edit, a table booking or order-ahead form, opening hours with a map, and a photo gallery. Pick one, give us your domain, and it is live in 1 to 7 days.',
    ],
    lookFor: ['A menu that is easy to change without a developer', 'Booking or ordering that sends you an email', 'Opening hours and a map that work on a phone', 'Photos that load fast'],
    faq: [
      ['Can I change the menu and prices myself?', 'Yes. The menu is plain text and images you replace, and the seller can show you how during setup.'],
      ['Does it take online orders or only table bookings?', 'Each listing says which it has. Table booking is included in most, and ordering can be added with a customisation.'],
      ['Will it work on my own domain?', 'Yes. You give us the domain, or buy one here, and the seller connects it for you.'],
    ],
  },
  {
    slug: 'health',
    name: 'Health',
    group: 'websites',
    title: 'Ready-made websites for clinics, salons and wellness',
    description: 'Websites for clinics, dentists, salons, gyms and wellness studios with online booking and service pages, live on your domain in 1 to 7 days.',
    h1: 'Ready-made websites for clinics, salons and wellness',
    intro: [
      'People choose a doctor, a dentist or a salon on trust. They look for who you are, what you offer, what it costs, and whether they can book without a phone call.',
      'These sites lead with appointment booking, a team and services page, and room for client reviews. They are written in calm, plain language, and they work on a phone, where most people book.',
    ],
    lookFor: ['Appointment booking with email reminders', 'A page for each service with prices', 'Team photos and short bios', 'A place for reviews, with respect for patient privacy'],
    faq: [
      ['Does it store patient information?', 'The booking form only collects what you ask for. If you handle medical records, keep them in a system made for that and tell your seller what you need.'],
      ['Can clients book themselves?', 'Yes, the booking section sends each request to your email, and some listings connect to a calendar tool.'],
      ['Can I show prices?', 'Yes. A services page with prices is part of every site in this group.'],
    ],
  },
  {
    slug: 'portfolios',
    name: 'Portfolios',
    group: 'websites',
    title: 'Ready-made portfolio websites',
    description: 'Portfolio websites for photographers, designers, writers and freelancers. Show your best work and get hired, live on your domain in 1 to 7 days.',
    h1: 'Ready-made portfolio websites for creative people',
    intro: [
      'A portfolio has one job: make a stranger want to hire you. Show your best eight pieces, say what you charge, and make contacting you easy. Everything else gets in the way.',
      'The portfolios here are built around a large gallery, a short story about you, and a hire-me page with your prices, so clients arrive with better questions.',
    ],
    lookFor: ['A gallery that shows your work large and loads quickly', 'A short about page with a real photo', 'A clear hire-me page with prices', 'A contact form that reaches you'],
    faq: [
      ['How many pieces should I show?', 'Eight to twelve of your best. Fewer strong pieces beat many average ones.'],
      ['Can I add new work later?', 'Yes. The gallery is images you swap, and the seller can show you how.'],
      ['Is it good for search?', 'The pages are plain and fast, which helps. Add a sentence about each piece so people can find you.'],
    ],
  },
  {
    slug: 'stores',
    name: 'Stores',
    group: 'websites',
    title: 'Ready-made online store websites',
    description: 'Small online stores with product pages, collections and shipping information, live on your own domain in 1 to 7 days. Start small and grow.',
    h1: 'Ready-made online stores',
    intro: [
      'Most new shops do not need a huge system. They need ten good products, clear photos, honest shipping and returns pages, and a simple way to pay. That is how the stores here start.',
      'Each one has product pages, collections, a basket and a shipping and returns page. You connect your payment and shipping, and the seller can help with that as part of setup.',
    ],
    lookFor: ['Product pages with several photos', 'Collections so people can browse', 'Clear shipping and returns information', 'A basket and a payment you connect yourself'],
    faq: [
      ['Which payment provider does it use?', 'Each listing says. You connect your own account, so the money goes straight to you.'],
      ['How many products can I add?', 'Start with ten and grow. The listing says how large it is built to go.'],
      ['Can the seller connect shipping for me?', 'Yes, choose the setup help option and say which carrier you use.'],
    ],
  },
  {
    slug: 'landing-pages',
    name: 'Landing pages',
    group: 'websites',
    title: 'Ready-made landing pages',
    description: 'One-page sites for launching a product, collecting sign-ups or promoting an event. Clear message, strong call to action, live in 1 to 7 days.',
    h1: 'Ready-made landing pages that turn visitors into sign-ups',
    intro: [
      'A landing page works when a visitor understands what it is, who it is for and what to do next, all in five seconds. Everything on the page should help with that.',
      'These pages have one clear promise at the top, three reasons to believe it, proof from real people, and one button. They are fast, they look right on a phone, and you can change the words yourself.',
    ],
    lookFor: ['A headline that says what you do and for whom', 'One main button, repeated', 'Proof: logos, numbers or short quotes', 'A form that sends sign-ups to your inbox'],
    faq: [
      ['Where do the sign-ups go?', 'To your email, and most listings can connect to a mailing list tool you already use.'],
      ['Can I run ads to it?', 'Yes. Keep one goal per page and send each ad to the page that matches it.'],
      ['How long does it take?', 'One to three days after you pay and give us your domain.'],
    ],
  },
  {
    slug: 'real-estate',
    name: 'Real estate',
    group: 'websites',
    title: 'Ready-made real estate websites',
    description: 'Websites for agents and landlords with listings, filters and viewing requests, live on your own domain in 1 to 7 days.',
    h1: 'Ready-made websites for real estate and rentals',
    intro: [
      'People search for a home by area, price and size. A property site that lets them filter on those three, and ask for a viewing in one tap, gets more enquiries than a page of photos.',
      'These sites have a listings page with filters, a page for each property, a viewing request form and a short neighbourhood guide that helps people find you through search.',
    ],
    lookFor: ['Filters for area, price and size', 'A page for each property with many photos', 'A viewing request form', 'Useful local pages that bring visitors from search'],
    faq: [
      ['Can I add and remove properties myself?', 'Yes, each property is a simple page you copy and edit.'],
      ['Does it show a map?', 'Most listings include a map for the office and for each property.'],
      ['Can it connect to my listing feed?', 'Ask the seller about customisation if you need to import listings automatically.'],
    ],
  },
  {
    slug: 'tools',
    name: 'Tools',
    group: 'websites',
    title: 'Ready-made small web tools and calculators',
    description: 'Small web tools, calculators and micro-apps you can put on your own domain in 1 to 7 days. See each one working before you buy.',
    h1: 'Ready-made small web tools and calculators',
    intro: [
      'A small tool that does one thing well, like a calculator, a converter or a quote builder, brings visitors back and gives you something to share. Building one from nothing is slow. Starting from a working one is not.',
      'Every tool here has a live demo you can try, a plain description of what it does, and the files come to you once your payment is held in escrow, so you can check them during your review.',
    ],
    lookFor: ['A demo you can use before you pay', 'One clear job, done well', 'Plain code you or a developer can change', 'A description of what is included'],
    faq: [
      ['Can I change how it looks and what it says?', 'Yes. The files are yours to edit on your own domain, within the licence on the listing.'],
      ['Does it need a server?', 'The listing says whether it runs in the browser only or needs hosting. Hosting is an optional extra.'],
      ['What if it does not work?', 'You have 48 hours to check it, and a dispute if it is not as described.'],
    ],
  },
  {
    slug: 'figma-ui-kits',
    name: 'Figma kits',
    group: 'templates',
    title: 'Figma UI kits and design templates',
    description: 'Figma UI kits, dashboards and design systems from independent designers. See the preview, get the file at once after payment, with a licence.',
    h1: 'Figma UI kits and design templates',
    intro: [
      'A good UI kit saves days of work: real components, sensible spacing, and a type and colour system you can change in one place. The kits here show their screens up front so you can judge them before you pay.',
      'You get the Figma file straight after your payment is held, a licence key, and 48 hours to check it. Each listing says what is inside: pages, components, styles and whether it uses auto layout and variables.',
    ],
    lookFor: ['Components with variants, not flat pictures', 'Auto layout and variables so it adapts', 'Light and dark versions', 'A clear licence for client work'],
    faq: [
      ['Can I use it for client projects?', 'It depends on the licence on the listing: single project or multi project. Read it before you buy.'],
      ['Does the file come at once?', 'Yes. A download link, valid for 24 hours and renewable, appears once your payment is in escrow.'],
      ['Can I ask the designer a question first?', 'Yes, every listing has an ask-the-seller box.'],
    ],
  },
  {
    slug: 'no-code-templates',
    name: 'No-code templates',
    group: 'templates',
    title: 'No-code templates for Notion, Webflow, Framer and more',
    description: 'No-code templates for Notion, Webflow, Framer, WordPress and Shopify. Preview first, files at once after payment, licence included.',
    h1: 'No-code templates for Notion, Webflow, Framer and more',
    intro: [
      'No-code tools let you build without a developer, but a blank canvas is slow. A template gives you a structure that already works, and you fill in your own words and pictures.',
      'These templates name the tool they are for, show a preview, and say what is included. You get the link or file once your payment is held, and 48 hours to check that it does what the listing says.',
    ],
    lookFor: ['The tool and version it is made for', 'A preview or view-only link', 'Setup notes, ideally with screenshots', 'Free fixes for a period after you buy'],
    faq: [
      ['Which tool is it for?', 'Each listing names it, for example Notion, Webflow, Framer, WordPress or Shopify.'],
      ['Do I need a paid plan of the tool?', "Sometimes. The listing says what you need, and prices are the tool maker's, not ours."],
      ['Is support included?', 'Many sellers include fixes for a month. It is on the listing.'],
    ],
  },
  {
    slug: 'plugins',
    name: 'Plugins',
    group: 'templates',
    title: 'Plugins and add-ons for WordPress, Shopify and more',
    description: 'Plugins and add-ons from independent developers. A working demo on every listing, files at once after payment, 48 hours to check.',
    h1: 'Plugins and add-ons',
    intro: [
      'A plugin runs on your site, so you should be able to see it work before you pay. Every plugin here has a demo link, and we read each listing before it goes live.',
      'You get the files straight after your payment is held in escrow, with a licence key, and 48 hours to try them. If something is harmful or does not work, you can open a dispute and the money stays held.',
    ],
    lookFor: ['A working demo, not only screenshots', 'The platform and versions it supports', 'A licence file and the third-party code it includes', 'A changelog and a way to get fixes'],
    faq: [
      ['Is it safe to install?', 'We check listings and the seller must declare what is inside, but no check is perfect. Try it on a copy of your site first, which you can do in your 48 hours.'],
      ['Will it work with my version?', 'The listing names the versions it was made for. Ask the seller if you are unsure.'],
      ['What if it breaks my site?', 'Open a dispute within the review window. Payment stays held while we decide.'],
    ],
  },
  {
    slug: 'scripts',
    name: 'Scripts',
    group: 'templates',
    title: 'Scripts and automation code',
    description: 'Ready-made scripts for scraping, reports, SEO checks and automation. See it run before you buy, get the code at once after payment.',
    h1: 'Scripts and automation code',
    intro: [
      'A script that works is worth hours of your time. The ones here come with a demo or a sample result so you can see what it does before you pay, and a plain list of what it needs to run.',
      'The code reaches you the moment your payment is held, through a private link and, for some, a repository invite. You have 48 hours to run it. Pasted passwords or keys are checked for before a listing goes live.',
    ],
    lookFor: ['A sample of the output, or a video of it running', 'The language, version and packages it needs', 'A readme with setup steps', 'No secrets or hidden network calls in the code'],
    faq: [
      ['Can I read the code before I run it?', 'Yes. You get the full source. Read it, and run it in a safe place first.'],
      ['Who owns the code?', 'The licence on the listing says: single project, multi project or full transfer.'],
      ['What if it does not do what the demo showed?', 'That is a not-as-described dispute. Payment is held until it is decided.'],
    ],
  },
  {
    slug: 'ai-automations',
    name: 'AI automations',
    group: 'templates',
    title: 'AI automations for n8n, Make and Zapier',
    description: 'Ready-made n8n, Make and Zapier workflows with AI steps: lead capture, reports, support and more. Demo included, import in minutes.',
    h1: 'AI automations for n8n, Make and Zapier',
    intro: [
      'An automation saves the same ten minutes every day. Building one means learning a tool, wiring steps, and fixing the one that always fails. These workflows are already wired, and you add your own keys.',
      'Each listing shows the workflow, names the tools it connects, and says which keys you need. You import the file, connect your accounts, and have 48 hours to check it runs.',
    ],
    lookFor: ['A picture or video of the whole workflow', 'The apps and keys it needs, listed', 'What happens when a step fails', 'The cost of the tools it uses, which is not ours to set'],
    faq: [
      ['Do I pay for the AI model separately?', 'Yes, with your own account. Use limits on your account so a mistake cannot cost much.'],
      ['Will it work in Make if it is for n8n?', 'No. Each workflow is made for one tool, named on the listing.'],
      ['Can the seller set it up for me?', 'Choose setup help and say which accounts you use. The seller works on it first.'],
    ],
  },
  {
    slug: 'ai-prompts',
    name: 'AI prompts',
    group: 'templates',
    title: 'AI prompt packs and image workflows',
    description: 'Prompt packs for ChatGPT and Midjourney, ComfyUI workflows and SEO writing frameworks, each with sample results you can judge before buying.',
    h1: 'AI prompt packs and image workflows',
    intro: [
      "A prompt pack is somebody else's hours of trial and error, written down. Image prompts that keep one style across a set, ComfyUI graphs already wired, writing frameworks for product pages and blog posts that rank.",
      'Every listing shows real outputs made with its prompts, and names the model and version it was tested on. Results change when a model is updated, so check the samples, then try the pack yourself within 48 hours of getting the files.',
    ],
    lookFor: [
      'Sample outputs made with these exact prompts',
      'The model and version they were tested on',
      'Notes on which words to change for your own use',
      'For ComfyUI: the custom nodes and model files it needs',
    ],
    faq: [
      ['Will I get the same images as the samples?', 'Close, not identical. Image models give a different result each time, and updates change them.'],
      ['Can I use what I make with them in paid work?', "The listing licence covers the prompts. What you make is also bound by the model provider's own rules."],
      ['Does a ComfyUI workflow include the model files?', 'No. It lists the models and nodes to download from their own sources.'],
    ],
  },
  {
    slug: 'video-templates',
    name: 'Video templates',
    group: 'templates',
    title: 'Video templates for Premiere Pro, After Effects and CapCut',
    description: 'Intros, outros, lower thirds and title packs for Premiere Pro, After Effects and CapCut. Watch the preview video first, edit text and colours.',
    h1: 'Video templates for Premiere Pro, After Effects and CapCut',
    intro: [
      'Motion design takes days to do well. A template gives you the animation already timed, and you change the words, colours and logo. Intros, outros, lower thirds, transitions and social media formats.',
      'Each listing has a preview video and says which app and version it opens in. Music and fonts often have their own licences: the seller lists what is included and what you must get yourself.',
    ],
    lookFor: ['A preview video of every scene', 'The app and the lowest version it opens in', 'Whether music and fonts are included, and on what licence', 'Sizes included: wide, square, upright'],
    faq: [
      ['Will an After Effects template open in Premiere Pro?', 'Only if the listing says so. Each template is made for the app it names.'],
      ['Is the music included?', 'Only when the listing says so and names its licence. Otherwise add your own.'],
      ['Do I need plugins?', 'The listing must name any paid plugin it needs. Ask the seller before buying if unsure.'],
    ],
  },
  {
    slug: 'chatbots',
    name: 'Chatbots',
    group: 'templates',
    title: 'Ready-made chatbots and support widgets',
    description: 'Chatbots and support widgets for your website, with a live demo. Answer common questions and capture leads, files at once after payment.',
    h1: 'Ready-made chatbots and support widgets',
    intro: [
      'A good chatbot answers the same five questions your customers always ask and hands the rest to you. A bad one annoys people. The chatbots here have a live demo so you can talk to them first.',
      'You get the widget code and setup notes the moment your payment is held. You bring your own answers, and the model account if the bot uses one, then check it all within 48 hours.',
    ],
    lookFor: ['A live demo you can chat with', 'How it hands over to a person', 'What data it stores and where', 'A simple way to edit its answers'],
    faq: [
      ['Does it use an AI model?', 'Some do. The listing says which, and the model account and its cost are yours.'],
      ['Where do the conversations go?', 'The listing says. Check it matches your privacy needs before you buy.'],
      ['Can I change what it says?', 'Yes. Answers are text you edit, and the seller can help with setup.'],
    ],
  },
  {
    slug: 'motion-graphics',
    name: 'Motion graphics',
    group: 'templates',
    title: 'Motion graphics: lower thirds, transitions and overlays',
    description: 'Lower thirds, transitions, overlays and animated elements for your video editor. Watch the preview first; the files arrive once payment is held.',
    h1: 'Motion graphics for your video projects',
    intro: [
      'Small moving pieces make a plain edit look finished: a name strip under a speaker, a clean cut between scenes, a light leak over a title. Packs here are made of those pieces, ready to drop onto your timeline.',
      'Every listing plays a preview so you see the movement before paying. It names the editor and version, the frame rates and sizes inside, and whether you can change colours and text without extra tools.',
    ],
    lookFor: ['A preview of every element in the pack', 'Editable colours and text', 'Frame rates and sizes included', 'Any third-party plugin named up front'],
    faq: [
      ['Which editor do these work in?', 'The one the listing names. A pack built for one editor does not always open in another.'],
      ['Can I change the colours?', 'Most packs let you; the listing says how, usually with a control in the effect panel.'],
      ['Do they come with sound?', 'Only if the listing says so, along with the licence for that sound.'],
    ],
  },
  {
    slug: 'stock-video',
    name: 'Stock video',
    group: 'templates',
    title: 'Stock video footage and clips',
    description: 'Stock video clips from independent filmmakers: nature, cities, people, business and backgrounds. Watch the preview, read the licence, then download.',
    h1: 'Stock video footage and clips',
    intro: [
      'Filming everything yourself is slow and costly. A good clip of a city at dusk or hands on a keyboard can fill the gap in an advert, a course or a social post in minutes.',
      'Each listing shows a watermarked preview and states the resolution, frame rate, length and codec. Clips with recognisable people or private places should come with releases; the seller says whether they do.',
    ],
    lookFor: [
      'Resolution, frame rate and length',
      'Model and property releases where people or places appear',
      'Whether colour grading is applied or flat',
      'A licence that covers your use, such as ads or client work',
    ],
    faq: [
      ['Can I use a clip in a paid advert?', 'Check the licence on the listing; it states commercial use and any limits.'],
      ['Is the preview the real quality?', 'The preview is smaller and marked. The file you download is the size the listing states.'],
      ['How big are the files?', 'The listing says. Very large originals may be split into parts.'],
    ],
  },
  {
    slug: 'music',
    name: 'Music',
    group: 'templates',
    title: 'Royalty-free music for videos, podcasts and apps',
    description: 'Music tracks for videos, podcasts, games and apps from independent composers. Listen first, see the licence, then get the files with a key.',
    h1: 'Music for videos, podcasts and apps',
    intro: [
      'The right track sets the mood before a word is spoken. Upbeat for a product launch, calm for a tutorial, tense for a trailer. Composers here sell finished tracks you can place under your own work.',
      'Listen to the preview, then read what the licence covers: online video, broadcast, games, client projects. Many tracks include shorter edits and loops so the music ends where your video ends.',
    ],
    lookFor: ['A full-length preview to listen to', 'Short edits and loops in the pack', 'Formats such as WAV and MP3', 'Whether the track is registered with a collecting society'],
    faq: [
      ['Will my video get a copyright claim?', 'Some tracks are registered with content ID systems. The listing must say so and how to clear a claim.'],
      ['Can I use it in a client project?', 'Only if the licence on the listing allows client work.'],
      ['Can I edit the track?', 'Yes, cutting and looping it for your project is normal; reselling it on its own is not.'],
    ],
  },
  {
    slug: 'sound-effects',
    name: 'Sound effects',
    group: 'templates',
    title: 'Sound effects for video, games and apps',
    description: 'Sound effects for video, games and apps: interface clicks, whooshes, nature, city and more. Listen first, then download with a licence key.',
    h1: 'Sound effects for video, games and apps',
    intro: [
      'A tap that clicks, a door that creaks, wind behind a drone shot: sound makes a picture feel real. Packs here gather effects by theme so you find a whole set that sounds alike.',
      'Each pack lists how many files it holds, the format and sample rate, and lets you hear a sample. Interface sounds for apps and games are kept short and clean so they work at low volume.',
    ],
    lookFor: ['Number of sounds and total length', 'Format and sample rate', 'Clean starts and ends with no noise', 'A licence that covers games or apps if you need it'],
    faq: [
      ['Can I put these in an app I sell?', 'Usually yes when they are part of your app, not sold on their own. The licence says.'],
      ['Are they mono or stereo?', 'The listing says; interface sounds are often mono.'],
      ['Can I change the pitch or length?', 'Yes, editing them for your own project is fine.'],
    ],
  },
  {
    slug: 'graphics',
    name: 'Graphics',
    group: 'templates',
    title: 'Graphics: icons, illustrations, textures and patterns',
    description: 'Icons, illustrations, textures, patterns and backgrounds from independent designers. See every item first; the files arrive once payment is held.',
    h1: 'Icons, illustrations, textures and patterns',
    intro: [
      'A consistent set of icons or a few strong illustrations can carry a whole website or deck. Drawing them yourself takes days; a ready set takes minutes to place and recolour.',
      'Listings show every item in the set and say which formats you get, such as SVG, PNG or the source file for your design app. Vector files scale to any size without going blurry.',
    ],
    lookFor: ['Every item shown in the preview', 'Vector formats for anything that must scale', 'One style across the whole set', 'Source files you can edit'],
    faq: [
      ['Can I change the colours?', 'With vector files, yes. Flat images can only be changed with an editor.'],
      ['Can I use them in a logo?', 'Many licences forbid that because a logo needs to be yours alone. Check the listing.'],
      ['Which apps open the files?', 'The listing names the formats and the apps they were made in.'],
    ],
  },
  {
    slug: 'design-add-ons',
    name: 'Add-ons',
    group: 'templates',
    title: 'Design add-ons: brushes, presets, actions and styles',
    description: 'Brushes, colour presets, actions, layer styles and palettes for your design and photo apps. See before-and-after examples, then download at once.',
    h1: 'Brushes, presets, actions and styles',
    intro: [
      'Add-ons speed up work you repeat. A preset gives every photo the same look in one click, an action runs twenty steps for you, a brush set paints texture you would never draw by hand.',
      'Each listing shows before-and-after examples and names the app and lowest version it installs in. Install notes come with the files, and the seller can help if something does not load.',
    ],
    lookFor: ['Before-and-after examples', 'The app and version it installs in', 'Install notes in the download', 'How many items are in the set'],
    faq: [
      ['Will this preset look the same on my photos?', 'It depends on your light and colours; the examples show its range.'],
      ['How do I install it?', 'The download includes steps for the app it is made for.'],
      ['Does it work on a tablet app?', 'Only if the listing names that app.'],
    ],
  },
  {
    slug: 'presentation-templates',
    name: 'Presentation templates',
    group: 'templates',
    title: 'Presentation templates for pitches, reports and classes',
    description: 'Slide templates for pitch decks, reports, lessons and marketing. See every slide first, then edit it in the app the listing names.',
    h1: 'Presentation templates for pitches, reports and classes',
    intro: [
      'People judge a talk by its slides before you speak. A clean template with charts, timelines and image layouts already set lets you spend your time on the story rather than on alignment.',
      'Listings show every slide and name the app it is built for. Good templates use master layouts, so changing a colour or font once updates the whole deck.',
    ],
    lookFor: ['Every slide shown in the preview', 'Master layouts and theme colours', 'Editable charts and icons', 'Wide and standard sizes'],
    faq: [
      ['Which app do I need?', 'The one named on the listing; some sets include versions for more than one app.'],
      ['Are the photos included?', 'Placeholder images are often not included; the listing says what you get.'],
      ['Can I use it for a client?', 'If the licence allows client work. Check before you buy.'],
    ],
  },
  {
    slug: 'print-templates',
    name: 'Print templates',
    group: 'templates',
    title: 'Print templates: flyers, brochures, cards and CVs',
    description: 'Flyers, brochures, business cards, menus and CVs set up for print. See the layout, check the sizes, and get the editable files at once.',
    h1: 'Flyers, brochures, cards and CVs ready to print',
    intro: [
      'Print forgives nothing: a margin too thin or a colour mode that is wrong shows up on paper. Templates here come set up for the printer, so your job is the words and pictures.',
      'Each listing states the paper sizes, bleed, colour mode and the app the file opens in. Text stays editable, and fonts are either included or named so you can get them.',
    ],
    lookFor: ['Paper sizes and bleed', 'Print colour mode', 'Editable text and named fonts', 'Both sides for cards and leaflets'],
    faq: [
      ['Can I send it straight to my printer?', 'After you add your content, yes; the file already has bleed and print colours.'],
      ['What if I do not have the fonts?', 'The listing names them and says whether they are free.'],
      ['Can I change the size?', 'Often, but the layout is designed for the sizes listed.'],
    ],
  },
  {
    slug: 'mockups',
    name: 'Mockups',
    group: 'templates',
    title: 'Mockups for products, devices, packaging and print',
    description: 'Phone, laptop, packaging, apparel and print mockups. Drop in your design and show it the way customers will see it. Files arrive at once.',
    h1: 'Mockups for products, devices and packaging',
    intro: [
      'A flat design is hard to sell. Placed on a phone in a hand, on a box on a shelf or on a shirt, it suddenly looks real. Mockups do that in a few clicks.',
      'Listings show the scenes, the size of the final image and how you place your design, usually with a smart layer. Shadows and light stay on top, so the result looks photographed.',
    ],
    lookFor: ['High final image size', 'Smart layers for placing your design', 'Separate shadows and background', 'The app it is made for'],
    faq: [
      ['How do I put my design in?', 'Open the marked layer, paste your design, save; the listing explains it.'],
      ['Can I change the background colour?', 'Most mockups keep the background on its own layer.'],
      ['Can I use the result in an advert?', 'Usually yes for your own products; read the licence.'],
    ],
  },
  {
    slug: 'social-media-templates',
    name: 'Social media templates',
    group: 'templates',
    title: 'Social media templates for posts, stories and covers',
    description: 'Post, story, reel cover and banner templates for your social channels. Keep one look across every post and edit it in minutes.',
    h1: 'Social media templates for posts and stories',
    intro: [
      'Posting every day is easier when the design is already decided. A set of matching posts, stories and covers keeps your page looking like one brand instead of a pile of one-offs.',
      'Listings show each layout in the sizes each network uses and name the app they open in. Swap in your photos, colours and words, then export.',
    ],
    lookFor: ['Sizes for each network you use', 'One style across the set', 'Editable text and colours', 'The app it opens in'],
    faq: [
      ['Which sizes are included?', 'The listing lists them, for example square posts and tall stories.'],
      ['Can I use it for several clients?', 'Only with a licence that allows client work.'],
      ['Are the photos included?', 'Usually not; they are placeholders for your own.'],
    ],
  },
  {
    slug: 'logo-templates',
    name: 'Logo templates',
    group: 'templates',
    title: 'Logo templates you can make your own',
    description: 'Editable logo templates for new businesses and side projects. Change the name, colours and font, and get vector files you can scale.',
    h1: 'Logo templates you can make your own',
    intro: [
      'A starting logo helps a new business look settled from day one. These templates are built so you change the name, colour and type and end up with a mark that fits you.',
      'Each listing shows the mark in colour and in one colour, says which fonts it uses and gives vector files. Because a template is sold to more than one buyer, it is a start, not a registered trademark.',
    ],
    lookFor: ['Vector files that scale', 'Versions for dark and light backgrounds', 'Named fonts you can get', 'A licence that explains trademark limits'],
    faq: [
      ['Can I register it as a trademark?', 'A template sold to many buyers usually cannot be registered. Ask the seller about an exclusive change.'],
      ['Can I change the shape?', 'Yes, the vector file lets you edit it.'],
      ['What if I need a fully original logo?', 'Hire a developer or designer for custom work, paid into escrow.'],
    ],
  },
  {
    slug: 'photos',
    name: 'Photos',
    group: 'templates',
    title: 'Stock photos for websites, ads and social posts',
    description: 'Photos from independent photographers for websites, adverts and social posts. See the image, check the releases and licence, then download.',
    h1: 'Stock photos for websites, ads and posts',
    intro: [
      'Real photos make a website feel lived in. A shot of a busy kitchen or a calm office tells visitors more than a paragraph. Photographers here sell sets and single images for that job.',
      'Each listing shows the photo with a mark, its size in pixels and whether people or private places in it have signed releases. Sets keep the same light and style across images.',
    ],
    lookFor: ['Full size in pixels', 'Model and property releases', 'A set with one consistent style', 'A licence that covers ads if you need it'],
    faq: [
      ['Can I use a photo on my product box?', 'Print on products sold to others often needs a wider licence; check the listing.'],
      ['Is the mark on the download?', 'No. The mark is only on the preview.'],
      ['Can I edit the photo?', 'Yes, cropping and colouring it for your own work is normal.'],
    ],
  },
  {
    slug: '3d-models',
    name: '3D models',
    group: 'templates',
    title: '3D models and scenes for design, games and renders',
    description: '3D models and scenes for renders, games and product shots. See the renders and polygon counts, then download in the formats listed.',
    h1: '3D models and scenes',
    intro: [
      'Modelling a chair or a car from scratch can take a day. A ready model lets you build a scene, a product shot or a game level in an afternoon.',
      'Listings show renders from several angles and state the formats, polygon count, textures and the app the scene was made in. Game-ready models say whether they are rigged and how light they are.',
    ],
    lookFor: ['Formats you can open', 'Polygon count and texture sizes', 'Rigging and animation if you need them', 'Renders from more than one angle'],
    faq: [
      ['Will it open in my 3D app?', 'If the listing includes a format your app reads. Common exchange formats are named.'],
      ['Are textures included?', 'The listing says, with their size.'],
      ['Can I use it in a game I sell?', 'Usually yes when it is part of your game; check the licence.'],
    ],
  },
  {
    slug: 'fonts',
    name: 'Fonts',
    group: 'templates',
    title: 'Fonts for brands, websites and print',
    description: 'Typefaces from independent type designers for brands, websites and print. See the full character set and licence, then install.',
    h1: 'Fonts for brands, websites and print',
    intro: [
      'Type sets the voice of a brand before anyone reads a word. A distinctive font for headings and a quiet one for text can make a small business look like a large one.',
      'Listings show the full character set, weights and languages covered, and say what the licence allows: desktop use, websites, apps or logos. Web use often needs its own licence.',
    ],
    lookFor: ['All weights and styles shown', 'Languages and characters covered', 'Web and app use in the licence', 'Installable formats for your computer'],
    faq: [
      ['Can I use it on my website?', 'Only if the licence includes web use; many desktop licences do not.'],
      ['Can I use it in a logo?', 'Most font licences allow it; the listing says.'],
      ['Does it support my language?', 'The listing shows the character set; check it before buying.'],
    ],
  },
];

export const categoryFor = (group: CategoryCopy['group'], slug: string) => CATEGORIES.find((c) => c.group === group && c.slug === slug);
