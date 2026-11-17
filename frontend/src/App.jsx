import { useEffect, useRef, useState } from 'react';
import { approveDraft, getSites, runAgent, sendContact, uploadPhoto } from './api.js';
import { useSpeech } from './useSpeech.js';

const LANGS = [
  ['en-IN', 'English'], ['hi-IN', 'हिन्दी'], ['te-IN', 'తెలుగు'], ['ta-IN', 'தமிழ்'], ['kn-IN', 'ಕನ್ನಡ'],
  ['ml-IN', 'മലയാളം'], ['mr-IN', 'मराठी'], ['bn-IN', 'বাংলা'], ['gu-IN', 'ગુજરાતી'],
];

const EXAMPLES = {
  launch: [
    'నేను విజయవాడలో ఇంటి నుండి టిఫిన్ సర్వీస్ నడుపుతాను. ఇడ్లీ, దోశ పిండి, పచ్చళ్ళు అమ్ముతాను',
    'मैं जयपुर में घर से ब्लाउज़ सिलाई का काम करती हूँ',
    'I bake custom cakes and cookies from home in Pune',
  ],
  manage: ['Add Sunday special biryani for ₹180', 'Show my orders', 'We are closed this Sunday'],
};

const manageUrl = m => `${location.origin}/?manage=${encodeURIComponent(m.slug)}&key=${encodeURIComponent(m.key)}`;

const SPEECH_ERRORS = {
  'not-allowed': 'Microphone permission was blocked. Allow the mic in your browser settings, or type instead.',
  'no-speech': "I didn't hear anything. Tap 🎤 and try again.",
  network: 'Voice needs an internet connection. Please type instead.',
};

// Say only what verify_site actually checked (a local run has no DNS and no HTTPS).
function verifyLabel(v) {
  if (!v.ok) return '⏳ DNS/HTTPS still propagating — the store will come up shortly.';
  if (v.https && v.dns_resolves) return '🔒 HTTPS verified · DNS record live on GoDaddy';
  if (v.https) return '🔒 HTTPS verified';
  return '✅ Store is reachable (local preview, no HTTPS)';
}

const fmtTime = ms => `${Math.floor(ms / 60000)}m ${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}s`;

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

function RichText({ text }) {
  return text.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>;
    if (/^\*\*.+\*\*$/.test(part)) return <b key={i}>{part.slice(2, -2)}</b>;
    return part;
  });
}

function Step({ step }) {
  const icon = { running: <span className="spin" />, done: '✅', error: '⚠️' }[step.status];
  return (
    <div className={`step ${step.status}`}>
      <span className="ic">{icon}</span>
      <div>{step.label}{step.error && <small>{step.error}</small>}</div>
    </div>
  );
}

function Showcase() {
  const [sites, setSites] = useState([]);
  useEffect(() => { getSites().then(setSites).catch(() => {}); }, []);
  if (!sites.length) return null;
  return (
    <section className="showcase">
      <h2>Stores launched with VaaniLaunch</h2>
      <div className="cards">
        {sites.map(s => (
          <a key={s.slug} className="scard" href={s.url} target="_blank" rel="noopener noreferrer" style={{ '--c': s.color || '#e8590c' }}>
            {s.image ? <img src={s.image} alt="" /> : <div className="noimg">{s.name?.[0]}</div>}
            <div><b>{s.name}</b><small>{s.tagline}</small><small className="muted">{[s.city, s.languages?.join(' · ')].filter(Boolean).join(' — ')}</small></div>
          </a>
        ))}
      </div>
    </section>
  );
}

function ContactForm() {
  const [status, setStatus] = useState('');
  const onSubmit = async e => {
    e.preventDefault();
    setStatus('Sending…');
    const ok = await sendContact(Object.fromEntries(new FormData(e.target)));
    setStatus(ok ? 'Thanks! We will reply soon.' : 'Could not send right now.');
    if (ok) e.target.reset();
  };
  return (
    <section className="contact">
      <h2>Contact us</h2>
      <form onSubmit={onSubmit}>
        <input name="name" placeholder="Your name" required />
        <input name="email" type="email" placeholder="Email" required />
        <textarea name="message" placeholder="Message" required />
        <button>Send message</button>
        <small>{status}</small>
      </form>
    </section>
  );
}

