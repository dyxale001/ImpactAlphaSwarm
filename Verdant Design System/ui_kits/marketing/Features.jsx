/* Feature ribbon · comprehensive suite (3-card grid w/ inverse). */

const FeatureRibbon = () => (
  <div className="ribbon">
    <span>Invoices</span><span className="zap"><i data-lucide="zap" style={{width:18,height:18}}></i></span>
    <span>Expenses Reports</span><span className="zap"><i data-lucide="zap" style={{width:18,height:18}}></i></span>
    <span>Travel Management</span><span className="zap"><i data-lucide="zap" style={{width:18,height:18}}></i></span>
    <span>Virtual Cards</span>
  </div>
);

const SuiteCard = ({ icon, title, body, dark, cta }) => (
  <div className={`suite-card ${dark ? 'dark' : ''}`}>
    <div className="visual">
      <div className="ring">
        <div className="core"><i data-lucide={icon} style={{width:22,height:22}}></i></div>
      </div>
    </div>
    <h3>{title}</h3>
    <p>{body}</p>
    {cta ? <button className="btn btn-accent">{cta}</button> : <div className="arrow"><i data-lucide="chevron-right" style={{width:16,height:16}}></i></div>}
  </div>
);

const Features = () => (
  <React.Fragment>
    <FeatureRibbon />
    <section className="section" style={{ paddingTop: 0 }}>
      <div className="sec-hd">
        <h2>Comprehensive<br/>Feature <span className="ic"><i data-lucide="message-circle" style={{width:'0.55em',height:'0.55em'}}></i></span> Suite</h2>
        <div>
          <p className="desc">Get all you need for easy expense tracking, receipt capture, and reporting in one powerful platform</p>
          <button className="btn btn-accent" style={{ marginTop: 18 }}>See All Features</button>
        </div>
      </div>
      <div className="suite">
        <SuiteCard icon="trending-up" title="Spend Management" body="Manage expenses, vendors, and invoices. Analyze spending trends and forecast budgets." />
        <SuiteCard icon="credit-card" title="Expensify Card" body="Pay with an Expensify corporate card and capture transactions in expense reports automatically." />
        <SuiteCard icon="wallet" title="Instant Virtual Card Access" body="Make purchases without a physical card instantly sending virtual cards" dark cta="Strat Using Virtual Card" />
      </div>
    </section>
  </React.Fragment>
);

window.Features = Features;
