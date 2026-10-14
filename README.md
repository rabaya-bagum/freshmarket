# FreshMarket

Demo storefront for FreshMarket, a fresh-food grocery platform. Tracked in Jira project **GP**.

Live demo: https://claude.ai/artifact/Vubfe2xakH4KaGGF5Q8yyG

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

## Run it

Open `index.html` in a browser. No build step or server needed.

Demo login: `demo@freshmarket.ca` / `Fresh123`

Test cards: `4242 4242 4242 4242` approves, `4000 0000 0000 0002` is declined. Use any future expiry and any 3-digit code.

## Automated tests

Playwright tests cover GP-1 to GP-8, the store picker and Stripe payments: 97 functional tests and 16 visual tests, each run on desktop Chrome and a Pixel 7 phone size (226 checks). The payment server has 24 more unit tests.

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
| `api-tests/payments.test.js` | Server pricing and payment endpoints, with a fake Stripe client |
| `tests/visual.spec.ts` | Visual: home (light and dark), filters, product cards, search, product dialog, cart, sign-in, checkout steps, decline, confirmation |

Run locally:

```bash
npm install
npx playwright install chromium
npm test
npm run test:report   # open the HTML report
npm run lint          # check every test has an assertion
npm run test:api      # payment server unit tests
```

### Visual tests

Each visual test takes a screenshot and compares it with an approved baseline in `tests/visual.spec.ts-snapshots/`. If the page changes by more than 1% of pixels, the test fails and the HTML report shows the expected, actual and diff images.

- Baselines are created on the first GitHub Actions run and committed automatically.
- After an intended design change, open **Actions → Playwright tests → Run workflow**, tick **Approve new visual baselines**, and run it.
- Baselines are made in the official Playwright Docker image, so compare in CI rather than on your own computer (fonts differ between machines).

GitHub Actions runs the suite on every push, every pull request and daily at 6 am. Each run uploads the HTML report as a downloadable artifact.

## Demo limitations

Sample products and prices only. Login, Google sign-in and the cart run in the browser with no backend; no real orders or payments.

Checkout tests fix the clock to a Wednesday at 8 am Toronto time, so time slots are the same on every run.

## Next

Item substitution preferences (GP-9) and the store picking dashboard (GP-15) complete the order journey.
