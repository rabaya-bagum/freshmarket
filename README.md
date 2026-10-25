# FreshMarket

Demo storefront for FreshMarket, a fresh-food grocery platform. Tracked in Jira project **GP**.

Live site (Stripe test mode): https://freshmarket-gules.vercel.app

Claude demo (demo payments only): https://claude.ai/artifact/Vubfe2xakH4KaGGF5Q8yyG

## What's in this version

| Story | Feature |
|-------|---------|
| GP-1 | Account registration, sign-in, password reset, lockout after 5 failed attempts |
| GP-2 | Browse 7 departments with sort and filters (Ontario grown, organic, vegan, gluten-free, on sale) |
| GP-3 | Search with autocomplete and typo tolerance |
| GP-4 | Product page: per-kg pricing, nutrition facts, allergens, store stock |
| GP-5 | Cart with savings, estimated HST and free-delivery threshold |
| GP-6 | Delivery or curbside pickup, postal-code check per store, 7 days of 1-hour slots, 30-minute slot hold, $35 delivery minimum |
| GP-7 | Order review, card payment with validation, Apple Pay / Google Pay, decline handling, pre-authorization for items sold by weight |
| GP-8 | Order confirmation, status tracking with notifications, order history, receipts and reorder |

Sample data: 50 products across 7 departments, and 3 stores (Square One, Oakville Place, Liberty Village), each with its own stock, hours and delivery area.

## Real payments with Stripe

The checkout works in two modes:

- **Demo mode** (default): fake card form, no money moves. Used by the Claude demo link and GitHub Pages.
- **Stripe mode**: Stripe's secure payment form (cards, Apple Pay, Google Pay). Switches on automatically when the site runs on Vercel with Stripe keys set.

How it is built:

| File | Job |
|------|-----|
| `api/config.js` | `GET /api/config` tells the page whether Stripe is on, and shares only the publishable key |
| `api/create-payment-intent.js` | `POST /api/create-payment-intent` prices the order on the server and creates the Stripe payment |
| `api/_pricing.js` | Server-side prices, HST, delivery fee, minimum order and the 110% hold for items sold by weight |
| `data/prices.json` | The price list the server trusts. A test fails if it ever differs from the store page |

The browser only sends product IDs and quantities. The server works out the amount, so nobody can change what they pay. Card numbers go straight to Stripe and never touch this code. Orders with items sold by weight are authorized now and captured later (`capture_method: manual`).

### Turn it on (test mode)

1. Create a free Stripe account at https://dashboard.stripe.com/register and stay in **Test mode**.
2. In Stripe, open **Developers → API keys** and copy the publishable key (`pk_test_…`) and secret key (`sk_test_…`).
3. Import this repo at https://vercel.com/new (no build settings needed).
4. In Vercel, open **Settings → Environment Variables** and add:
   - `STRIPE_PUBLISHABLE_KEY` = `pk_test_…`
   - `STRIPE_SECRET_KEY` = `sk_test_…`
5. Redeploy. Checkout now shows Stripe's form. Pay with `4242 4242 4242 4242`, any future expiry, any 3 digits.
6. See test payments in Stripe under **Payments**.

Never put the secret key in code, in the README, or in a chat. It belongs only in Vercel's environment variables.

**Copy the whole key.** The Stripe dashboard shows keys shortened, like `pk_test_...JD7i`. That text is not the key. Use the copy button on **Developers → API keys** so you get the full value (about 100 characters). If a key is shortened or the two keys are from different modes, `/api/config` turns Stripe off, the checkout stays in demo mode, and the browser console says which key is wrong. After changing a key in Vercel, redeploy for it to take effect.

## Products API

Read-only endpoints that serve products from the same price list the payment server trusts (`data/prices.json`). They run as Vercel functions alongside the payment API.

