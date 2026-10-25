# FreshMarket

Demo storefront for FreshMarket, a fresh-food grocery platform. Tracked in Jira project **GP**.

Live site (Stripe test mode): https://freshmarket-gules.vercel.app

The store is a **React** app (built with Vite) backed by a **Node.js** server (Express) and a **Postgres** database.

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

## How it is built

```
Browser (React)  ──/api──►  Node server (Express)  ──►  Postgres
 src/                        server/                     products, stores, stock,
                             Stripe (payments)           accounts, carts, orders
                                                         (PGlite locally, e.g. Neon in production)
```

| Folder / file | Job |
|---------------|-----|
| `src/` | The React store: `App.jsx` (header, departments, filters, grid), `Dialogs.jsx` (cart, product, account, orders), `Checkout.jsx` (time slots and payment), `lib.js` (search, totals, slots), `focus.js` (keyboard focus in dialogs) |
| `server/app.js` | Every `/api` endpoint (listed below) |
| `server/pricing.js` | Prices, HST, delivery fee, minimum order and the 110% hold for items sold by weight |
| `server/catalog.js` | Reads products, stores and stock from the database, and fills an empty database from `data/` |
| `server/db.js` | The database tables, and the connection: Postgres when `DATABASE_URL` is set, otherwise PGlite |
| `server/security.js` | Password hashing (scrypt) and signed session cookies |
| `server/index.js` | Runs the whole app on your computer |
| `api/index.js` | Runs the server on Vercel |
| `data/products.json`, `data/stores.json` | Starting data only. The first time the server starts on an empty database, it copies them into the `products`, `stores` and `stock` tables |

What the server keeps:

