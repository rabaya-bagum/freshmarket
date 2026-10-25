// Checkout (GP-6 time slots, GP-7 payment). Confirmation and tracking (GP-8) are in Dialogs.jsx.
// The server prices and records the order; with Stripe switched on it also checks the payment went through.
import { useEffect, useRef, useState } from 'react';
import { Modal, Steps } from './Dialogs';
import { ApiError, api } from './api';
import { DELIVERY_FEE, DELIVERY_MIN, FREE_DELIVERY, HOLD_MIN, calc, cardError, chargeCents, dayStart, fmtDay, fmtTime, hh, money, r2, slotLabel, slotsFor } from './lib';

export const newCheckout = () => ({ step: 'fulfil', mode: 'delivery', street: '', postal: '', zipOk: false, zipMsg: null, day: 0, slot: null, held: null, pay: 'card', card: { name: '', num: '', exp: '', cvc: '' }, err: '', anim: true, rev: 0 });

// ---- Stripe.js loads once, only when a shopper reaches payment with Stripe switched on
let stripeJs = null, stripeEls = null;
function loadStripe(pk) {
  if (stripeJs) return stripeJs;
  stripeJs = new Promise((ok, fail) => {
    if (window.Stripe) return ok(window.Stripe(pk));
    const sc = document.createElement('script');
    sc.src = 'https://js.stripe.com/v3/';
    sc.onload = () => ok(window.Stripe(pk));
    sc.onerror = () => { stripeJs = null; fail(new Error('Stripe could not load')); };
    document.head.appendChild(sc);
  });
  return stripeJs;
}
async function mountStripe(box, t, pk) {
  stripeEls = null;
  try {
    const stripe = await loadStripe(pk), css = getComputedStyle(document.documentElement);
    stripeEls = stripe.elements({
      mode: 'payment', amount: chargeCents(t), currency: 'cad', captureMethod: t.weighted ? 'manual' : 'automatic',
      appearance: { theme: 'stripe', variables: { colorPrimary: css.getPropertyValue('--leaf').trim(), colorText: css.getPropertyValue('--ink').trim(), colorBackground: css.getPropertyValue('--surface').trim(), borderRadius: '9px' } },
    });
    if (box.isConnected) {
      const pe = stripeEls.create('payment', { layout: 'tabs' });
      pe.on('loaderror', () => { stripeEls = null; box.innerHTML = '<p class="err" role="alert" id="pay-loaderr">The payment form could not load. Refresh the page and try again.</p>'; });
      pe.mount(box);
    }
  } catch {
    box.innerHTML = '<p class="err" role="alert">The payment form could not load. Check your connection and try again.</p>';
  }
}

function checkZip(c, store) {
  const v = c.postal.trim().toUpperCase().replace(/\s+/, '');
  if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(v)) return { zipOk: false, zipMsg: { kind: 'err', text: 'Enter a postal code like L5B 2C9.' } };
  const postal = v.slice(0, 3) + ' ' + v.slice(3);
  if (store.areas.includes(v.slice(0, 3))) return { postal, zipOk: true, zipMsg: { kind: 'ok', text: `We deliver to ${postal}.` } };
  return { postal, zipOk: false, zipMsg: { kind: 'err', text: `We don't deliver to ${postal} from ${store.name} yet. Choose pickup or another store.` } };
}
function validateFulfil(c, t) {
  if (c.mode === 'delivery') {
    if (!c.street.trim()) return 'Enter your street address.';
    if (!c.zipOk) return 'Check your postal code for delivery.';
    if (t.sub < DELIVERY_MIN) return `Delivery needs a minimum order of ${money(DELIVERY_MIN)}.`;
  }
  if (c.slot === null) return 'Choose a delivery or pickup time.';
  return '';
}

export default function Checkout({ s, co, update, pay }) {
  const t = calc(s.cartItems(), co.mode);
  return (
    <Modal label="Checkout" panelClass={'co' + (co.anim ? '' : ' still')} onClose={s.close}>
      {co.step === 'fulfil' ? <Fulfil s={s} c={co} t={t} update={update} /> : <Pay s={s} c={co} t={t} update={update} pay={pay} />}
    </Modal>
  );
}

