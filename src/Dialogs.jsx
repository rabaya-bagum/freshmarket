// The screens that open on top of the store: cart, product, account, orders.
import { useState } from 'react';
import { TINT, STATUS, money, calc } from './lib';

export function Modal({ label, panelClass = '', onClose, children }) {
  return (
    <>
      <div className="scrim" data-close="" onClick={onClose} />
      <div className="modal" data-close="" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className={['panel', panelClass].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-label={label}>
          <button className="x" data-close="" aria-label="Close" onClick={onClose}>×</button>
          {children}
        </div>
      </div>
    </>
  );
}

export function QtyCtl({ s, p, cls = '' }) {
  const n = s.cart[p.id] || 0;
  if (s.stockOf(p) === 0) return <div className="oos">Out of stock at this store</div>;
  if (!n) return <button className={`add ${cls}`.trim()} data-add={p.id} onClick={() => s.add(p.id)}>Add to cart</button>;
  return (
    <div className={`qty ${cls}`.trim()}>
      <button data-dec={p.id} aria-label="Decrease" onClick={() => s.setQty(p.id, n - 1)}>−</button>
      <span>{n}</span>
      <button data-inc={p.id} aria-label="Increase" onClick={() => s.setQty(p.id, n + 1)}>+</button>
    </div>
  );
}

// ---- cart drawer (GP-5)
export function CartDrawer({ s }) {
  const items = s.cartItems();
  const t = calc(items, 'delivery');
  return (
    <>
      <div className="scrim" data-close="" onClick={s.close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Your cart">
        <div className="dhead"><h2>Your cart</h2><button className="x" data-close="" aria-label="Close cart" onClick={s.close}>×</button></div>
        <div className="lines">
          {items.length ? items.map(({ p, q }) => (
            <div className="line" key={p.id}>
              <div className="mini" style={{ background: TINT[p.dept] }}>{p.emoji}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div className="size">{p.size}</div>
                {q > s.stockOf(p) && <div className="err" role="alert">Only {s.stockOf(p)} left</div>}
                <div className="qty">
                  <button data-dec={p.id} aria-label="Decrease" onClick={() => s.setQty(p.id, q - 1)}>−</button>
                  <span>{q}</span>
                  <button data-inc={p.id} aria-label="Increase" onClick={() => s.setQty(p.id, q + 1)}>+</button>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{money(p.price * q)}</b><br />
                <button className="rm" data-rm={p.id} onClick={() => s.setQty(p.id, 0)}>Remove</button>
              </div>
            </div>
          )) : <div className="empty"><h2>Your cart is empty</h2><p>Add something fresh to get started.</p></div>}
        </div>
        {items.length > 0 && (
          <div className="totals">
            <div><span>Subtotal</span><span>{money(t.sub)}</span></div>
            {t.saved > 0 && <div className="save"><span>You save</span><span>−{money(t.saved)}</span></div>}
            <div><span>Est. HST</span><span>{money(t.hst)}</span></div>
            <div><span>Delivery fee</span><span>{t.fee ? money(t.fee) : 'Free'}</span></div>
            {t.fee > 0 && <div className="note">Add {money(50 - t.sub)} more for free delivery.</div>}
            <div className="grand"><span>Estimated total</span><span>{money(t.total)}</span></div>
            <button className="checkout" data-checkout="" onClick={s.startCheckout}>Continue to checkout</button>
            {!s.user && <div className="note">Sign in to save your cart across devices.</div>}
          </div>
        )}
      </aside>
    </>
  );
}

// ---- product page (GP-4)
export function ProductDialog({ s, p }) {
  const sk = s.stockOf(p), sn = s.store.name;
  const st = sk === 0 ? ['out', `Out of stock at ${sn}`] : sk < 5 ? ['low', `Only ${sk} left at ${sn}`] : ['ok', `In stock at ${sn}`];
  return (
    <Modal label={p.name} onClose={s.close}>
      <div className="pd">
        <div className="thumb" style={{ background: TINT[p.dept] }}>{p.emoji}</div>
        <div style={{ minWidth: 0 }}>
          <span className="local">{p.local ? 'Ontario grown · ' : ''}{p.origin}</span>
          <h2>{p.name}</h2>
          <div className="size">{p.brand} · {p.size}</div>
          <div className="price" style={{ marginTop: 10 }}>
            <b style={{ fontSize: 26 }}>{money(p.price)}{p.per && <span className="unit"> /{p.per}</span>}</b>
            {p.was && <><s>{money(p.was)}</s><span className="badge" style={{ position: 'static' }}>Sale</span></>}
          </div>
          {p.per === 'lb' && <div className="unit">{money(p.price * 2.20462)} /kg</div>}
          <div className="tags">{p.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
          <p style={{ margin: '6px 0' }}>{p.desc}</p>
          <div className={`stock ${st[0]}`}>{st[1]}</div>
          {p.per === 'lb' && sk > 0 && <div className="note" style={{ marginTop: 8 }}>Sold by weight. You&apos;ll be charged for the actual weight picked.</div>}
          <div className="buyrow"><QtyCtl s={s} p={p} /></div>
          <div className="nf">
            <h3>Nutrition Facts</h3>
            <div><span>Calories</span><b>{p.nf.cal}</b></div>
            <div><span>Fat</span><span>{p.nf.fat}</span></div>
            <div><span>Carbohydrate</span><span>{p.nf.carb}</span></div>
            <div><span>Protein</span><span>{p.nf.prot}</span></div>
            <div><span>Sodium</span><span>{p.nf.sod}</span></div>
          </div>
          <div className="allergen"><b>Contains:</b> {p.allergens}</div>
        </div>
      </div>
    </Modal>
  );
}

// ---- account (GP-1): sign in, create account, reset password, or the signed-in panel
const Msg = ({ m }) => !m ? null
  : m.kind === 'err' ? <p className="err" id={m.id} role="alert">{m.text}</p>
  : <p className={m.kind === 'ok' ? 'okmsg' : 'note'}>{m.text}</p>;

export function AuthDialog({ s, view }) {
  const { mode, msg, bad } = view;
  const [f, setF] = useState({ nm: '', em: '', pw: '' });
  const field = (id) => ({ id, value: f[id], onChange: (e) => setF({ ...f, [id]: e.target.value }) });
  const invalid = (id) => (bad === id ? { 'aria-invalid': 'true', 'aria-describedby': 'auth-err' } : {});

  if (s.user) {
    return (
      <Modal label="Account" panelClass="auth" onClose={s.close}>
        <h2>Hi, {s.user.name}</h2><p className="sub">{s.user.email}</p><p>Your cart is saved to your account.</p>
        <div className="cofoot" style={{ justifyContent: 'flex-start' }}>
          <button className="ghost" data-orders="" onClick={s.showOrders}>Your orders{s.orders.length ? ` (${s.orders.length})` : ''}</button>
          <button className="ghost" data-logout="" onClick={s.signOut}>Sign out</button>
        </div>
      </Modal>
    );
  }

  // Every submit counts, in order (s.auth queues them), so quick repeated attempts behave like slow ones
  const submit = (kind) => (e) => {
    e.preventDefault();
    s.auth(kind, { name: f.nm.trim(), email: f.em.trim().toLowerCase(), password: f.pw });
  };
  const tab = (m, l) => <button role="tab" data-mode={m} aria-selected={mode === m} onClick={() => s.authMode(m)}>{l}</button>;

  return (
    <Modal label="Sign in" panelClass="auth" onClose={s.close}>
      <h2>{mode === 'reset' ? 'Reset password' : 'Welcome to FreshMarket'}</h2>
      {mode !== 'reset' ? <div className="tabs" role="tablist">{tab('in', 'Sign in')}{tab('up', 'Create account')}</div> : <p className="sub">We&apos;ll email you a link to set a new password.</p>}
      <Msg m={msg} />
      {mode === 'in' && (
        <form data-form="in" noValidate onSubmit={submit('in')}>
          <label>Email<input {...field('em')} type="email" required autoComplete="email" {...invalid('em')} /></label>
          <label>Password<input {...field('pw')} type="password" required autoComplete="current-password" {...invalid('pw')} /></label>
          <button className="link" type="button" data-mode="reset" onClick={() => s.authMode('reset')}>Forgot password?</button>
          <button className="checkout" type="submit">Sign in</button>
        </form>
      )}
      {mode === 'up' && (
        <form data-form="up" onSubmit={submit('up')}>
          <label>Full name<input {...field('nm')} required autoComplete="name" /></label>
          <label>Email<input {...field('em')} type="email" required autoComplete="email" /></label>
          <label>Password<input {...field('pw')} type="password" required minLength={8} autoComplete="new-password" /></label>
          <div className="note">At least 8 characters with a number.</div>
          <button className="checkout" type="submit">Create account</button>
        </form>
      )}
      {mode === 'reset' && (
        <form data-form="reset" onSubmit={submit('reset')}>
          <label>Email<input {...field('em')} type="email" required autoComplete="email" /></label>
          <button className="checkout" type="submit">Send reset link</button>
          <button className="link" type="button" data-mode="in" onClick={() => s.authMode('in')}>Back to sign in</button>
        </form>
      )}
      {mode !== 'reset' && <button className="google" data-google="" style={{ width: '100%', marginTop: 12 }} onClick={s.google}>Continue with Google</button>}
      <p className="note">Demo account: demo@freshmarket.ca / Fresh123</p>
    </Modal>
  );
}

// ---- orders (GP-8): confirmation and receipt, and the order history
export function Steps({ cur }) {
  const names = ['Delivery or pickup', 'Payment', 'Confirmed'];
  return (
    <ol className="steps">
      {names.map((n, i) => <li key={n} className={i < cur ? 'done' : i === cur ? 'cur' : undefined} aria-current={i === cur ? 'step' : undefined}>{n}</li>)}
    </ol>
  );
}

const dateLong = (iso) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });

export function OrderView({ s, o, fresh }) {
  const flow = STATUS[o.mode];
  return (
    <Modal label={'Order ' + o.id} panelClass="co still" onClose={s.close}>
      {fresh && <Steps cur={2} />}
      <h2>{fresh ? `Order ${o.id} confirmed` : `Order ${o.id}`}</h2>
      {fresh ? <p className="okmsg">We emailed a confirmation to {o.email}.</p> : <p className="sub">Placed {dateLong(o.created)}</p>}
      <ol className="track" aria-label="Order status">
        {flow.map((n, i) => <li key={n} className={i < o.status ? 'done' : i === o.status ? 'cur' : undefined} aria-current={i === o.status ? 'step' : undefined}>{n}</li>)}
      </ol>
      <div className="review">
        <div><span className="lbl">{o.mode === 'delivery' ? 'Delivery' : 'Pickup'}</span><b>{o.when}</b><span>{o.where}</span></div>
        <ul className="items">{o.items.map((x) => <li key={x.id}><span>{x.emoji} {x.name} × {x.q}</span><span>{money(x.price * x.q)}</span></li>)}</ul>
        <div className="totals co-totals">
          <div><span>Subtotal</span><span>{money(o.sub)}</span></div>
          {o.saved > 0 && <div className="save"><span>You save</span><span>−{money(o.saved)}</span></div>}
          <div><span>HST</span><span>{money(o.hst)}</span></div>
          <div><span>{o.mode === 'delivery' ? 'Delivery fee' : 'Pickup'}</span><span>{o.fee ? money(o.fee) : 'Free'}</span></div>
          <div className="grand"><span>Total</span><span>{money(o.total)}</span></div>
        </div>
        <p className="note">Paid with {o.paidWith}.</p>
      </div>
      <div className="cofoot">
        {o.status < flow.length - 1 && <button type="button" className="ghost" data-advance={o.id} onClick={() => s.advance(o.id)}>Advance status (demo)</button>}
        <button type="button" className="ghost" data-orders="" onClick={s.showOrders}>All orders</button>
        <button type="button" className="checkout" data-close="" onClick={s.close}>Continue shopping</button>
      </div>
    </Modal>
  );
}

export function OrdersList({ s }) {
  const os = s.orders;
  return (
    <Modal label="Your orders" panelClass="co still" onClose={s.close}>
      <h2>Your orders</h2>
      {os.length ? (
        <ul className="orders">
          {os.map((o) => (
            <li key={o.id}>
              <div><b>{o.id}</b><span className="note">{new Date(o.created).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} · {o.items.reduce((a, x) => a + x.q, 0)} items · {money(o.total)}</span></div>
              <span className="pill">{STATUS[o.mode][o.status]}</span>
              <div className="oact">
                <button type="button" className="ghost" data-order={o.id} onClick={() => s.showOrder(o.id)}>View receipt</button>
                <button type="button" className="ghost" data-reorder={o.id} onClick={() => s.reorder(o.id)}>Reorder</button>
              </div>
            </li>
          ))}
        </ul>
      ) : <div className="empty"><h2>No orders yet</h2><p>Your past orders and receipts will appear here.</p></div>}
    </Modal>
  );
}
