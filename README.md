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

## Run it

Open `index.html` in a browser. No build step or server needed.

Demo login: `demo@freshmarket.ca` / `Fresh123`

Test cards: `4242 4242 4242 4242` approves, `4000 0000 0000 0002` is declined. Use any future expiry and any 3-digit code.

## Automated tests

Playwright tests cover GP-1 to GP-8 and the store picker: 88 functional tests and 16 visual tests, each run on desktop Chrome and a Pixel 7 phone size (208 checks).

| File | Story |
|------|-------|
| `tests/auth.spec.ts` | GP-1 login, wrong password, lockout, sign-up, reset |
| `tests/browse.spec.ts` | GP-2 departments, filters, sorting, paging |
| `tests/search.spec.ts` | GP-3 autocomplete, typos, empty results |
| `tests/product.spec.ts` | GP-4 nutrition, per-kg price, stock states |
| `tests/cart.spec.ts` | GP-5 count, totals, savings, remove, stock cap |
| `tests/checkout.spec.ts` | GP-6 slots and delivery area, GP-7 payment and declines, GP-8 confirmation, tracking, history, reorder |
| `tests/stores.spec.ts` | Store picker, per-store stock, cart re-check on store change |
| `tests/visual.spec.ts` | Visual: home (light and dark), filters, product cards, search, product dialog, cart, sign-in, checkout steps, decline, confirmation |

Run locally:

```bash
npm install
npx playwright install chromium
npm test
npm run test:report   # open the HTML report
npm run lint          # check every test has an assertion
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
