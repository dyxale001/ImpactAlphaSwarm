/* Primitives + small helpers for the marketing kit. */

const Icon = ({ name, size = 16, color }) => (
  <i data-lucide={name} style={{ width: size, height: size, color, display: 'inline-flex' }}></i>
);

const Token = ({ icon, variant = 'forest', size = 'md' }) => (
  <span className={`token ${size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : ''} ${variant === 'lime' ? 'lime' : variant === 'soft' ? 'soft' : variant === 'white' ? 'white' : ''}`}>
    <Icon name={icon} size={size === 'sm' ? 12 : size === 'lg' ? 22 : 16} />
  </span>
);

const Pill = ({ variant = 'accent', children, dot }) => (
  <span className={`pill pill-${variant}`}>
    {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: '#4FB970' }}></span>}
    {children}
  </span>
);

const Eyebrow = ({ children }) => <div className="eyebrow">{children}</div>;

const Stars = ({ filled = 4, total = 5 }) => (
  <div className="stars">
    {Array.from({ length: total }).map((_, i) => (
      <span key={i} style={{ color: i < filled ? '#F2C94C' : '#E2E2E2' }}>★</span>
    ))}
  </div>
);

Object.assign(window, { Icon, Token, Pill, Eyebrow, Stars });