function Fulfil({ s, c, t, update }) {
  const store = s.store, slots = slotsFor(c.day, s.storeIdx), min = c.mode === 'delivery' && t.sub < DELIVERY_MIN;
  const next = () => {
    let n = c;
    if (c.mode === 'delivery' && !c.zipOk && c.postal.trim()) n = { ...c, ...checkZip(c, store) };
    const err = validateFulfil(n, calc(s.cartItems(), n.mode));
    update({ ...n, err, step: err ? 'fulfil' : 'pay' }, Boolean(err));
  };
  return (
    <>
      <Steps cur={0} />
      <h2>How would you like your order?</h2>
      <div className="seg" role="group" aria-label="Delivery or pickup">
        <button type="button" data-fm="delivery" aria-pressed={c.mode === 'delivery'} onClick={() => update({ mode: 'delivery', err: '' })}>Home delivery</button>
        <button type="button" data-fm="pickup" aria-pressed={c.mode === 'pickup'} onClick={() => update({ mode: 'pickup', err: '' })}>Curbside pickup</button>
      </div>
      {c.mode === 'delivery' ? (
        <>
          <div className="addr">
            <label>Street address<input id="co-street" autoComplete="street-address" value={c.street} onChange={(e) => update({ street: e.target.value })} /></label>
            <label>Postal code<input id="co-postal" autoComplete="postal-code" maxLength={7} value={c.postal} onChange={(e) => update({ postal: e.target.value })} /></label>
            <button type="button" className="ghost" data-co="zip" onClick={() => update({ ...checkZip(c, store), err: '' })}>Check</button>
          </div>
          {c.zipMsg && (c.zipMsg.kind === 'err' ? <p className="err" role="alert" id="co-zip">{c.zipMsg.text}</p> : <p className="okmsg" id="co-zip">{c.zipMsg.text}</p>)}
          <p className="note">{`Delivered from ${store.name} · ${money(DELIVERY_FEE)} fee, free over ${money(FREE_DELIVERY)} · minimum order ${money(DELIVERY_MIN)}`}</p>
          {min && <p className="err" role="alert" id="co-min">{`Delivery needs a minimum order of ${money(DELIVERY_MIN)}. Add ${money(DELIVERY_MIN - t.sub)} more or choose pickup.`}</p>}
        </>
      ) : (
        <p className="pick"><b>{`FreshMarket ${store.name}`}</b><br />{store.addr}<br /><span className="note">Park in a pickup bay and tap “I&apos;m here” in your confirmation email. Free.</span></p>
      )}
      <h3>Choose a time</h3>
      <div className="days" role="group" aria-label="Day">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <button type="button" key={i} data-day={i} aria-pressed={c.day === i} onClick={() => update({ day: i, slot: null, held: null })}>{i === 0 ? 'Today' : fmtDay(dayStart(i))}</button>
        ))}
      </div>
      <div className="slots" role="group" aria-label="Time">
        {slots.length ? slots.map((x) => (
          <button type="button" key={x.h} data-slot={x.h} disabled={x.full} aria-pressed={c.slot === x.h} onClick={() => update({ slot: x.h, held: Date.now() + HOLD_MIN * 60e3, err: '' })}>
            {`${hh(x.h)} – ${hh(x.h + 1)}`}{x.full && <small>Full</small>}
          </button>
        )) : <p className="note">No times left today. Choose another day.</p>}
      </div>
      {c.slot !== null && c.held && <p className="okmsg" id="co-hold">{`We're holding ${slotLabel(c.day, c.slot)} for you until ${fmtTime(new Date(c.held))}.`}</p>}
      {c.err && <p className="err" role="alert" id="co-err">{c.err}</p>}
      <div className="cofoot"><span>Estimated total <b>{money(t.total)}</b></span><button className="checkout" type="button" data-co="next" onClick={next}>Continue to payment</button></div>
    </>
  );
}

const PAY_METHODS = [['card', 'Credit or debit card'], ['apple', 'Apple Pay'], ['google', 'Google Pay']];
const LOADING = { __html: '<p class="note">Loading secure payment form…</p>' };

