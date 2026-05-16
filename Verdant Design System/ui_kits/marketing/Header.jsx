/* Header — wordmark · centered nav pill · contact + sign in. */

const Header = () => {
  const [active, setActive] = React.useState('mobile');
  return (
    <header className="hdr">
      <div className="hdr-wordmark">Expensify</div>
      <div className="hdr-nav">
        <button className={active === 'mobile' ? 'active' : ''} onClick={() => setActive('mobile')}>Mobile App</button>
        <button className={active === 'dashboard' ? 'active' : ''} onClick={() => setActive('dashboard')}>Dashboard</button>
      </div>
      <div className="hdr-right">
        <span className="link">Contact Us</span>
        <button className="btn btn-primary" style={{ padding: '10px 22px' }}>Sign In</button>
      </div>
    </header>
  );
};

window.Header = Header;
