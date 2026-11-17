import { useEffect, useRef, useState } from 'react';
import { approveDraft, getManage, qrUrl, runAgent, setOrderStatus, uploadPhoto } from './api.js';
import { useSpeech } from './useSpeech.js';
import { Contact, Footer, Hero, How, MicIcon, Nav, Powered, Showcase, Trust } from './Sections.jsx';

const LANGS = [
  ['te-IN', 'తెలుగు', 'Telugu'], ['hi-IN', 'हिन्दी', 'Hindi'], ['ta-IN', 'தமிழ்', 'Tamil'],
  ['kn-IN', 'ಕನ್ನಡ', 'Kannada'], ['ml-IN', 'മലയാളം', 'Malayalam'], ['mr-IN', 'मराठी', 'Marathi'],
  ['bn-IN', 'বাংলা', 'Bengali'], ['gu-IN', 'ગુજરાતી', 'Gujarati'], ['en-IN', 'English', 'English'],
];

const EXAMPLES = {
  launch: [
    'నేను విజయవాడలో ఇంటి నుండి టిఫిన్ సర్వీస్ నడుపుతాను. ఇడ్లీ, దోశ పిండి, పచ్చళ్ళు అమ్ముతాను',
    'मैं जयपुर में घर से ब्लाउज़ सिलाई का काम करती हूँ',
    'I bake custom cakes and cookies from home in Pune',
  ],
  manage: ['Add Sunday special biryani for ₹180', 'Show my orders', 'We are closed this Sunday'],
};

// The launch, as the owner sees it. Each milestone lights up from real tool events.
const MILESTONES = [
  { key: 'understand', label: 'Understanding your business', by: 'Claude' },
  { key: 'domains', label: 'Finding domains for your brand', by: 'GoDaddy Domains API', tools: ['suggest_domains', 'check_domains'] },
  { key: 'address', label: 'Reserving your web address', by: 'VaaniLaunch', tools: ['check_slug'] },
  { key: 'build', label: 'Catalogue from photos + store', by: 'Claude vision', tools: ['save_draft'] },
  { key: 'approve', label: 'Your approval', by: 'You' },
  { key: 'dns', label: 'Creating the DNS record', by: 'GoDaddy DNS API', tools: ['publish_site'] },
  { key: 'verify', label: 'Checking DNS and HTTPS', by: 'VaaniLaunch', tools: ['verify_site'] },
];

const SPEECH_ERRORS = {
  'not-allowed': 'Microphone permission was blocked. Allow the mic in your browser settings, or type instead.',
  'no-speech': "I didn't hear anything. Tap the mic and try again.",
  network: 'Voice needs an internet connection. Please type instead.',
};

const manageUrl = m => `${location.origin}/?manage=${encodeURIComponent(m.slug)}&key=${encodeURIComponent(m.key)}`;
const fmtTime = ms => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN');

function readManage() {
  const q = new URLSearchParams(location.search);
  if (q.get('manage') && q.get('key')) {
    const m = { slug: q.get('manage'), key: q.get('key') };
    try { localStorage.setItem('vl_manage', JSON.stringify(m)); } catch {}
    history.replaceState(null, '', '/');
    return m;
  }
  try { return JSON.parse(localStorage.getItem('vl_manage')) || null; } catch { return null; }
}

// Say only what verify_site actually checked (a local run has no DNS and no HTTPS).
function verifyLabel(v) {
  if (!v.ok) return 'DNS/HTTPS still propagating. The store will come up shortly.';
  if (v.https && v.dns_resolves) return 'HTTPS verified, DNS record live on GoDaddy';
  if (v.https) return 'HTTPS verified';
  return 'Store reachable (local preview, no HTTPS)';
}

function RichText({ text }) {
  return text.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>;
    if (/^\*\*.+\*\*$/.test(part)) return <b key={i}>{part.slice(2, -2)}</b>;
    return part;
  });
}

