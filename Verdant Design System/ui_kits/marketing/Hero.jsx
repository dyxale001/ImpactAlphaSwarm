/* Hero — eyebrow + display headline + lead + email capture · accent block w/ phone. */

const PhoneMock = () => (
  <div className="phone">
    <div className="phone-screen">
      <div className="phone-statusbar"><span>12.20</span><span className="right"><span>•••</span><span>📶</span></span></div>
      <div className="phone-header"><span>←</span> Detail Card</div>
      <div className="phone-card">
        <div className="brand">Expensify</div>
        <div className="num">1237 6890 7654 5678</div>
        <div className="meta"><div><div style={{opacity:0.6}}>Name</div>Arina Hawadah</div><div><div style={{opacity:0.6}}>Expired Date</div>10/24</div><div className="visa">VISA</div></div>
      </div>
      <div className="phone-actions">
        <div><div className="ico"><i data-lucide="lock" style={{width:10,height:10}}></i></div>Lock Card</div>
        <div><div className="ico"><i data-lucide="clipboard-list" style={{width:10,height:10}}></i></div>History Card</div>
        <div><div className="ico"><i data-lucide="settings" style={{width:10,height:10}}></i></div>Setting Card</div>
      </div>
      <div className="phone-info">
        <div className="ttl">Card Information<span className="hide">◎ Hide Info</span></div>
        <div className="li"><span className="key"><span></span>Card Name</span><span>Arina Hawadah</span></div>
        <div className="li"><span className="key"><span></span>Card Number</span><span>1237 6890 7654 5678</span></div>
        <div className="li"><span className="key"><span></span>Start Date</span><span>10/10/2021</span></div>
        <div className="li"><span className="key"><span></span>Expiration Date</span><span>10/10/2024</span></div>
        <div className="li"><span className="key"><span></span>Card Limit</span><span>$10,0000</span></div>
        <div className="li"><span className="key"><span></span>CVV (Security Code)</span><span>761</span></div>
      </div>
    </div>
  </div>
);

const Hero = () => (
  <section className="hero">
    <div>
      <Eyebrow>Welcome To <Pill variant="accent">EXPENSIFY</Pill></Eyebrow>
      <h1>
        Streamline<br/>
        <span className="inline-token"></span> Your<br/>
        Spending<br/>
        Goals<sup>®</sup>
      </h1>
      <p className="lead">Effortlessly track expenses, capture receipts, and manage spending—all in one app.</p>
      <div className="hero-cta">
        <input placeholder="Enter your email or phone number" />
        <button>Try it free</button>
      </div>
    </div>
    <div className="hero-mock">
      <div className="hero-rating">
        <div className="num">4,9<sub> /5</sub></div>
        <div className="lab">our app users<br/>feed back</div>
        <Stars filled={4} />
      </div>
      <PhoneMock />
      <div className="hero-mock-foot">
        <div className="title">Mobile <span className="ic">⚡</span><br/>Application</div>
        <div className="dl">DOWNLOAD APP <i data-lucide="arrow-up-right" style={{width:12,height:12}}></i></div>
      </div>
    </div>
  </section>
);

window.Hero = Hero;
