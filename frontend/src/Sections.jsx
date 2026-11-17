import { useEffect, useState } from 'react';
import { getSites, sendContact } from './api.js';

export const GREETINGS = ['నమస్తే', 'नमस्ते', 'வணக்கம்', 'ನಮಸ್ಕಾರ', 'നമസ്കാരം', 'नमस्कार', 'নমস্কার', 'નમસ્તે', 'Hello'];

function Greeting() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(n => (n + 1) % GREETINGS.length), 1600);
    return () => clearInterval(t);
  }, []);
  return <span key={i} className="greet">{GREETINGS[i]}</span>;
}

export function Nav({ onStart }) {
  return (
    <nav className="nav">
      <a className="logo" href="#top"><Wave /><span>Vaani<b>Launch</b></span></a>
      <div className="navlinks">
        <a href="#how">How it works</a>
        <a href="#trust">Trust</a>
        <a href="#stores">Stores</a>
        <button className="btn small" onClick={onStart}>Launch my store</button>
      </div>
    </nav>
  );
}

export function Wave() {
  return (
    <svg className="wave" viewBox="0 0 24 24" aria-hidden="true">
      {[3, 7, 11, 15, 19].map((x, i) => (
        <rect key={x} x={x} y={[9, 5, 2, 6, 10][i]} width="2.4" height={[6, 14, 20, 12, 4][i]} rx="1.2" />
      ))}
    </svg>
  );
}

export function Hero({ onStart }) {
  return (
    <header className="hero" id="top">
      <div className="hero-in">
        <div className="eyebrow">GoDaddy Inclusive Innovation Hackathon 2026</div>
        <h1>
          <Greeting /><br />
          Speak your business.<br />
          <span className="grad">Go live in 3 minutes.</span>
        </h1>
        <p className="lede">
          VaaniLaunch is an AI agent for India's home businesses. Tell it what you sell, in your language,
          add a few photos, and it builds a bilingual online store with UPI payments, a real domain search and order emails.
          No forms. No English needed.
        </p>
        <div className="hero-cta">
          <button className="btn big" onClick={onStart}><MicIcon /> Start speaking</button>
          <span className="hint">Telugu · Hindi · Tamil · Kannada · Malayalam · Marathi · Bengali · Gujarati · English</span>
        </div>
        <div className="stats">
          <div><b>63M</b><span>small businesses in India; many sell only on WhatsApp</span></div>
          <div><b>₹5k to 20k</b><span>for a professionally built website</span></div>
          <div><b>₹0</b><span>to launch on VaaniLaunch</span></div>
        </div>
      </div>
      <HeroDemo />
    </header>
  );
}

// A five-second story of the product: a voice note becomes a live store.
function HeroDemo() {
  const lines = [
    ['GoDaddy', 'lakshmitiffins.in available · ₹799/yr'],
    ['Claude vision', '3 photos → 3 products in తెలుగు + English'],
    ['You', 'Approved on the phone preview'],
    ['GoDaddy DNS', 'lakshmi.vaanilaunch.in → live, HTTPS ✓'],
  ];
  return (
    <div className="hero-demo" aria-hidden="true">
      <div className="hd-voice">
        <span className="hd-mic"><MicIcon /></span>
        <div>
          <b>“నేను విజయవాడలో ఇడ్లీ, దోశ పిండి, పచ్చళ్ళు అమ్ముతాను”</b>
          <small>I sell idli and dosa batter and pickles in Vijayawada</small>
        </div>
      </div>
      <ul>
        {lines.map(([by, text], i) => (
          <li key={by} style={{ animationDelay: `${0.8 + i * 0.9}s` }}><span>{by}</span>{text}</li>
        ))}
      </ul>
      <div className="hd-live" style={{ animationDelay: '4.6s' }}>● Live in 2:41 · first order received</div>
    </div>
  );
}

export function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
      <path d="M12 15a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4Z" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const HOW = [
  ['🎙️', 'Speak', 'Describe your business in any of 9 Indian languages. The agent asks at most two short questions.'],
  ['📷', 'Add photos', 'Claude reads each photo and writes the product name, a description in two languages and a suggested price.'],
  ['👀', 'Approve', 'You see the real store on a phone preview. Nothing goes public until you tap Approve.'],
  ['🚀', 'Sell', 'The agent creates the DNS record on GoDaddy and checks HTTPS. Customers order and pay by UPI; you get an email.'],
];