The store loads every page of `/api/products` when it opens, and uses those names and prices. A product's other details (department, size, stock, nutrition, allergens) are still built into `index.html`, and a product without a server entry keeps its built-in name and price. If the API is not there (opened as a file, GitHub Pages, the Claude demo) or sends something that is not a product list, the store uses its built-in prices. If a server price is not below a product's old price, the sale badge is hidden.

| Endpoint | File | Returns |
|----------|------|---------|
| `GET /api/products?page=1&per_page=10` | `api/products/index.js` | One page of products, plus `page`, `per_page`, `total` and `total_pages` |
| `GET /api/products/:id` | `api/products/[id].js` | One product as `{ "data": { … } }` |

Each product looks like this:

```json
{ "id": 1, "name": "Honeycrisp Apples", "price": 2.99, "per": "lb", "sold_by_weight": true }
```

- `page` defaults to 1 and `per_page` to 10 (maximum 50). Both must be positive whole numbers, or the API answers `400`. A page past the end returns an empty `data` list, not an error.
- An id that is not a whole number (for example `/api/products/a`) gets a `500` server error. An id with no product gets `404`.
- Only `GET` is allowed. Other methods get `405`.
- Responses are cached for 60 seconds (`Cache-Control: public, max-age=60`).

## Run it

Open `index.html` in a browser. No build step or server needed.

Demo login: `demo@freshmarket.ca` / `Fresh123`

Test cards: `4242 4242 4242 4242` approves, `4000 0000 0000 0002` is declined. Use any future expiry and any 3-digit code.

## Pipeline

Every change goes through a pull request. Nothing reaches the live site unless all checks pass.

```
pull request ─► CI: Lint ─► Unit tests ─┬─► Browser tests       ─┐
                                        ├─► Visual tests        ─┤
                                        └─► Accessibility tests ─┴─► all green?
            ─► Vercel preview deploy ─► Smoke tests on the preview
merge to main (only when every required check is green)
            ─► Vercel production deploy ─► Smoke tests on production
daily       ─► full CI run at 6 am, smoke tests on production at 6:30 am
```

| Workflow | File | Runs | Checks |
|---|---|---|---|
| CI | `.github/workflows/ci.yml` | Every PR, every push to main, daily | **Lint**, **Unit tests**, **Browser tests**, **Visual tests**, **Accessibility tests** |
| Smoke | `.github/workflows/smoke.yml` | After every successful Vercel deploy (previews at their preview address, production at its public address `freshmarket-gules.vercel.app`), daily, or on demand. GitHub Pages deploys are skipped | Site loads with no script errors, Stripe config is valid and in test mode, the payment server prices orders and reaches Stripe, bad orders are rejected, cart totals, Stripe's card form loads |

Smoke tests live in `tests-smoke/` and run against a real address:

```bash
SMOKE_URL=https://freshmarket-gules.vercel.app npm run test:smoke
```

They never place an order. The payment check creates an unconfirmed test-mode PaymentIntent and refuses to run if the site is on live Stripe keys.

**Visual baselines** are only created or approved on branches, never on main. After an intended design change, run **Actions → CI → Run workflow** on your branch with **Approve new visual baselines** ticked; the new screenshots are committed to that branch and reviewed in the PR.

### Branch protection (one-time setup)

On GitHub: **Settings → Branches → Add branch ruleset** for `main`:
- Require a pull request before merging
- Require status checks to pass: `Lint`, `Unit tests`, `Browser tests`, `Visual tests`, `Accessibility tests`
- Block force pushes

If Vercel Deployment Protection is on for previews, create a **Protection Bypass for Automation** secret in Vercel (**Settings → Deployment Protection**) and save it in GitHub as the repository secret `VERCEL_AUTOMATION_BYPASS_SECRET`, so smoke tests can reach preview deploys.

## Automated tests

Playwright tests cover GP-1 to GP-8, the store picker, Stripe payments and loading products from the API: 165 functional tests and 16 visual tests, each run on desktop Chrome and a Pixel 7 phone size (362 checks). The server has 38 more unit tests: 29 for payments and 9 for the products API.