export default function App() {
  // randomUUID exists only on secure origins; a phone testing over http://<LAN IP> needs the fallback.
  const [sessionId] = useState(() => crypto.randomUUID?.() ??
    Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''));
  const [manage, setManage] = useState(readManage);
  const [lang, setLang] = useState('en-IN');
  const [input, setInput] = useState('');
  const [photos, setPhotos] = useState([]); // {id,url} | {uploading:true,key}
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState(() => [{
    role: 'bot',
    text: readManage()
      ? '👋 Welcome back! Tell me what to change in your store — add a product, change a price, set a holiday notice, or ask for your orders.'
      : 'Namaste! 🙏 Tell me about your business — what you sell, where, and your WhatsApp number. Add 📷 product photos too. Type, or tap 🎤 and speak in your language.',
  }]);
  const [steps, setSteps] = useState([]);
  const [draft, setDraft] = useState(null); // {slug, preview_url, approved}
  const [live, setLive] = useState(null);   // {url, manage_url, verified}
  const [startedAt, setStartedAt] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [launchTime, setLaunchTime] = useState(null);
  const chatRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { chatRef.current?.scrollTo(0, chatRef.current.scrollHeight); }, [messages, busy]);
  useEffect(() => {
    if (!startedAt || launchTime) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(t);
  }, [startedAt, launchTime]);

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
      // Keeping it means a server restart can't lock the owner out of their draft.
      if (r._manage) {
        try { localStorage.setItem('vl_manage', JSON.stringify(r._manage)); } catch {}
        setManage(r._manage);
      }
      if (r.needs_approval) {
        const key = r._manage ? `&key=${encodeURIComponent(r._manage.key)}` : '';
        setDraft({ slug: r.slug, preview_url: r.preview_url + key, approved: false, v: Date.now() });
      }
      if (r.live) {
        setLive({ url: r.url, manage_url: r._manage ? manageUrl(r._manage) : null });
        setDraft(null);
        setLaunchTime(t => t ?? (startedAt ? Date.now() - startedAt : null));
      }
      if (data.tool === 'verify_site') setLive(l => (l ? { ...l, verified: r.ok, verify: r } : l));
      if (data.tool === 'update_site') setDraft(d => (d ? { ...d, v: Date.now() } : d));
    }
  };

  const send = async (raw = input, extra = {}) => {
    const images = photos.map(p => p.id);
    const text = raw.trim() || (images.length ? '📷 Here are my product photos.' : '');
    if (!text || busy) return;
    if (photos.some(p => p.uploading)) {
      setMessages(m => [...m, { role: 'bot', text: '⏳ Photos are still uploading — send again in a moment.' }]);
      return;
    }
    setInput('');
    setPhotos([]);
    setBusy(true);
    if (!startedAt && !manage) setStartedAt(Date.now());
    setMessages(m => [...m, { role: 'me', text, images: photos.map(p => p.url) }]);
    const langName = LANGS.find(([code]) => code === lang)[1];
    try {
      await runAgent({
        sessionId, images,
        text: `${text}\n\n[Preferred language: ${langName}]`,
        manageSlug: manage?.slug, manageKey: manage?.key, ...extra,
      }, onEvent);
    } catch (e) {
      setMessages(m => [...m, { role: 'bot', text: '⚠️ ' + e.message }]);
    } finally {
      setBusy(false);
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
  // While a first launch is still a draft in this tab, keep the launch UI; switch to "manage" once live
  // or when the owner arrived with a saved manage link.
  const managing = manage && (live || !startedAt);
  const examples = managing ? EXAMPLES.manage : EXAMPLES.launch;

  return (
    <>
      <header className="top">
        <h1>🎙️ Vaani<span>Launch</span></h1>
        <p>Speak in your language. Get a live store with catalogue, UPI payments and orders — in minutes.</p>
        <ol className="how"><li>🎤 Speak</li><li>📷 Add photos</li><li>👀 Approve</li><li>🚀 Live on the web</li></ol>
        {managing && (
          <div className="managing">Managing <b>{manage.slug}</b>
            <button className="link" onClick={() => { try { localStorage.removeItem('vl_manage'); } catch {} setManage(null); }}>Start a new store</button>
          </div>
        )}
      </header>

      <main>
        <section className="panel">
          <div className="chat" ref={chatRef}>
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.images?.length > 0 && <div className="thumbs">{m.images.map(u => <img key={u} src={u} alt="" />)}</div>}
                {m.role === 'bot' ? <RichText text={m.text} /> : m.text}
              </div>
            ))}
            {busy && <div className="msg bot typing">Working on it…</div>}
          </div>

          <div className="examples">
            {examples.map(e => <button key={e} onClick={() => send(e)} disabled={busy}>{e}</button>)}
          </div>

          {photos.length > 0 && (
            <div className="pending">
              {photos.map(p => (
                <div key={p.key} className={`pthumb ${p.uploading ? 'up' : ''}`}>
                  <img src={p.url} alt="" />
                  {!p.uploading && <button onClick={() => setPhotos(ps => ps.filter(x => x.key !== p.key))}>×</button>}
                </div>
              ))}
            </div>
          )}

          <div className="bar">
            <select value={lang} onChange={e => setLang(e.target.value)} title="Speech language">
              {LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            <button className={`icon mic ${speech.listening ? 'on' : ''}`} onClick={speech.toggle}
              disabled={!speech.supported || busy} title={speech.supported ? 'Speak' : 'Voice not supported in this browser'}>🎤</button>
            <button className="icon cam" onClick={() => fileRef.current.click()} disabled={busy || photos.length >= 6} title="Add product photos">📷</button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { onPhotos(e.target.files); e.target.value = ''; }} />
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Type or speak…" />
            <button onClick={() => send()} disabled={busy || (!input.trim() && !photos.length)}>Send</button>
          </div>
        </section>

        <aside className="panel side">
          <div className="sidehead">
            <h2>🤖 Agent at work</h2>
            {startedAt && <span className={`timer ${launchTime ? 'done' : ''}`}>⏱ {fmtTime(launchTime ?? elapsed)}</span>}
          </div>
          <div className="steps">
            {steps.length === 0
              ? <small className="muted">Every real action appears here: GoDaddy domain checks, photo analysis, DNS, HTTPS verification…</small>
              : steps.map(s => <Step key={s.id} step={s} />)}
          </div>

          {draft && !live && (
            <div className="approval">
              <div className="ahead"><b>👀 Preview your store</b><a href={draft.preview_url} target="_blank" rel="noopener noreferrer">Open ↗</a></div>
              <iframe key={draft.v} src={draft.preview_url} title="Store preview" />
              {draft.approved
                ? <div className="ok">Approved — publishing…</div>
                : <div className="abtns">
                    <button onClick={approve} disabled={busy}>✅ Approve & publish</button>
                    <button className="ghost" onClick={() => document.querySelector('.bar textarea').focus()} disabled={busy}>✏️ Change something</button>
                  </div>}
            </div>
          )}

          {live && (
            <div className="live">
              <div className="big">🎉 Your store is live!</div>
              <a href={live.url} target="_blank" rel="noopener noreferrer">{live.url}</a>
              {launchTime && <div className="lt">Launched in <b>{fmtTime(launchTime)}</b></div>}
              {live.verify && <div className="vf">{verifyLabel(live.verify)}</div>}
              {live.manage_url && <div className="mg">Keep this link to manage your store by voice:<br /><code>{live.manage_url}</code></div>}
            </div>
          )}
        </aside>
      </main>

      <Showcase key={live?.url || 'none'} />
      <ContactForm />
      <footer>Built with Claude + GoDaddy · GoDaddy Inclusive Innovation Hackathon 2026</footer>
    </>
  );
}
