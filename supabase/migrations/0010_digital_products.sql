-- Digital products (Figma kits, no-code templates, plugins, scripts, AI automations, chatbots) join the same shelf system.
alter table products drop constraint if exists products_platform_check;
alter table products add constraint products_platform_check check (platform in ('web', 'android', 'ios', 'webapp', 'desktop', 'digital'));