export function How() {
  return (
    <section className="sec" id="how">
      <h2>From a voice note to a live store</h2>
      <p className="sub">The owner talks. The agent does the technical work, out loud, in a panel anyone can follow.</p>
      <div className="how">
        {HOW.map(([icon, title, text], i) => (
          <div className="card how-card" key={title}>
            <div className="num">{i + 1}</div>
            <div className="big-ico">{icon}</div>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const TRUST = [
  ['✋', 'You approve first', 'The server refuses to publish until the owner presses Approve. Any change needs a new approval.'],
  ['💸', 'Honest payments', 'Orders stay "pending" until the owner confirms the money arrived. A QR code is never treated as payment.'],
  ['🧮', 'Server-side totals', 'Totals come from the store\'s saved prices. Prices sent by a browser are ignored.'],
  ['🔑', 'Your store, your key', 'Only the owner\'s session or private manage link can edit the store or see orders. Customer text can\'t command the agent.'],
];

export function Trust() {
  return (
    <section className="sec" id="trust">
      <h2>Responsible by design</h2>
      <p className="sub">The agent acts, the owner stays in control. Every rule below is enforced in code, not just in the prompt.</p>
      <div className="trust">
        {TRUST.map(([icon, title, text]) => (
          <div className="card trust-card" key={title}>
            <span className="t-ico">{icon}</span>
            <div><h3>{title}</h3><p>{text}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Powered() {
  return (
    <section className="sec powered">
      <div className="pw">
        <div className="pw-col">
          <div className="pw-name claude">Claude</div>
          <ul><li>Plans the launch with 10 tools</li><li>Vision turns photos into a catalogue</li><li>Writes and replies in the owner's language</li></ul>
        </div>
        <div className="pw-x">×</div>
        <div className="pw-col">
          <div className="pw-name godaddy">GoDaddy</div>
          <ul><li>Domains API: ideas, availability, prices</li><li>DNS API: an A record per store</li><li>VPS + Titan email for orders</li></ul>
        </div>
      </div>
    </section>
  );
}

export function Showcase({ refreshKey }) {
  const [sites, setSites] = useState([]);
  useEffect(() => { getSites().then(setSites).catch(() => {}); }, [refreshKey]);
  if (!sites.length) return null;
  return (
    <section className="sec" id="stores">
      <h2>Stores launched with VaaniLaunch</h2>
      <div className="stores">
        {sites.map(s => (
          <a key={s.slug} className="store-card" href={s.url} target="_blank" rel="noopener noreferrer" style={{ '--c': s.color || '#ff7a1a' }}>
            {s.image ? <img src={s.image} alt="" /> : <div className="noimg">{s.name?.[0]}</div>}
            <div className="sc-body">
              <b>{s.name}</b>
              <span>{s.tagline}</span>
              <small>{[s.city, s.languages?.join(' · ')].filter(Boolean).join(' — ')}</small>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

export function Contact() {
  const [status, setStatus] = useState('');
  const onSubmit = async e => {
    e.preventDefault();
    setStatus('Sending…');
    const ok = await sendContact(Object.fromEntries(new FormData(e.target)));
    setStatus(ok ? 'Thanks! We will reply soon.' : 'Could not send right now. Please try again later.');
    if (ok) e.target.reset();
  };
  return (
    <section className="sec contact" id="contact">
      <div>
        <h2>Talk to us</h2>
        <p className="sub">Questions, partnerships, or want VaaniLaunch for your self-help group? Messages go straight to our Titan mailbox.</p>
      </div>
      <form onSubmit={onSubmit} className="card">
        <input name="name" placeholder="Your name" required maxLength={100} />
        <input name="email" type="email" placeholder="Email" required />
        <textarea name="message" placeholder="Message" required maxLength={5000} rows={4} />
        <button className="btn">Send message</button>
        <small aria-live="polite">{status}</small>
      </form>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div><Wave /> <b>VaaniLaunch</b> · Lakshmi didn't learn to build a website. She just spoke.</div>
      <div className="muted">Built with Claude + GoDaddy for the GoDaddy Inclusive Innovation Hackathon 2026</div>
    </footer>
  );
}
