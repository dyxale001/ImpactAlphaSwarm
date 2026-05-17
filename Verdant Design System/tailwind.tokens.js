/**
 * VERDANT DESIGN SYSTEM — Tailwind tokens
 * Drop this object into `theme.extend` in tailwind.config.{js,ts}.
 *
 *   module.exports = {
 *     content: [...],
 *     theme: { extend: require('./tailwind.tokens') },
 *   }
 *
 * Mirror of colors_and_type.css. Keep both in sync.
 */
module.exports = {
  colors: {
    forest: {
      50:  '#F1F5F3',
      100: '#E4ECE9',
      200: '#C9D8D3',
      300: '#9DB6AF',
      400: '#6A8B82',
      500: '#3E6258',
      600: '#28473F',
      700: '#1B3530', // headings
      800: '#173027',
      900: '#112320', // body text
      950: '#0A1715',
    },
    lime: {
      50:  '#FAFEEE',
      100: '#F4FCE0',
      200: '#EDFACC',
      300: '#E1F8AC',
      400: '#D4F58A',
      500: '#C7F269', // signature accent
      600: '#9FCC4A',
      700: '#7FA837',
    },
    neutral: {
      0:   '#FFFFFF',
      50:  '#FBFBFB',
      100: '#F8F8F8', // page bg
      200: '#EFEFEF',
      300: '#E2E2E2',
      400: '#C9C9C9',
      500: '#9B9B9B',
      600: '#6B6B6B',
      700: '#4A4A4A',
      800: '#2A2A2A',
      900: '#131313',
    },
    success: '#4FB970',
    warning: '#F2C94C',
    danger:  '#E25757',
    info:    '#5BA4E6',
  },

  fontFamily: {
    sans:    ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
    display: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
    mono:    ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
  },

  fontSize: {
    xs:   ['12px', { lineHeight: '1.5' }],
    sm:   ['14px', { lineHeight: '1.5' }],
    base: ['16px', { lineHeight: '1.5' }],
    md:   ['18px', { lineHeight: '1.55' }],
    lg:   ['20px', { lineHeight: '1.5' }],
    xl:   ['24px', { lineHeight: '1.3' }],
    '2xl':['32px', { lineHeight: '1.2' }],
    '3xl':['40px', { lineHeight: '1.15' }],
    '4xl':['48px', { lineHeight: '1.1' }],
    '5xl':['56px', { lineHeight: '1.08' }],
    '6xl':['64px', { lineHeight: '1.05' }],
    '7xl':['80px', { lineHeight: '1.02' }],
    '8xl':['112px',{ lineHeight: '1' }],
  },

  fontWeight: {
    light:    '300',
    normal:   '400',
    medium:   '500',
    semibold: '600',
    bold:     '700',
  },

  letterSpacing: {
    tighter: '-0.04em',
    tight:   '-0.02em',
    normal:  '0',
    wide:    '0.04em',
    eyebrow: '0.14em',
  },

  spacing: {
    0:  '0',
    1:  '4px',
    2:  '8px',
    3:  '12px',
    4:  '16px',
    5:  '20px',
    6:  '24px',
    8:  '32px',
    10: '40px',
    12: '48px',
    16: '64px',
    20: '80px',
    24: '96px',
    32: '128px',
    40: '160px',
  },

  borderRadius: {
    none: '0',
    xs:   '4px',
    sm:   '8px',
    md:   '12px',
    lg:   '16px',
    xl:   '20px',
    '2xl':'24px',
    '3xl':'32px',
    '4xl':'40px',
    pill: '999px',
    full: '9999px',
  },

  boxShadow: {
    xs: '0 1px 2px rgba(17, 35, 32, 0.04)',
    sm: '0 2px 6px rgba(17, 35, 32, 0.05)',
    md: '0 8px 24px rgba(17, 35, 32, 0.06)',
    lg: '0 18px 48px rgba(17, 35, 32, 0.08)',
    xl: '0 32px 80px rgba(17, 35, 32, 0.10)',
    ring: '0 0 0 4px rgba(199, 242, 105, 0.45)',
  },

  transitionTimingFunction: {
    standard:   'cubic-bezier(0.2, 0.6, 0.2, 1)',
    emphasize:  'cubic-bezier(0.16, 1, 0.3, 1)',
  },

  transitionDuration: {
    fast: '120ms',
    base: '200ms',
    slow: '320ms',
  },
};