| File | Story |
|------|-------|
| `tests/auth.spec.ts` | GP-1 login, wrong password, lockout, sign-up, reset |
| `tests/browse.spec.ts` | GP-2 departments, filters, sorting, paging |
| `tests/search.spec.ts` | GP-3 autocomplete, typos, empty results |
| `tests/product.spec.ts` | GP-4 nutrition, per-kg price, stock states |
| `tests/cart.spec.ts` | GP-5 count, totals, savings, remove, stock cap |
| `tests/checkout.spec.ts` | GP-6 slots and delivery area, GP-7 payment and declines, GP-8 confirmation, tracking, history, reorder |
| `tests/stores.spec.ts` | Store picker, per-store stock, cart re-check on store change |
| `tests/stripe.spec.ts` | Stripe checkout with a stand-in Stripe.js: payment form, success, decline, server errors, price check, weighted-item hold, demo fallback |
| `tests/products-api.spec.ts` | Store loads names and prices from `/api/products` with a stand-in API: prices on cards and in the cart, sale badge, paging, fallback when the API is down or sends a non-list reply |
| `api-tests/payments.test.js` | Server pricing and payment endpoints, with a fake Stripe client |
| `api-tests/products.test.js` | Products API: paging, defaults, bad input, unknown ids, GET only |
| `tests/accessibility.spec.ts` | Accessibility: every screen scanned with axe-core against WCAG 2.1 AA in light and dark mode, plus keyboard-only shopping, focus handling, announcements and 200% zoom |
| `tests/visual.spec.ts` | Visual: home (light and dark), filters, product cards, search, product dialog, cart, sign-in, checkout steps, decline, confirmation |

Run locally:

```bash
npm install
npx playwright install chromium
npm test
npm run test:report   # open the HTML report
npm run lint          # check every test has an assertion
npm run test:api      # payment and products API unit tests
```

### Visual tests

Each visual test takes a screenshot and compares it with an approved baseline in `tests/visual.spec.ts-snapshots/`. If the page changes by more than 1% of pixels, the test fails and the HTML report shows the expected, actual and diff images.

- New baselines are created on the pull request branch and committed there automatically, so they are reviewed with the change.
- After an intended design change, open **Actions → CI → Run workflow** on your branch, tick **Approve new visual baselines**, and run it.
- Baselines are made in the official Playwright Docker image, so compare in CI rather than on your own computer (fonts differ between machines).

Each CI job uploads its HTML report as a downloadable artifact (`browser-report`, `visual-report`, `smoke-report`).

### Accessibility tests

`tests/accessibility.spec.ts` checks the store against **WCAG 2.1 level AA**, the standard behind Ontario's AODA.

- **Every screen is scanned with axe-core**, in light and dark mode, on desktop and phone: home, filters, all 50 products, cards with quantity controls, store switch, search suggestions, results and no results, product page (in stock and out of stock), empty and full cart, sign in, sign-in error, create account, reset password, account panel, checkout (delivery, errors, pickup), review and pay, declined card, order confirmation and order history.
- **Keyboard checks:** a skip link to the products, header tab order with a visible focus ring, dialogs that take focus, keep it inside and give it back on Escape, and a full keyboard-only journey from sign-in to payment.
- **Screen readers:** notifications use `role="status"`, errors use `role="alert"`, dialogs are `aria-modal`.
- **Zoom:** text at 200% causes no sideways scrolling.

Stripe's card form is a third-party frame, so it is left out of the scan. A failing scan lists each problem, the element, and how to fix it.

## Demo limitations

Sample products and prices only. Login, Google sign-in and the cart run in the browser with no backend; no real orders or payments.

Checkout tests fix the clock to a Wednesday at 8 am Toronto time, so time slots are the same on every run.

## Next

Item substitution preferences (GP-9) and the store picking dashboard (GP-15) complete the order journey.
