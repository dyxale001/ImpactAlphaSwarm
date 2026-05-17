/* FAQ accordion + CTA banner + brand-burst + footer pills. */

const FAQS = [
  { q: 'What is Expensify?', a: 'Expensify simplifies expense tracking and reporting with receipt scanning and accounting software integration.', open: true },
  { q: 'What does Expensify integrate with?' },
  { q: 'What kind of Expensify can I Talk?' },
  { q: 'Can Expensify help with compliance?' },
  { q: 'How quicky Can I Get Setup?' },
  { q: 'How do I upload expenses?' },
  { q: "Can I use Expensify if my company doesn't use it?" },
  { q: 'How much does it cost?' },
  { q: '', spacer: true },
  { q: 'How do I get started?' },
];

const FAQ = () => {
  const [openIdx, setOpenIdx] = React.useState(0);
  return (
    <section className="section">
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(40px, 4.5vw, 56px)', fontWeight: 500, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#1B3530', margin: 0 }}>
          Frequently Ask Questions <span className="ic" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '0.7em', height: '0.7em', borderRadius: 999, background: '#1B3530', color: '#C7F269', verticalAlign: '-0.05em' }}><i data-lucide="help-circle" style={{ width: '0.4em', height: '0.4em' }}></i></span>
        </h2>
        <p style={{ color: '#6F827C', fontSize: 14, marginTop: 12 }}>Didn't find what you were looking for? Just ask!</p>
        <div className="faq-search">
          <i data-lucide="search" style={{ width: 16, height: 16, color: '#9AAAA4' }}></i>
          <input placeholder="Search your question…" />
        </div>
      </div>
      <div className="faq-list">
        {FAQS.filter(f => !f.spacer).map((f, i) => (
          <div key={i} className={`faq-item ${openIdx === i ? 'open' : ''}`} onClick={() => setOpenIdx(openIdx === i ? -1 : i)}>
            <div className="row">
              <div className="q">{f.q}</div>
              <div className="sign">{openIdx === i ? '−' : '+'}</div>
            </div>
            {openIdx === i && (
              <React.Fragment>
                <div className="a">{f.a || 'Expensify is designed to make expense tracking effortless. Tap to learn more and we will walk you through it.'}</div>
                <div className="helpful">Was this helpful <i data-lucide="thumbs-up" style={{width:12,height:12}}></i> <i data-lucide="thumbs-down" style={{width:12,height:12}}></i></div>
              </React.Fragment>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

const CTABanner = () => (
  <section className="section-sm">
    <div className="cta">
      <div className="blob-tr"></div>
      <div className="blob-bl"></div>
      <h2>Simplify Expense Management</h2>
      <p>Enter your email or phone number to save with Expensify's tools.</p>
      <div className="input">
        <input placeholder="Enter your email or phone number" />
        <button>Try it free</button>
      </div>
    </div>
  </section>
);

const BrandBurst = () => (
  <div className="brand-burst">Expensify</div>
);

const Footer = () => (
  <footer>
    <div className="foot-pills">
      <div className="grp">
        <span className="p">Home</span>
        <span className="p">Features</span>
        <span className="p">Pricing</span>
        <span className="p">Integration</span>
        <span className="p">Support</span>
      </div>
      <div className="grp">
        <span className="p">Instagram</span>
        <span className="p">LinkedIn</span>
        <span className="p">Twitter</span>
        <span className="p">Facebook</span>
      </div>
    </div>
    <div className="foot-meta">
      <span>ESTABLISHED IN 2024</span>
      <span>PRIVACY POLICY</span>
    </div>
  </footer>
);

Object.assign(window, { FAQ, CTABanner, BrandBurst, Footer });