function milestone(m, { steps, busy, draft, live, started }) {
  if (m.key === 'understand') {
    if (steps.length || draft || live) return { status: 'done' };
    return { status: busy ? 'running' : started ? 'done' : 'idle' };
  }
  if (m.key === 'approve') {
    if (live || draft?.approved) return { status: 'done', detail: 'Approved by the owner' };
    return draft ? { status: 'wait', detail: 'Check the phone preview, then tap Approve & publish' } : { status: 'idle' };
  }
  const mine = steps.filter(s => m.tools.includes(s.tool));
  if (!mine.length) return { status: 'idle' };
  if (mine.some(s => s.status === 'running')) return { status: 'running', detail: mine.at(-1).label };
  const ok = mine.filter(s => s.status === 'done');
  if (!ok.length) return { status: 'warn', detail: mine.at(-1).error };
  const r = ok.at(-1).result;
  if (m.key === 'domains') {
    const found = steps.filter(s => s.tool === 'check_domains' && s.status === 'done')
      .flatMap(s => s.result.results || []).filter(d => d.available)
      .sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9)).slice(0, 3);
    return { status: 'done', domains: found, detail: found.length ? null : 'Domain ideas ready' };
  }
  if (m.key === 'address') return { status: 'done', detail: r.slug };
  if (m.key === 'build') return { status: 'done', detail: `${r.products} products, bilingual` };
  if (m.key === 'dns') return { status: 'done', detail: r.dns?.record ? `A record ${r.dns.record}` : 'Served via wildcard DNS' };
  if (m.key === 'verify') return { status: r.ok ? 'done' : 'warn', detail: verifyLabel(r) };
  return { status: 'done' };
}

