/* Testimonials grid (5-up with central video) + integrations radial. */

const Testimonial = ({ stars = 4, quote, name, role }) => (
  <div className="t-card">
    <Stars filled={stars} />
    <div className="q">{quote}</div>
    <div className="who">
      <div className="av"></div>
      <div>
        <div className="name">{name}</div>
        <div className="role">{role}</div>
      </div>
    </div>
  </div>
);

const Testimonials = () => (
  <section className="section">
    <div className="sec-hd">
      <h2>What our Client<br/>Say About Us <span className="ic"><i data-lucide="message-square" style={{width:'0.5em',height:'0.5em'}}></i></span></h2>
      <div>
        <p className="desc">Our clients love working with us! Hear their stories of success, satisfaction, and growth.</p>
        <button className="btn btn-primary" style={{ marginTop: 18 }}>See More Testimonial</button>
      </div>
    </div>
    <div className="testimonials">
      <Testimonial quote="Quick and easy to use for reimbursements and approvals. Love the email receipt auto-import feature and the user-friendly mobile app." name="Christy H." role="CEO At Warby Parker" />
      <div className="t-video">
        <div className="frame">
          <div className="ceo-pill"><Pill variant="neutral" dot>CEO</Pill></div>
        </div>
        <div className="name">Peter Lucious</div>
      </div>
      <Testimonial quote="Expensify makes entering expense reports intuitive while traveling. The real-time app feature and ability to forward emailed receipts simplify the process." name="Chris C." role="Founder At Xero" />
      <Testimonial quote="Expensify makes capturing and organizing payment receipts easy for tracking travel expenditures. The user experience is excellent and intuitive." name="Enrique C." role="Founder At Warby Parker" />
      <Testimonial quote="Expensify is intuitive for entering expense reports on business trips. The app allows real-time entry and forwarding of emailed receipts, making it easier." name="Adam Milne" role="Founder At Switch Group" />
    </div>
  </section>
);

const integLogos = [
  { x: '18%', y: '12%', label: 'Bolt', color: '#28C76F' },
  { x: '78%', y: '14%', label: 'ANZ', color: '#005AAA' },
  { x: '36%', y: '34%', label: 'Microsoft', color: '#5D5D5D' },
  { x: '70%', y: '38%', label: 'Lyft', color: '#FF00BF' },
  { x: '12%', y: '54%', label: 'Sage', color: '#00DC00' },
  { x: '82%', y: '56%', label: 'xero', color: '#13B5EA' },
  { x: '32%', y: '76%', label: 'workday', color: '#F38B00' },
  { x: '70%', y: '76%', label: 'qb', color: '#2CA01C' },
  { x: '18%', y: '90%', label: 'Uber', color: '#000' },
  { x: '82%', y: '92%', label: 'ORACLE', color: '#C74634' },
];

const Integrations = () => (
  <section className="section">
    <div style={{ textAlign: 'center', marginBottom: 40 }}>
      <h2 style={{ fontSize: 'clamp(40px, 4.5vw, 56px)', fontWeight: 500, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#1B3530', margin: 0 }}>
        Connect with<br/>over 40 popular <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '0.7em', height: '0.7em', borderRadius: 999, background: '#1B3530', color: '#C7F269', verticalAlign: '-0.05em', margin: '0 6px' }}><i data-lucide="layers" style={{ width: '0.4em', height: '0.4em' }}></i></span> tools
      </h2>
      <p style={{ color: '#6F827C', fontSize: 14, maxWidth: 520, margin: '14px auto 0' }}>Connect with over 40 tools for seamless data flow across accounting, HR, and project management systems—boosting productivity and saving time</p>
    </div>
    <div className="integ-wrap">
      {integLogos.map((l, i) => (
        <div key={i} className="integ-logo" style={{ left: l.x, top: l.y, color: l.color, fontFamily: 'Manrope, sans-serif' }}>
          {l.label}
        </div>
      ))}
      <div className="integ-logo center" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>E</div>
    </div>
  </section>
);

Object.assign(window, { Testimonials, Integrations });