- **The catalog.** Products, stores and the stock at each store live in the `products`, `stores` and `stock` tables. The store page loads them through the API, and orders are priced and checked from them. To change a price, the stock or a product, change the table (for example in Neon's SQL editor); the site follows within a minute (product answers are cached for 60 seconds). Editing `data/` afterwards changes nothing, because the tables are only filled once.

- **Accounts.** Passwords are stored as salted scrypt hashes, never as text. Signing in sets a session cookie that is signed by the server and hidden from page scripts (`HttpOnly`), and it lasts 30 days. After 5 wrong passwords the account locks until the password is reset, or for 15 minutes.
- **Carts.** While you are signed in, your cart is saved to your account, so it follows you to other devices. Anything you added before signing in joins the saved cart. A guest cart stays in the browser.
- **Orders.** The server prices every order itself, checks the store has the stock and delivers to that postal code, and numbers it (FM-1001, FM-1002, …).

The browser only sends product IDs and quantities, so nobody can change what they pay.

### API

| Endpoint | Does |
|----------|------|
| `GET /api/products?page=1&per_page=10` | One page of products (maximum 50 per page), with `page`, `per_page`, `total` and `total_pages` |
| `GET /api/products/:id` | One product. An id that is not a whole number (e.g. `/api/products/a`) gets a `500` server error; an unknown id gets `404` |
| `GET /api/stores` | The stores, with their address, closing time and delivery areas |
| `GET /api/config` | Whether Stripe is on. Shares only the publishable key |
| `POST /api/create-payment-intent` | Prices the order and creates the Stripe payment |
| `GET /api/session` | The signed-in shopper, their saved cart and their orders |
| `POST /api/auth/signin`, `/signup`, `/reset`, `/google`, `/signout` | Accounts. `google` is a demo stand-in that signs in a sample shopper |
| `PUT /api/cart` | Saves the signed-in shopper's cart |
| `POST /api/orders` | Places an order |
| `POST /api/orders/:number/advance` | Demo control: moves an order to its next status |
| `GET /api/debug/crash` | Your own computer only: a deliberate bug, answered with a `500` and its stack trace (see below) |

Each product has everything the store shows: name, department, size, price, sale price (`was`), unit for items sold by weight (`per`), tags, nutrition, allergens, and `stock` as one number per store. Product responses are cached for 60 seconds. Changes must be sent as JSON, which blocks forged requests from other sites.

## Run it

You need Node.js 20 or newer.

```bash
npm install
npm run dev        # the store with live reload, at http://localhost:3000
```

Or run it the way production does:

```bash
npm run build      # builds the React store into dist/
npm start          # serves dist/ and the API at http://localhost:3000
```

Without `DATABASE_URL`, the server uses PGlite, a Postgres that runs inside Node with nothing to install. Its data is kept in memory and is lost when the server stops. To keep it, set `DATA_DIR`, for example `DATA_DIR=.data npm start` (`.data/` is git-ignored).

Demo login: `demo@freshmarket.ca` / `Fresh123`. The demo account is created automatically.

**Seeing a server error.** On your own computer, any unexpected error answers `500` with its `type`, `message` and `stack` (the chain of function calls that led to it, the line that broke first). Open http://localhost:3000/api/debug/crash to see one: it reads a property of `undefined` on purpose. The same trace is printed in the terminal running the server. On the live site (`NODE_ENV=production`) the endpoint doesn't exist and errors say only "Something went wrong", because a stack trace shows file paths and code to anyone who asks. There, the trace goes only to Vercel's logs.

Test cards: `4242 4242 4242 4242` approves, `4000 0000 0000 0002` is declined. Use any future expiry and any 3-digit code.

Settings (environment variables):

| Variable | Needed | What it is |
|----------|--------|------------|
| `DATABASE_URL` | In production | A Postgres connection string, e.g. from Neon |
| `SESSION_SECRET` | In production | A long random string that signs session cookies. Without it, everyone is signed out whenever the server restarts |
| `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` | For real payments | See below |
| `PORT` | No | Port for `npm start` / `npm run dev` (default 3000) |
| `DATA_DIR` | No | Folder for the local PGlite database |

## Deploy on Vercel

Vercel builds the React store (`npm run build`) and runs the server as one function (`api/index.js`). `vercel.json` has the settings.

1. **Database.** In Vercel, open **Storage → Create Database → Neon (Postgres)** (the free plan is enough) and connect it to this project. That adds `DATABASE_URL`. The tables are created automatically on first use.
   Without a database the site still works, but accounts and orders are kept in the server's memory and disappear whenever Vercel restarts it.
2. **Session secret.** In **Settings → Environment Variables**, add `SESSION_SECRET` with a long random value. One way to make one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. **Stripe** (optional): see below.
4. Redeploy.

GitHub Pages and the Claude demo link can't run this version, because it needs the server. Turn GitHub Pages off in **Settings → Pages**.

## Real payments with Stripe

The checkout works in two modes:

- **Demo mode** (default): fake card form, no money moves.
- **Stripe mode**: Stripe's secure payment form (cards, Apple Pay, Google Pay). Switches on automatically when both Stripe keys are set.

In Stripe mode the server only accepts an order once Stripe confirms a payment for exactly that order's amount, and each payment can pay for only one order. Card numbers go straight to Stripe and never touch this code. Orders with items sold by weight are authorized now and captured later (`capture_method: manual`).

### Turn it on (test mode)

1. Create a free Stripe account at https://dashboard.stripe.com/register and stay in **Test mode**.
2. In Stripe, open **Developers → API keys** and copy the publishable key (`pk_test_…`) and secret key (`sk_test_…`).
3. In Vercel, open **Settings → Environment Variables** and add:
   - `STRIPE_PUBLISHABLE_KEY` = `pk_test_…`
   - `STRIPE_SECRET_KEY` = `sk_test_…`
4. Redeploy. Checkout now shows Stripe's form. Pay with `4242 4242 4242 4242`, any future expiry, any 3 digits.
5. See test payments in Stripe under **Payments**.

Never put the secret key in code, in the README, or in a chat. It belongs only in Vercel's environment variables.

**Copy the whole key.** The Stripe dashboard shows keys shortened, like `pk_test_...JD7i`. That text is not the key. Use the copy button on **Developers → API keys** so you get the full value (about 100 characters). If a key is shortened or the two keys are from different modes, `/api/config` turns Stripe off, the checkout stays in demo mode, and the browser console says which key is wrong. After changing a key in Vercel, redeploy for it to take effect.

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

Playwright tests cover GP-1 to GP-8, the store picker, Stripe payments and loading products from the server: 164 functional tests and 16 visual tests, each run on desktop Chrome and a Pixel 7 phone size (360 checks). They run against the real server with a fresh in-memory database. Every test's browser gets its own private accounts, carts and orders (`FM_SANDBOX=1`, test runs only), so tests running side by side never see each other's data. The server has 76 more unit tests.

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
| `tests/products-api.spec.ts` | Store loads its products from `/api/products` (with a stand-in API): names and prices on cards and in the cart, paging, and a clear message when the products can't load |
| `api-tests/payments.test.js` | Pricing, `/api/create-payment-intent` and `/api/config`, with a fake Stripe client |
| `api-tests/products.test.js` | Products API: paging, defaults, bad input, unknown ids (and the `500` for ids that aren't numbers), GET only |
| `api-tests/accounts.test.js` | Sign-in, sessions, lockout and reset, sign-up and verification, password hashing, saved carts, placing orders (pricing, stock, delivery area), order status, Stripe payment checks, and sandbox isolation |
| `api-tests/catalog.test.js` | The catalog in the database: a new database is filled once from `data/`, `/api/stores`, and a price, stock or product changed in the tables shows in the API and in orders |
| `api-tests/errors.test.js` | Unexpected errors: a `500` with its stack trace on your own computer, and with no details at all on the live site |
| `tests/accessibility.spec.ts` | Accessibility: every screen scanned with axe-core against WCAG 2.1 AA in light and dark mode, plus keyboard-only shopping, focus handling, announcements and 200% zoom |
| `tests/visual.spec.ts` | Visual: home (light and dark), filters, product cards, search, product dialog, cart, sign-in, checkout steps, decline, confirmation |

Run locally:

```bash
npm install
npx playwright install chromium
npm test
npm run test:report   # open the HTML report
npm run lint          # lint the app, the server and the tests (every test must have an assertion)
npm run test:api      # server unit tests
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

Sample products and prices only. No emails or text messages are sent (verification, password reset and status updates are simulated), "Continue with Google" signs in a sample shopper, and stock is not reduced when orders are placed. Without Stripe keys, no payments are taken.

Checkout tests fix the clock to a Wednesday at 8 am Toronto time, so time slots are the same on every run.

## Next

Item substitution preferences (GP-9) and the store picking dashboard (GP-15) complete the order journey.