function Timeline(ctx) {
  const states = MILESTONES.map(m => ({ ...m, ...milestone(m, ctx) }));
  // A step the agent never needed (e.g. domains) shows as skipped once later steps are done.
  const lastActive = states.map(s => s.status !== 'idle').lastIndexOf(true);
  return (
    <ol className="timeline">
      {states.map((s, i) => {
        const status = s.status === 'idle' && i < lastActive ? 'skip' : s.status;
        return (
          <li key={s.key} className={`ms ${status}`}>
            <span className="dot">{{ done: '✓', running: '', wait: '!', warn: '!', skip: '–', idle: i + 1 }[status]}</span>
            <div className="ms-body">
              <div className="ms-top"><b>{s.label}</b><span className={`by ${s.by.split(' ')[0].toLowerCase()}`}>{s.by}</span></div>
              {s.detail && <small>{s.detail}</small>}
              {s.domains?.length > 0 && (
                <div className="domains">
                  {s.domains.map(d => (
                    <a key={d.domain} href={`https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(d.domain)}`}
                      target="_blank" rel="noopener noreferrer" className="domain">
                      <b>{d.domain}</b>{d.price != null && <span>{d.currency === 'INR' ? '₹' : d.currency + ' '}{d.price}</span>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Phone({ src, reloadKey }) {
  return (
    <div className="phone">
      <div className="notch" />
      <div className="screen">
        {src ? <iframe key={reloadKey} src={src} title="Store preview" />
          : (
            <div className="skeleton">
              <div className="sk hero-sk" /><div className="sk line" /><div className="sk line short" />
              <div className="sk-grid"><div className="sk card-sk" /><div className="sk card-sk" /></div>
              <p>Your store will appear here</p>
            </div>
          )}
      </div>
    </div>
  );
}

function Confetti() {
  const colors = ['#ff9a1f', '#ff3d6e', '#16a34a', '#2563eb', '#facc15', '#a855f7'];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 60 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length],
          animationDelay: `${(i % 12) * 0.12}s`, animationDuration: `${2.4 + (i % 5) * 0.4}s` }} />
      ))}
    </div>
  );
}

function LaunchModal({ live, name, launchTime, onClose }) {
  const [copied, setCopied] = useState(false);
  const share = `https://wa.me/?text=${encodeURIComponent(`${name} is now online! Order here: ${live.url}`)}`;
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Store launched" onClick={onClose}>
      <Confetti />
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        <div className="party">🎉</div>
        <h2>{name || 'Your store'} is live!</h2>
        {launchTime != null && <p className="lt">From first words to a live store in <b>{fmtTime(launchTime)}</b></p>}
        <img className="qr" src={qrUrl(live.url)} alt={`QR code for ${live.url}`} />
        <p className="scan">Scan to open the store on your phone</p>
        <a className="url" href={live.url} target="_blank" rel="noopener noreferrer">{live.url}</a>
        <div className="row-btns">
          <a className="btn" href={live.url} target="_blank" rel="noopener noreferrer">Open store</a>
          <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(live.url).then(() => setCopied(true))}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
          <a className="btn wa" href={share} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
        </div>
        {live.manage_url && <p className="keep">Keep your private manage link: <code>{live.manage_url}</code></p>}
      </div>
    </div>
  );
}

const STATUS_LABEL = { pending_payment: 'Payment pending', paid: 'Paid', delivered: 'Delivered', cancelled: 'Cancelled' };

function Dashboard({ manage, dash, refresh }) {
  if (!dash) return <div className="dash muted">Loading your store…</div>;
  const pending = dash.orders.filter(o => o.status === 'pending_payment');
  const mark = async (ref, status) => { await setOrderStatus(manage, ref, status).catch(() => {}); refresh(); };
  return (
    <div className="dash">
      <div className="dash-head">
        <div><b>{dash.name}</b><span className={`pill ${dash.status}`}>{dash.status === 'live' ? '● Live' : 'Draft'}</span></div>
        <a href={dash.url} target="_blank" rel="noopener noreferrer">{dash.url}</a>
      </div>
      <div className="kpis">
        <div><b>{dash.orders.length}</b><span>orders</span></div>
        <div><b>{pending.length}</b><span>awaiting payment</span></div>
        <div><b>{inr(dash.orders.filter(o => o.status !== 'cancelled').reduce((t, o) => t + o.total, 0))}</b><span>order value</span></div>
      </div>
      <h3>Orders</h3>
      {!dash.orders.length && <p className="muted small">No orders yet. Share your store link on WhatsApp to get the first one.</p>}
      <ul className="orders">
        {dash.orders.map(o => (
          <li key={o.ref}>
            <div className="o-top"><b>{o.ref}</b><span className={`pill ${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span><b>{inr(o.total)}</b></div>
            <small>{o.items.map(l => `${l.name} × ${l.qty}`).join(', ')}</small>
            <small className="muted">{o.customer.name} · {o.customer.phone}{o.customer.note ? ` · ${o.customer.note}` : ''}</small>
            {o.status === 'pending_payment' && <button className="mini" onClick={() => mark(o.ref, 'paid')}>Money received ✓</button>}
            {o.status === 'paid' && <button className="mini ghost" onClick={() => mark(o.ref, 'delivered')}>Mark delivered</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  // randomUUID exists only on secure origins; a phone testing over http://<LAN IP> needs the fallback.
  const [sessionId] = useState(() => crypto.randomUUID?.() ??
    Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''));
  const [manage, setManage] = useState(readManage);
  const [lang, setLang] = useState('te-IN');
  const [input, setInput] = useState('');
  const [photos, setPhotos] = useState([]); // {id,url,key} | {uploading:true,key,url}
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState(() => [{
    role: 'bot',
    text: manage
      ? '👋 Welcome back! Tell me what to change: add a product, change a price, set a holiday notice, or ask for your orders.'
      : 'Namaste! 🙏 Tell me about your business: what you sell, where, and your WhatsApp number. Add product photos too. Tap the mic and speak in your language, or type.',
  }]);
  const [steps, setSteps] = useState([]);
  const [draft, setDraft] = useState(null); // {slug, preview_url, approved, v}
  const [live, setLive] = useState(null);   // {url, manage_url, verify, v}
  const [storeName, setStoreName] = useState('');
  const [startedAt, setStartedAt] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [launchTime, setLaunchTime] = useState(null);
  const [celebrate, setCelebrate] = useState(false);
  const [dash, setDash] = useState(null);
  const [tab, setTab] = useState('steps');
  const chatRef = useRef(null);
  const fileRef = useRef(null);
  const studioRef = useRef(null);

  const managing = manage && (live || !startedAt);
  const refreshDash = () => manage && getManage(manage).then(d => d && setDash(d)).catch(() => {});

  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => {
    if (!startedAt || launchTime) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(t);
  }, [startedAt, launchTime]);
  useEffect(() => {
    if (!managing) return;
    refreshDash();
    const t = setInterval(refreshDash, 10000);
    return () => clearInterval(t);
  }, [managing, manage?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const onEvent = ({ type, data }) => {
    if (type === 'message') setMessages(m => [...m, { role: 'bot', text: data }]);
    else if (type === 'error') setMessages(m => [...m, { role: 'bot', text: '⚠️ ' + data }]);
    else if (type === 'step') {
      setSteps(s => {
        const i = s.findIndex(x => x.id === data.id);
        return i === -1 ? [...s, data] : s.map((x, j) => (j === i ? data : x));
      });
      const r = data.result;
      if (data.status !== 'done' || !r) return;
      // The owner's private key arrives only in this browser (never in Claude's context).
      if (r._manage) {
        try { localStorage.setItem('vl_manage', JSON.stringify(r._manage)); } catch {}
        setManage(r._manage);
      }
      if (r.needs_approval) {
        const key = r._manage ? `&key=${encodeURIComponent(r._manage.key)}` : '';
        setDraft({ slug: r.slug, preview_url: r.preview_url + key, approved: false, v: Date.now() });
      }
      if (data.tool === 'save_draft') setStoreName(data.label.match(/“(.+)”/)?.[1] || '');
      if (r.live) {
        setLive({ url: r.url, manage_url: r._manage ? manageUrl(r._manage) : null, v: Date.now() });
        setDraft(null);
        setLaunchTime(t => t ?? (startedAt ? Date.now() - startedAt : null));
        setCelebrate(true);
      }
      if (data.tool === 'verify_site') setLive(l => (l ? { ...l, verify: r } : l));
      if (data.tool === 'update_site') {
        setDraft(d => (d ? { ...d, v: Date.now() } : d));
        setLive(l => (l ? { ...l, v: Date.now() } : l));
        setDash(d => (d ? { ...d, v: Date.now() } : d));
      }
    }
  };

  const send = async (raw = input) => {
    const images = photos.map(p => p.id);
    const text = raw.trim() || (images.length ? '📷 Here are my product photos.' : '');
    if (!text || busy) return;
    if (photos.some(p => p.uploading)) {
      setMessages(m => [...m, { role: 'bot', text: '⏳ Photos are still uploading. Send again in a moment.' }]);
      return;
    }
    setInput('');
    setPhotos([]);
    setBusy(true);
    if (!startedAt && !manage) setStartedAt(Date.now());
    setMessages(m => [...m, { role: 'me', text, images: photos.map(p => p.url) }]);
    const langName = LANGS.find(([code]) => code === lang)[2];
    try {
      await runAgent({
        sessionId, images,
        text: `${text}\n\n[Preferred language: ${langName}]`,
        manageSlug: manage?.slug, manageKey: manage?.key,
      }, onEvent);
    } catch (e) {
      setMessages(m => [...m, { role: 'bot', text: '⚠️ ' + e.message }]);
    } finally {
      setBusy(false);
      refreshDash();
    }
  };

  const onPhotos = async files => {
    for (const file of [...files].slice(0, 6 - photos.length)) {
      const key = Math.random().toString(36).slice(2);
      setPhotos(p => [...p, { uploading: true, key, url: URL.createObjectURL(file) }]);
      try {
        const up = await uploadPhoto(file);
        setPhotos(p => p.map(x => (x.key === key ? { ...up, key } : x)));
      } catch (e) {
        setPhotos(p => p.filter(x => x.key !== key));
        setMessages(m => [...m, { role: 'bot', text: '⚠️ Photo upload failed: ' + e.message }]);
      }
    }
  };

  const approve = async () => {
    try {
      await approveDraft(sessionId, draft.slug);
      setDraft(d => ({ ...d, approved: true }));
      send('✅ I approve the preview. Please publish my store.');
    } catch (e) {
      setMessages(m => [...m, { role: 'bot', text: '⚠️ ' + e.message }]);
    }
  };

  const speech = useSpeech({
    lang, onText: setInput, onEnd: t => t.trim() && send(t),
    onError: code => SPEECH_ERRORS[code] && setMessages(m => [...m, { role: 'bot', text: '🎤 ' + SPEECH_ERRORS[code] }]),
  });

  const startStudio = () => {
    studioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (speech.supported && !busy && !speech.listening) setTimeout(speech.toggle, 500);
  };

  const running = steps.filter(s => s.status === 'running').at(-1);
  const status = live ? ['live', '● Live'] : draft && !draft.approved ? ['wait', 'Waiting for your approval']
    : busy ? ['busy', 'Agent working'] : speech.listening ? ['listen', 'Listening…'] : ['idle', managing ? 'Ready for changes' : 'Ready'];
  const phoneSrc = live?.url || draft?.preview_url
    || (managing && dash ? (dash.status === 'live' ? dash.url : `/s/${dash.slug}?key=${encodeURIComponent(manage.key)}`) : null);
  const examples = managing ? EXAMPLES.manage : EXAMPLES.launch;
  const langNative = LANGS.find(([c]) => c === lang)[1];

  return (
    <>
      <Nav onStart={startStudio} />
      <Hero onStart={startStudio} />

      <section className="studio" id="studio" ref={studioRef}>
        <div className="studio-head">
          <div>
            <h2>{managing ? `Managing ${dash?.name || manage.slug}` : 'Launch studio'}</h2>
            <span className={`status ${status[0]}`}>{status[1]}</span>
          </div>
          <div className="studio-right">
            {managing && (
              <button className="link" onClick={() => { try { localStorage.removeItem('vl_manage'); } catch {} setManage(null); setDash(null); }}>
                + Start a new store
              </button>
            )}
            {startedAt && (
              <div className={`timer ${launchTime ? 'done' : ''}`}>
                <span>{launchTime ? 'Launched in' : 'Launch timer'}</span><b>{fmtTime(launchTime ?? elapsed)}</b>
              </div>
            )}
          </div>
        </div>

        <div className="studio-grid">
          {/* 1. Conversation */}
          <div className="panel chat-panel">
            <div className="chat" ref={chatRef} aria-live="polite">
              {messages.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  {m.images?.length > 0 && <div className="thumbs">{m.images.map(u => <img key={u} src={u} alt="" />)}</div>}
                  {m.role === 'bot' ? <RichText text={m.text} /> : m.text}
                </div>
              ))}
              {busy && <div className="msg bot typing"><span className="dots"><i /><i /><i /></span>{running?.label || 'Thinking…'}</div>}
            </div>

            <div className="examples">
              {examples.map(e => <button key={e} onClick={() => send(e)} disabled={busy}>{e}</button>)}
            </div>

            {photos.length > 0 && (
              <div className="pending">
                {photos.map(p => (
                  <div key={p.key} className={`pthumb ${p.uploading ? 'up' : ''}`}>
                    <img src={p.url} alt="" />
                    {!p.uploading && <button onClick={() => setPhotos(ps => ps.filter(x => x.key !== p.key))} aria-label="Remove photo">×</button>}
                  </div>
                ))}
              </div>
            )}

            <div className="composer">
              <div className="langs" role="radiogroup" aria-label="Speaking language">
                {LANGS.map(([code, native, en]) => (
                  <button key={code} role="radio" aria-checked={lang === code} title={en}
                    className={lang === code ? 'on' : ''} onClick={() => setLang(code)}>{native}</button>
                ))}
              </div>
              <div className="voice-row">
                <button className={`mic ${speech.listening ? 'on' : ''}`} onClick={speech.toggle}
                  disabled={!speech.supported || busy} aria-label={speech.listening ? 'Stop listening' : `Speak in ${langNative}`}
                  title={speech.supported ? `Speak in ${langNative}` : 'Voice needs Chrome or Edge'}>
                  <MicIcon />
                </button>
                <div className="voice-hint">
                  <b>{speech.listening ? 'Listening… speak now' : speech.supported ? `Tap and speak in ${langNative}` : 'Voice needs Chrome or Edge'}</b>
                  <span>or type below · up to 6 photos</span>
                </div>
              </div>
              <div className="bar">
                <button className="icon" onClick={() => fileRef.current.click()} disabled={busy || photos.length >= 6} aria-label="Add product photos" title="Add product photos">📷</button>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { onPhotos(e.target.files); e.target.value = ''; }} />
                <textarea value={input} onChange={e => setInput(e.target.value)} rows={1}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Type your message…" aria-label="Message" />
                <button className="send" onClick={() => send()} disabled={busy || (!input.trim() && !photos.length)}>Send</button>
              </div>
            </div>
          </div>

          {/* 2. Agent at work, or the owner's dashboard */}
          <div className="panel agent-panel">
            {managing && startedAt && (
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'steps'} className={tab === 'steps' ? 'on' : ''} onClick={() => setTab('steps')}>Launch steps</button>
                <button role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>Orders</button>
              </div>
            )}
            {managing && (!startedAt || tab === 'orders') ? <Dashboard manage={manage} dash={dash} refresh={refreshDash} /> : (
              <>
                <h3 className="ph">Agent at work <small>every step is a real API call</small></h3>
                <Timeline steps={steps} busy={busy} draft={draft} live={live} started={!!startedAt} />
                {live && (
                  <div className="live-card">
                    <b>🎉 Live at</b>
                    <a href={live.url} target="_blank" rel="noopener noreferrer">{live.url}</a>
                    <button className="mini" onClick={() => setCelebrate(true)}>Show QR code</button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 3. The store, on a phone */}
          <div className="panel phone-panel">
            <Phone src={phoneSrc} reloadKey={`${draft?.v}-${live?.v}-${dash?.v}`} />
            {draft && !live && (
              draft.approved
                ? <div className="approve-bar ok">Approved. Publishing…</div>
                : (
                  <div className="approve-bar">
                    <button className="btn approve" onClick={approve} disabled={busy}>✅ Approve & publish</button>
                    <button className="btn ghost" onClick={() => document.querySelector('.bar textarea').focus()} disabled={busy}>✏️ Change</button>
                    <a href={draft.preview_url} target="_blank" rel="noopener noreferrer" className="open">Open full preview ↗</a>
                  </div>
                )
            )}
          </div>
        </div>
      </section>

      <How />
      <Trust />
      <Powered />
      <Showcase refreshKey={live?.url} />
      <Contact />
      <Footer />
      {celebrate && live && <LaunchModal live={live} name={storeName} launchTime={launchTime} onClose={() => setCelebrate(false)} />}
    </>
  );
}
