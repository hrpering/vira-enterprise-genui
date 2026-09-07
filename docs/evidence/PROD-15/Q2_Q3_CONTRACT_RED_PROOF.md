# PROD-15 Q2/Q3 — Contract freeze and red proof

The frozen UI contract covers all named customer, builder and admin surfaces; role filtering; resilient states; exact evidence; desktop/mobile behavior; keyboard search; accessible drawer focus management; light/dark themes and reduced motion.

Red proof found and then closed these concrete failures:

- mobile tests accidentally selected WebKit although CI installs Chromium;
- duplicate heading selectors were ambiguous;
- table roles on interactive run buttons violated required child roles;
- decorative status dots used prohibited ARIA labels;
- Radix Tabs triggers lacked matching content panels;
- small light-theme evidence labels failed WCAG AA contrast;
- icon-only mobile search lacked a discernible accessible name.

The axe gate was not suppressed; semantics and color tokens were corrected.
