import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { User } from 'firebase/auth';

const STRIPE_PK = 'pk_test_51Tj0P6KucA1LYHuIKPYkDXGhhu51NXIMiYGZJF2nmOLcEC2SxXuWwsBURJ0d8MVwQL81gC3ykw7JzcUVwjFRBtZd00G3oesKnp';
const SERVER = 'https://mazergame11-production.up.railway.app';

const stripePromise = loadStripe(STRIPE_PK);

interface Package {
  id: string;
  label: string;
  priceCents: number;
  creditCents: number;
  badge?: string;
}

const PACKAGES: Package[] = [
  { id: 'starter', label: 'Starter',  priceCents: 500,  creditCents: 500  },
  { id: 'plus',    label: 'Plus',     priceCents: 1000, creditCents: 1100, badge: '+10%' },
  { id: 'pro',     label: 'Pro',      priceCents: 2500, creditCents: 2750, badge: '+10%' },
  { id: 'elite',   label: 'Elite',    priceCents: 5000, creditCents: 6000, badge: '+20%' },
];

function pc(cents: number) { return (cents / 10).toFixed(0) + ' PC'; }
function usd(cents: number) { return '$' + (cents / 100).toFixed(2); }

// ── Inner checkout form (rendered inside <Elements>) ──────────────────────────
function CheckoutForm({ onSuccess, onBack }: { onSuccess: (creditCents: number) => void; pkg: Package; onBack: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);
    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });
    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed');
      setLoading(false);
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      // Server webhook will credit — we just close optimistically
      // The balance:update socket event will arrive shortly after
      onSuccess(0);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <div style={{ color: '#ff6b6b', fontSize: '0.78rem' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button type="button" onClick={onBack} style={{
          flex: 1, padding: '11px 0', borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.12)', background: 'transparent',
          color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Back
        </button>
        <button type="submit" disabled={!stripe || loading} style={{
          flex: 2, padding: '11px 0', borderRadius: 8, border: 'none',
          background: loading ? 'rgba(255,160,32,0.5)' : '#ffa020',
          color: '#000', fontSize: '0.88rem', fontWeight: 800,
          cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        }}>
          {loading ? 'Processing…' : 'Pay Now'}
        </button>
      </div>
      <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)' }}>
        Secured by Stripe · Sandbox mode
      </div>
    </form>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
interface Props {
  user: User;
  onClose: () => void;
  onSuccess: (creditCents: number) => void;
}

export default function DepositModal({ user, onClose, onSuccess }: Props) {
  const [selected, setSelected] = useState<Package | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSelect = async (pkg: Package) => {
    setSelected(pkg);
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${SERVER}/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, packageId: pkg.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');
      setClientSecret(data.clientSecret);
    } catch (err: any) {
      setError(err.message);
      setSelected(null);
    }
    setLoading(false);
  };

  const handleSuccess = () => {
    setDone(true);
    setTimeout(() => {
      onSuccess(selected?.creditCents ?? 0);
      onClose();
    }, 2000);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#0d0d18', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, padding: 28, width: 360, maxWidth: '92vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 3 }}>
              Paigon Credits
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>Add Credits</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '1.2rem', cursor: 'pointer', padding: 4 }}>✕</button>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>✓</div>
            <div style={{ fontWeight: 800, color: '#00ff88', fontSize: '1.1rem' }}>Payment successful!</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', marginTop: 6 }}>
              {pc(selected?.creditCents ?? 0)} will appear in your balance shortly
            </div>
          </div>
        ) : clientSecret && selected ? (
          <>
            <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,160,32,0.08)', border: '1px solid rgba(255,160,32,0.2)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem' }}>{selected.label} — {pc(selected.creditCents)}</span>
              <span style={{ fontWeight: 800, color: '#ffa020' }}>{usd(selected.priceCents)}</span>
            </div>
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#ffa020', borderRadius: '8px' } } }}>
              <CheckoutForm pkg={selected} onSuccess={handleSuccess} onBack={() => { setSelected(null); setClientSecret(null); }} />
            </Elements>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {PACKAGES.map(pkg => (
                <button key={pkg.id} onClick={() => handleSelect(pkg)} disabled={loading} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 16px', borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.12s', opacity: loading ? 0.5 : 1,
                }}
                  onMouseOver={e => { if (!loading) { e.currentTarget.style.borderColor = 'rgba(255,160,32,0.4)'; e.currentTarget.style.background = 'rgba(255,160,32,0.06)'; }}}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>{pkg.label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{pc(pkg.creditCents)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {pkg.badge && (
                      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#00ff88', background: 'rgba(0,255,136,0.12)', padding: '2px 7px', borderRadius: 20 }}>
                        {pkg.badge}
                      </div>
                    )}
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffa020' }}>{usd(pkg.priceCents)}</div>
                  </div>
                </button>
              ))}
            </div>
            {error && <div style={{ color: '#ff6b6b', fontSize: '0.78rem', marginBottom: 8 }}>{error}</div>}
            {loading && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>Setting up payment…</div>}
            <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'rgba(255,255,255,0.18)', marginTop: 8 }}>
              10 PC = $1.00 · Secured by Stripe
            </div>
          </>
        )}
      </div>
    </div>
  );
}