function Pay({ s, c, t, update, pay }) {
  const store = s.store, box = useRef(null);
  const [busy, setBusy] = useState(false);
  const where = c.mode === 'delivery' ? `${c.street}, ${c.postal.toUpperCase()}` : `FreshMarket ${store.name}, ${store.addr}`;

  useEffect(() => {
    if (pay.stripe && box.current) mountStripe(box.current, t, pay.publishableKey);
    // Mount once when payment opens; the cart can't change during checkout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay.stripe]);

  const order = (paidWith, paymentId) => s.placeOrder({
    store: s.storeIdx, mode: c.mode, items: t.items.map(({ p, q }) => ({ id: p.id, q })), when: slotLabel(c.day, c.slot),
    street: c.street, postal: c.postal, paidWith, paymentId,
  });

  async function stripePay() {
    if (!stripeEls) return update({ err: 'The payment form is still loading. Try again in a moment.' });
    setBusy(true);
    const fail = (msg) => { setBusy(false); update({ err: msg }); };
    try {
      const stripe = await loadStripe(pay.publishableKey);
      const sub = await stripeEls.submit();
      if (sub.error) return fail(sub.error.message);
      let j;
      try {
        j = await api.paymentIntent({ mode: c.mode, items: t.items.map(({ p, q }) => ({ id: p.id, q })) });
      } catch (e) {
        return fail((e instanceof ApiError && e.serverMsg) || 'Payment could not start. Try again.');
      }
      if (j.amountCents !== chargeCents(t)) return fail('Prices changed while you were checking out. Go back and review your order.');
      const res = await stripe.confirmPayment({ elements: stripeEls, clientSecret: j.clientSecret, redirect: 'if_required', confirmParams: { return_url: location.href.split('#')[0] } });
      if (res.error) return fail(res.error.message || 'Your payment was not approved. Try another payment method.');
      const pi = res.paymentIntent;
      if (!pi || !['succeeded', 'requires_capture', 'processing'].includes(pi.status)) return fail('Your payment was not approved. Try another payment method.');
      try {
        await order(pay.testMode ? 'Stripe (test mode)' : 'Stripe', pi.id);
      } catch (e) {
        return fail(e.message);
      }
    } catch {
      fail('Something went wrong with the payment. You have not been charged. Try again.');
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (c.held && Date.now() > c.held) return update({ step: 'fulfil', slot: null, held: null, err: 'Your time slot hold expired. Choose a time again.' });
    if (pay.stripe) return stripePay();
    if (c.pay === 'card') {
      const err = cardError(c.card);
      if (err) return update({ err }, true);
    }
    const num = c.card.num.replace(/\s|-/g, '');
    setBusy(true);
    try {
      await order(c.pay === 'card' ? `card ending in ${num.slice(-4)}` : c.pay === 'apple' ? 'Apple Pay' : 'Google Pay');
    } catch (err) {
      setBusy(false);
      update({ err: err.message }, true);
    }
  }

  const card = (k) => ({ value: c.card[k], onChange: (e) => update({ card: { ...c.card, [k]: e.target.value } }) });
  return (
    <>
      <Steps cur={1} />
      <h2>Review and pay</h2>
      <div className="review">
        <div>
          <span className="lbl">{c.mode === 'delivery' ? 'Delivery' : 'Pickup'}</span>
          <b id="co-when">{slotLabel(c.day, c.slot)}</b>
          <span id="co-where">{where}</span>
          <button type="button" className="link" data-co="back" onClick={() => update({ step: 'fulfil', err: '' })}>Change</button>
        </div>
        <ul className="items">{t.items.map(({ p, q }) => <li key={p.id}><span>{`${p.emoji} ${p.name} × ${q}`}</span><span>{money(p.price * q)}</span></li>)}</ul>
        <div className="totals co-totals">
          <div><span>Subtotal</span><span>{money(t.sub)}</span></div>
          {t.saved > 0 && <div className="save"><span>You save</span><span>{`−${money(t.saved)}`}</span></div>}
          <div><span>Est. HST</span><span>{money(t.hst)}</span></div>
          <div><span>{c.mode === 'delivery' ? 'Delivery fee' : 'Pickup'}</span><span>{t.fee ? money(t.fee) : 'Free'}</span></div>
          <div className="grand"><span>Total</span><span>{money(t.total)}</span></div>
        </div>
        {t.weighted && <p className="note" id="co-preauth">{`Some items are sold by weight. We'll pre-authorize ${money(r2(t.total * 1.1))} and charge the actual amount when your order is picked.`}</p>}
      </div>
      <form data-form="pay" noValidate onSubmit={submit}>
        {pay.stripe ? (
          <>
            <div id="pay-el" className="payel" aria-label="Payment details" ref={box} dangerouslySetInnerHTML={LOADING} />
            {pay.testMode && <p className="note">Stripe test mode: use 4242 4242 4242 4242, any future expiry and any 3 digits. No real money is charged.</p>}
          </>
        ) : (
          <>
            <fieldset className="pm">
              <legend>Payment method</legend>
              {PAY_METHODS.map(([v, l]) => (
                <label className="radio" key={v}><input type="radio" name="pm" value={v} checked={c.pay === v} data-pay={v} onChange={() => update({ pay: v, err: '' })} /> {l}</label>
              ))}
            </fieldset>
            {c.pay === 'card' ? (
              <>
                <label>Name on card<input id="cc-name" autoComplete="cc-name" {...card('name')} /></label>
                <label>Card number<input id="cc-num" inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456" {...card('num')} /></label>
                <div className="two">
                  <label>Expiry (MM/YY)<input id="cc-exp" autoComplete="cc-exp" placeholder="MM/YY" {...card('exp')} /></label>
                  <label>Security code<input id="cc-cvc" inputMode="numeric" autoComplete="cc-csc" maxLength={4} {...card('cvc')} /></label>
                </div>
                <p className="note">Demo: use 4242 4242 4242 4242 to approve, 4000 0000 0000 0002 to see a decline. Any future expiry and any 3 digits.</p>
              </>
            ) : <p className="note">{`You'll confirm the payment in ${c.pay === 'apple' ? 'Apple Pay' : 'Google Pay'}.`}</p>}
          </>
        )}
        {c.err && <p className="err" id="co-err" role="alert">{c.err}</p>}
        <div className="cofoot">
          <button type="button" className="ghost" data-co="back" onClick={() => update({ step: 'fulfil', err: '' })}>Back</button>
          <button className="checkout" type="submit" disabled={busy}>{busy ? 'Processing…' : `Place order · ${money(t.total)}`}</button>
        </div>
      </form>
    </>
  );
}
