import { useEffect, CSSProperties } from 'react';

// Platform-wide notification dialog. Pure inline styles so it drops into every
// game unchanged — ReflexChains and OddSignal do not use Tailwind.

export type NoticeTone = 'info' | 'warn' | 'error';

export interface NoticeData {
  title: string;
  body: string;
  tone?: NoticeTone;
  /** Optional call to action, e.g. "Add PC" linking to the account page. */
  action?: { label: string; href: string };
}

const TONES: Record<NoticeTone, { accent: string; glow: string; icon: string }> = {
  info:  { accent: '#22d3ee', glow: 'rgba(34,211,238,0.18)', icon: 'i' },
  warn:  { accent: '#fbbf24', glow: 'rgba(251,191,36,0.18)', icon: '!' },
  error: { accent: '#ef4444', glow: 'rgba(239,68,68,0.18)',  icon: '!' },
};

const NOTICE_CSS = `
@keyframes pg-notice-in {
  0%   { opacity: 0; transform: scale(0.92) translateY(14px); }
  70%  { opacity: 1; transform: scale(1.015) translateY(-2px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes pg-notice-veil { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .pg-notice-box, .pg-notice-veil { animation: none !important; }
}
`;

export default function Notice({
  notice,
  onClose,
}: {
  notice: NoticeData;
  onClose: () => void;
}) {
  const tone = TONES[notice.tone ?? 'info'];

  useEffect(() => {
    if (!document.getElementById('pg-notice-css')) {
      const el = document.createElement('style');
      el.id = 'pg-notice-css';
      el.textContent = NOTICE_CSS;
      document.head.appendChild(el);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const btnBase: CSSProperties = {
    fontSize: '0.7rem',
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    padding: '13px 22px',
    borderRadius: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  };

  return (
    <div
      className="pg-notice-veil"
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px',
        background: 'rgba(2,6,16,0.80)',
        backdropFilter: 'blur(4px)',
        animation: 'pg-notice-veil 0.18s ease-out',
      }}
    >
      <div
        className="pg-notice-box"
        role="alertdialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 400, boxSizing: 'border-box',
          background: '#0d0d18',
          border: `1px solid ${tone.accent}3d`,
          borderRadius: 18,
          padding: '26px 28px',
          boxShadow: `0 0 60px ${tone.glow}, 0 24px 64px rgba(0,0,0,0.7)`,
          animation: 'pg-notice-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
          fontFamily: "'Space Grotesk', Rajdhani, system-ui, sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div
            aria-hidden="true"
            style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${tone.accent}1f`,
              border: `2px solid ${tone.accent}`,
              color: tone.accent,
              fontWeight: 900, fontSize: '0.85rem',
            }}
          >
            {tone.icon}
          </div>
          <div style={{ paddingTop: 2 }}>
            <div style={{
              fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.24em',
              textTransform: 'uppercase', color: `${tone.accent}b0`, marginBottom: 4,
            }}>
              Paigon
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', lineHeight: 1.35 }}>
              {notice.title}
            </div>
          </div>
        </div>

        <p style={{
          fontSize: '0.84rem', color: 'rgba(255,255,255,0.45)',
          lineHeight: 1.7, margin: '0 0 24px',
        }}>
          {notice.body}
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          {notice.action && (
            <a
              href={notice.action.href}
              // Games run inside an iframe; _top navigates the real page.
              target="_top"
              style={{
                ...btnBase,
                flex: 1, textAlign: 'center', textDecoration: 'none',
                background: tone.accent, color: '#03030a',
              }}
            >
              {notice.action.label}
            </a>
          )}
          <button
            onClick={onClose}
            autoFocus
            style={{
              ...btnBase,
              flex: notice.action ? undefined : 1,
              background: 'transparent',
              color: 'rgba(255,255,255,0.45)',
              border: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            {notice.action ? 'Not now' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
}
