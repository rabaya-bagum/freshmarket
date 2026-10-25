// The FreshMarket store: header, departments, filters and product grid, plus the screens that open on top.
// Products, accounts, carts and orders come from the server (server/app.js). The browser keeps only
// per-device things: the chosen store, and the cart while nobody is signed in.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, loadProducts } from './api';
import { DEPTS, STORES, TINT, local, money, plural, score } from './lib';
import { useDialogFocus } from './focus';
import { AuthDialog, CartDrawer, OrderView, OrdersList, ProductDialog, QtyCtl } from './Dialogs';
import Checkout, { newCheckout } from './Checkout';

const SORTS = { pop: (a, b) => b.pop - a.pop, new: (a, b) => b.isNew - a.isNew || b.pop - a.pop, low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price };
const TAGS = ['organic', 'gluten-free', 'vegan'];

function initialStore() {
  const st = +local.get('fm-store', 0);
  return st >= 0 && st < STORES.length ? st : 0;
}
function initialCart() {
  const c = local.get('fm-cart', {});
  return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [productsState, setProductsState] = useState('loading');
  const [storeIdx, setStoreIdx] = useState(initialStore);
  const [cart, setCart] = useState(initialCart);
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [pay, setPay] = useState({ stripe: false });
  const [f, setF] = useState({ dept: null, q: '', sort: 'pop', tags: [], local: false, sale: false, shown: 12 });
  const [layer, setLayer] = useState(null);
  const [co, setCo] = useState(newCheckout);
  const [toastMsg, setToastMsg] = useState(null);
  const [searchReset, setSearchReset] = useState(0);
  const toastTimer = useRef(null);
  const layerRef = useRef(null);
  useDialogFocus(layerRef);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const store = STORES[storeIdx];
  const stockOf = useCallback((p) => (p.stock && p.stock[storeIdx]) ?? 0, [storeIdx]);
  const cartItems = () => Object.entries(cart).map(([id, q]) => ({ p: byId.get(+id), q })).filter((x) => x.p);

  const toast = useCallback((text) => {
    setToastMsg(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);

  // ---- startup: products, payment setup and any signed-in session, all from the server
  useEffect(() => {
    loadProducts().then((ps) => { setProducts(ps); setProductsState('ready'); }).catch(() => setProductsState('error'));
    api.config().then((j) => { if (j && j.stripe) setPay(j); else if (j && j.setupProblem) console.warn('FreshMarket: Stripe is off. ' + j.setupProblem); }).catch(() => {});
    api.session().then((j) => { if (j.user) signedIn(j, { quiet: true }); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- the cart is kept on this device, and on the account while signed in (saved in order, never out of order)
  const saving = useRef(Promise.resolve());
  const userRef = useRef(null);
  userRef.current = user;
  useEffect(() => {
    local.set('fm-cart', cart);
    if (userRef.current) saving.current = saving.current.then(() => api.saveCart(cart)).catch(() => {});
  }, [cart]);

  function signedIn(j, { quiet = false } = {}) {
    setUser(j.user);
    setOrders(j.orders || []);
    if (quiet) setCart((local) => mergeCarts(local, j.cart));
    else setCart(j.cart || {});
    if (!quiet) { setLayer(null); toast('Signed in. Your cart is saved.'); }
  }
  const mergeCarts = (a, b) => {
    const out = { ...(b || {}) };
    for (const [id, q] of Object.entries(a || {})) out[id] = Math.max(out[id] || 0, q);
    return out;
  };

  function setQty(id, n) {
    const p = byId.get(+id);
    if (!p) return;
    n = Math.max(0, Math.min(n, stockOf(p)));
    setCart((c) => { const next = { ...c }; if (n) next[id] = n; else delete next[id]; return next; });
  }

  function chooseStore(i) {
    setStoreIdx(i);
    local.set('fm-store', i);
    let changed = 0;
    const next = { ...cart };
    for (const [id, q] of Object.entries(cart)) {
      const p = byId.get(+id);
      if (!p) continue;
      const max = (p.stock && p.stock[i]) ?? 0;
      if (q > max) { changed++; if (max) next[id] = max; else delete next[id]; }
    }
    if (changed) setCart(next);
    toast(changed ? `Switched to ${STORES[i].name}. ${changed} cart item${changed === 1 ? '' : 's'} adjusted to match stock.` : `Switched to ${STORES[i].name}`);
  }

  // ---- account
  const authView = (mode = 'in', msg = null, bad = '') => setLayer({ type: 'auth', mode, msg, bad });
  const authQueue = useRef(Promise.resolve());
  const auth = (kind, fields) => (authQueue.current = authQueue.current.then(() => authStep(kind, fields)));
  // A server reply only changes the dialog if the shopper is still on the screen it answers
  const reply = (from, mode, msg) => setLayer((cur) => (cur && cur.type === 'auth' && cur.mode === from ? { type: 'auth', mode, msg, bad: '' } : cur));
  async function authStep(kind, { name, email, password }) {
    const mode = kind;
    if (kind === 'in') {
      // GP-81: never send a sign-in unless both fields are filled in and the email looks valid
      const need = !email ? ['em', 'Enter your email address.'] : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? ['em', 'Enter a valid email address, like name@example.com.'] : !password ? ['pw', 'Enter your password.'] : null;
      if (need) {
        authView(mode, { kind: 'err', text: need[1], id: 'auth-err' }, need[0]);
        document.getElementById(need[0])?.focus();
        return;
      }
      try {
        signedIn(await api.signIn(email, password, cart));
      } catch (e) {
        reply('in', 'in', { kind: 'err', text: e.message });
      }
    } else if (kind === 'up') {
      try {
        await api.signUp(name, email, password);
        reply('up', 'in', { kind: 'ok', text: `Account created. We sent a verification link to ${email}. (Demo: sign in twice to simulate verifying.)` });
      } catch (e) {
        reply('up', 'up', { kind: 'err', text: e.message });
      }
    } else if (kind === 'reset') {
      try {
        await api.reset(email);
        reply('reset', 'in', { kind: 'ok', text: `If an account exists for ${email}, a reset link is on its way.` });
      } catch (e) {
        reply('reset', 'reset', { kind: 'err', text: e.message });
      }
    }
  }

  // ---- what the screens can do (passed to Dialogs.jsx and Checkout.jsx)
  const s = {
    cart, user, orders, store, storeIdx, stockOf, cartItems, setQty,
    add: (id) => { setQty(id, 1); toast('Added to cart'); },
    close: () => setLayer(null),
    startCheckout: () => {
      if (!user) return authView('in', { kind: 'note', text: 'Sign in to continue to checkout.' });
      setCo(newCheckout());
      setLayer({ type: 'checkout' });
    },
    authMode: (m) => authView(m),
    auth,
    google: async () => { try { signedIn(await api.google(cart)); } catch (e) { toast(e.message); } },
    signOut: async () => {
      await api.signOut().catch(() => {});
      setUser(null);
      setOrders([]);
      setLayer(null);
      toast('Signed out');
    },
    showOrders: () => setLayer({ type: 'orders' }),
    showOrder: (id) => setLayer({ type: 'order', id, fresh: false }),
    placeOrder: async (order) => {
      const { order: o } = await api.placeOrder(order);
      setOrders((os) => [o, ...os]);
      setCart({});
      setCo(newCheckout());
      setLayer({ type: 'order', id: o.id, fresh: true, o });
    },
    advance: async (id) => {
      try {
        const { order: o, statusName } = await api.advance(id);
        setOrders((os) => os.map((x) => (x.id === id ? o : x)));
        toast(`Status update sent by email and SMS: ${statusName}`);
      } catch (e) {
        toast(e.message);
      }
    },
    reorder: (id) => {
      const o = orders.find((x) => x.id === id);
      let added = 0, skipped = 0;
      const next = { ...cart };
      for (const x of o.items) {
        const p = byId.get(x.id);
        const room = p ? stockOf(p) - (next[p.id] || 0) : 0, n = Math.min(x.q, Math.max(0, room));
        if (n > 0) { next[p.id] = (next[p.id] || 0) + n; added += n; }
        if (n < x.q) skipped++;
      }
      setCart(next);
      setLayer(null);
      toast(`Added ${added} item${added === 1 ? '' : 's'} to your cart${skipped ? `. ${skipped} item${skipped === 1 ? ' is' : 's are'} out of stock` : ''}.`);
    },
  };
  const updateCo = (patch) => setCo((c) => ({ ...c, ...patch, anim: false }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setLayer(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ---- product list for the current department, filters, search and sort
  const list = useMemo(() => {
    let r = products.filter((p) => (!f.dept || p.dept === f.dept) && (f.local ? p.local : true) && (f.sale ? !!p.was : true) && f.tags.every((t) => p.tags.includes(t)));
    if (f.q) r = r.map((p) => [p, score(p, f.q)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    if (!f.q || f.sort !== 'pop') r = [...r].sort(SORTS[f.sort]);
    return r;
  }, [products, f]);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  const card = (p) => (
    <article className="card" key={p.id}>
      {p.was && <span className="badge">Save {money(p.was - p.price)}</span>}
      <button className="thumb" style={{ background: TINT[p.dept] }} data-open={p.id} aria-label={`View ${p.name}`} onClick={() => setLayer({ type: 'product', id: p.id })}>{p.emoji}</button>
      {p.local ? <span className="local">Ontario grown</span> : <span className="local" style={{ color: 'var(--muted)' }}>{p.brand}</span>}
      <button className="pname" data-open={p.id} onClick={() => setLayer({ type: 'product', id: p.id })}>{p.name}</button>
      <span className="size">{p.size}</span>
      <div className="price"><b>{money(p.price)}{p.per && <span className="unit"> /{p.per}</span>}</b>{p.was && <s>{money(p.was)}</s>}</div>
      <QtyCtl s={s} p={p} />
    </article>
  );

  let grid;
  if (productsState === 'error') grid = <div className="empty" style={{ gridColumn: '1/-1' }} role="alert"><h2>Products could not load</h2><p>Check your connection and refresh the page.</p></div>;
  else if (productsState === 'ready' && !list.length) {
    const popular = products.slice().sort((a, b) => b.pop - a.pop).slice(0, 4);
    grid = <><div className="empty" style={{ gridColumn: '1/-1' }}><h2>No matches for that search</h2><p>Check the spelling or try a broader word like “bread” or “chicken”. Popular this week:</p></div>{popular.map(card)}</>;
  } else grid = list.slice(0, f.shown).map(card);

  const openProduct = layer?.type === 'product' && byId.get(layer.id);
  const openOrder = layer?.type === 'order' && (orders.find((o) => o.id === layer.id) || layer.o);
  const layerKey = layer && [layer.type, layer.mode, layer.id, layer.type === 'checkout' && co.step].filter(Boolean).join(':');

  return (
    <>
      <a className="skip" href="#main">Skip to products</a>
      <div className="demo">Demo store · sample products and prices · no real orders or payments</div>
      <header>
        <div className="wrap">
          <div className="bar">
            <button className="logo" id="home" aria-label="FreshMarket home" onClick={() => { setF((x) => ({ ...x, dept: null, q: '', tags: [], local: false })); setSearchReset((n) => n + 1); }}><i></i>FreshMarket</button>
            <Search products={products} onOpen={(id) => setLayer({ type: 'product', id })} onSearch={(q) => setF((x) => ({ ...x, q, dept: null, shown: 12 }))} reset={searchReset} />
            <button className="ghost" id="acct" onClick={() => authView()}>{user ? `Hi, ${user.name.split(' ')[0]}` : 'Sign in'}</button>
            <button className="cartbtn" id="cartBtn" onClick={() => setLayer({ type: 'cart' })}>Cart <span className="count" id="count">{count}</span></button>
          </div>
          <div className="store">
            <label htmlFor="storeSel">Shopping at</label>{' '}
            <select id="storeSel" aria-label="Choose your store" value={storeIdx} onChange={(e) => chooseStore(+e.target.value)}>
              {STORES.map((x, i) => <option value={i} key={x.name}>FreshMarket {x.city} · {x.name}</option>)}
            </select>{' '}· <span id="storeHours">Open until {store.close}</span>
          </div>
          <nav className="depts" id="depts" aria-label="Departments">
            <button data-dept="" aria-pressed={!f.dept} onClick={() => { setF((x) => ({ ...x, dept: null, q: '', shown: 12 })); setSearchReset((n) => n + 1); }}>All</button>
            {DEPTS.map((d) => <button key={d} data-dept={d} aria-pressed={f.dept === d} onClick={() => { setF((x) => ({ ...x, dept: d, q: '', shown: 12 })); setSearchReset((n) => n + 1); }}>{d}</button>)}
          </nav>
        </div>
      </header>

      <main className="wrap" id="main" tabIndex={-1}>
        <div className="head">
          <div>
            <h1 id="title">{f.q ? `Results for “${f.q}”` : f.dept || 'All departments'}</h1>
            <p className="sub" id="subtitle">{productsState === 'ready' ? plural(list.length, 'product') : productsState === 'loading' ? 'Loading products…' : ''}</p>
          </div>
          <div className="tools">
            <select id="sort" aria-label="Sort products" value={f.sort} onChange={(e) => setF((x) => ({ ...x, sort: e.target.value }))}>
              <option value="pop">Most popular</option>
              <option value="new">Newest</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
            </select>
          </div>
        </div>
        <div className="chips" id="chips">
          <button className="chip" data-local="" aria-pressed={f.local} onClick={() => setF((x) => ({ ...x, local: !x.local }))}>Ontario grown</button>
          {TAGS.map((t) => (
            <button className="chip" key={t} data-tag={t} aria-pressed={f.tags.includes(t)} onClick={() => setF((x) => ({ ...x, tags: x.tags.includes(t) ? x.tags.filter((y) => y !== t) : [...x.tags, t] }))}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
          <button className="chip" data-sale="" aria-pressed={f.sale} onClick={() => setF((x) => ({ ...x, sale: !x.sale }))}>On sale this week</button>
        </div>
        <div className="grid" id="grid">{grid}</div>
        <button className="ghost more" id="more" hidden={!(productsState === 'ready' && list.length > f.shown)} onClick={() => setF((x) => ({ ...x, shown: x.shown + 12 }))}>Show more products</button>
      </main>

      <div id="layer" ref={layerRef}>
        {layer && (
          <Fragment key={layerKey}>
            {layer.type === 'cart' && <CartDrawer s={s} />}
            {openProduct && <ProductDialog s={s} p={openProduct} />}
            {layer.type === 'auth' && <AuthDialog s={s} view={layer} />}
            {layer.type === 'checkout' && <Checkout s={s} co={co} update={updateCo} pay={pay} />}
            {openOrder && <OrderView s={s} o={openOrder} fresh={layer.fresh} />}
            {layer.type === 'orders' && <OrdersList s={s} />}
          </Fragment>
        )}
      </div>
      <div className="toast" id="toast" role="status" aria-live="polite" hidden={!toastMsg}>{toastMsg}</div>
    </>
  );
}

// ---- search box with autocomplete (GP-3)
function Search({ products, onOpen, onSearch, reset }) {
  const [v, setV] = useState('');
  const [sel, setSel] = useState(-1);
  const [open, setOpen] = useState(false);
  // Choosing a department or the logo clears the search box, as it clears the search
  useEffect(() => { if (reset) setV(''); }, [reset]);

  const text = v.trim();
  const hits = text.length < 2 ? [] : products.map((p) => [p, score(p, text)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1] || b[0].pop - a[0].pop).slice(0, 6);
  const show = open && text.length >= 2;

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { setSel((i) => Math.min(i + 1, hits.length - 1)); setOpen(true); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setSel((i) => Math.max(i - 1, -1)); setOpen(true); e.preventDefault(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (sel >= 0 && hits[sel]) onOpen(hits[sel][0].id);
      else onSearch(text);
      setOpen(false);
    }
  }
  return (
    <div className="search">
      <input id="q" type="search" placeholder="Search apples, sourdough, salmon…" autoComplete="off" aria-label="Search products" value={v}
        onChange={(e) => { setV(e.target.value); setSel(-1); setOpen(true); }} onKeyDown={onKeyDown} onBlur={() => setTimeout(() => setOpen(false), 100)} />
      <div className="suggest" id="suggest" hidden={!show}>
        {show && (hits.length ? hits.map(([p], i) => (
          <button key={p.id} data-s={p.id} className={i === sel ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); setOpen(false); onOpen(p.id); }}>
            <span style={{ fontSize: 20 }}>{p.emoji}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{p.name}<br /><span className="size">{p.dept}</span></span>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{money(p.price)}</b>
          </button>
        )) : <div style={{ padding: '10px 14px' }} className="note">No matches. Press Enter to see suggestions.</div>)}
      </div>
    </div>
  );
}

