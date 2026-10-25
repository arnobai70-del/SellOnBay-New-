import { describe, expect, it } from 'vitest';
import { checkMessage, isBlocked } from '@/lib/chatFilter';

const reason = (t: string) => {
  const r = checkMessage(t);
  return r.ok ? null : r.reason;
};

describe('pre-sale messages: blocked', () => {
  const cases: [string, string][] = [
    ['write to me at john@example.com please', 'email'],
    ['john.smith+shop@mail.example.co.uk', 'email'],
    ['my mail is name at gmail dot com', 'email'],
    ['name (at) gmail (dot) com', 'email'],
    ['name[at]gmail[dot]com', 'email'],
    ['n a m e @ g m a i l . c o m', 'email'],
    ['name AT yahoo DOT com', 'email'],
    ['n​ame@gmail.com', 'email'],
    ['call me on +880 1712 345678', 'phone'],
    ['0171-234-5678', 'phone'],
    ['(555) 123 4567', 'phone'],
    ['five five five zero one two three', 'phone'],
    ['oh one seven one two three four five six', 'phone'],
    ['０１７１２３４５６７', 'phone'],
    ['add me on whatsapp', 'contact_channel'],
    ['WhatsApp me', 'contact_channel'],
    ['lets talk on telegram', 'contact_channel'],
    ['my skype is abc', 'contact_channel'],
    ['dm me on discord', 'contact_channel'],
    ['text me later', 'contact_channel'],
    ['check https://evil.example/pay', 'link'],
    ['go to www.example.com', 'link'],
    ['send it to my venmo', 'outside_payment'],
    ['i can pay you on paypal', 'outside_payment'],
    ['pay directly and skip the escrow', 'outside_payment'],
    ['we can do the deal outside the platform', 'outside_payment'],
    ['send bitcoin to my wallet', 'outside_payment'],
    ['bkash number please', 'outside_payment'],
    ['pay me via bank transfer', 'outside_payment'],
    ['can you do it cheaper without escrow', 'outside_payment'],
  ];
  it.each(cases)('blocks %s', (text, why) => {
    expect(reason(text)).toBe(why);
  });
});

describe('pre-sale messages: allowed', () => {
  const fine = [
    'Does it work with Node 20?',
    'Does the workflow connect to Gmail and Slack?',
    'Can I take payments with PayPal or Stripe on the finished site?',
    'The price is $29, is that one site or many?',
    'Does it support 2 or 3 domains?',
    'I have 12 products and 3 languages, will that fit?',
    'Is the Figma file updated for 2026?',
    'Released 2026-10-08, is that the latest version?',
    'What do I get in the zip file?',
    'Is there a 30 day fix guarantee?',
    'How long does setup take, about 2 hours?',
    'Can you add a dark theme? I would pay for that extra.',
    'Version 2.4.1 works on WordPress 6.5, correct?',
  ];
  it.each(fine)('allows %s', (text) => {
    expect(isBlocked(text)).toBe(false);
  });
});

describe('tricks that used to get through', () => {
  const cases: [string, string][] = [
    ['johnsmith99 at gmail', 'email'],
    ['john@gmail', 'email'],
    ['john [at] mysite [dot] com', 'email'],
    ['john@gmail[.]com', 'email'],
    ['john_at_gmail_dot_com', 'email'],
    ['my gmail: john', 'contact_channel'],
    ['jоhn@gmаil.com', 'email'], // Cyrillic о and а
    ['01712 three45678', 'phone'],
    ['tg: @john', 'contact_channel'],
    ['IG @john', 'contact_channel'],
    ['insta: john_99', 'contact_channel'],
    ['add me on wa', 'contact_channel'],
    ['message me on watsapp', 'contact_channel'],
    ['find me on tele gram', 'contact_channel'],
    ['lets chat on telegrm', 'contact_channel'],
    ['wаtsapp me', 'contact_channel'], // Cyrillic а
    ['bank transfer is cheaper', 'outside_payment'],
    ['i accept paypal', 'outside_payment'],
    ['use paypal instead', 'outside_payment'],
    ['payment via paypal', 'outside_payment'],
    ['paypal: john', 'outside_payment'],
    ['i can take crypto', 'outside_payment'],
    ['pay with ethereum', 'outside_payment'],
    ['btc wallet bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'outside_payment'],
    ['send to 0x52908400098527886e0f7030069857d2e4169ee7', 'outside_payment'],
    ['b.kash please', 'outside_payment'],
    ['b k a s h', 'outside_payment'],
    ['pay me back on whatsapp', 'outside_payment'],
  ];
  it.each(cases)('blocks %s', (text, why) => {
    expect(reason(text)).toBe(why);
  });
});

describe('normal project talk is not blocked', () => {
  const fine = [
    'Point the site at mybakery.com when it is ready',
    'Look at index.html for the menu',
    'I am at home now. The dot is red.',
    'Please add a WhatsApp button to the contact page',
    'Put the telegram link in the footer',
    'Show my Instagram feed on the home page',
    'Show my number in the header',
    'Call me Bob',
    'I build WhatsApp chatbots and Telegram bots',
    'The launch is on 12/10/2026 at 10:30',
    'We had 1,250,000 visitors last year',
    'The site should support bank transfer payments for my customers',
    'Does it work with Wise and Payoneer?',
    'Will you pay me back if it does not work?',
    'Can customers pay with PayPal on the checkout page?',
    'Connect my PayPal account to the store',
    'Can you log in at gmail and check the form emails arrive?',
    'Is that wise?',
  ];
  it.each(fine)('allows %s', (text) => {
    expect(isBlocked(text)).toBe(false);
  });
});

describe('more normal talk', () => {
  it.each([
    'Can the form email me the new orders?',
    'My email is set up already, the form can use it',
    'My WhatsApp is not connected to the chatbot yet',
    'My phone is an old Android, will the app run?',
  ])('allows %s', (text) => {
    expect(isBlocked(text)).toBe(false);
  });
  it.each([
    ['my number: 0171', 'contact_channel'],
    ['my whatsapp is john99', 'contact_channel'],
  ])('blocks %s', (text, why) => {
    expect(reason(text)).toBe(why);
  });
});
