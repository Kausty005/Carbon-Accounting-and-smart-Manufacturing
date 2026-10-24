import { useState } from 'react';
import {
  Lock, Mail, Shield, ArrowRight, CheckCircle2,
  Cpu, Zap, Compass, User, AlertCircle,
} from 'lucide-react';

interface LoginModalProps {
  onLogin: (user: { email: string; role: string; name: string }) => void;
  onBackToHome: () => void;
}

export default function LoginModal({ onLogin, onBackToHome }: LoginModalProps) {
  const [email, setEmail] = useState('operator@precisionworks.mfg');
  const [password, setPassword] = useState('••••••••••••');
  const [role, setRole] = useState('Plant SCADA Operator');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      onLogin({
        email,
        role,
        name: role === 'Plant SCADA Operator' ? 'Vikram Malhotra' : 'Dr. Ananya Sharma',
      });
    }, 400);
  };

  const setDemoRole = (roleName: string, demoEmail: string) => {
    setRole(roleName);
    setEmail(demoEmail);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#E4D9C8',
        padding: 20,
      }}
    >
      {/* Background subtle architectural grid lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(to right, rgba(90,75,55,0.05) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(90,75,55,0.05) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
        }}
      />

      {/* Main Login Card */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          background: 'rgba(235, 226, 212, 0.94)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.85)',
          borderRadius: 20,
          padding: '36px 36px 32px',
          boxShadow: '8px 8px 30px #BCB09E, -8px -8px 30px #FFFFFF',
        }}
      >
        {/* Top Header */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 12px',
              borderRadius: 9999,
              background: 'rgba(15, 23, 42, 0.05)',
              marginBottom: 14,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 1.5,
                color: '#475569',
                textTransform: 'uppercase',
              }}
            >
              PrecisionWorks Terminal 01
            </span>
          </div>

          <h2
            style={{
              fontFamily: "'Cinzel', 'Playfair Display', serif",
              fontSize: 26,
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            WATTWISE AI
          </h2>
          <p style={{ fontSize: 13, color: '#64748b' }}>
            Industrial Energy Intelligence &amp; SCADA Twin
          </p>
        </div>

        {/* 1-Click Role Quick Selectors */}
        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: '#94a3b8',
              marginBottom: 8,
            }}
          >
            DEMO ACCESS ROLES
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              onClick={() => setDemoRole('Plant SCADA Operator', 'operator@precisionworks.mfg')}
              style={{
                background: role === 'Plant SCADA Operator' ? '#0f172a' : 'rgba(255, 255, 255, 0.9)',
                color: role === 'Plant SCADA Operator' ? '#ffffff' : '#334155',
                border: `1px solid ${role === 'Plant SCADA Operator' ? '#0f172a' : 'rgba(0, 0, 0, 0.08)'}`,
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              Operator
              <span style={{ display: 'block', fontSize: 9, opacity: 0.75, fontWeight: 400 }}>
                Live SCADA Control
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDemoRole('Energy Auditor', 'auditor@kirloskar.com')}
              style={{
                background: role === 'Energy Auditor' ? '#0f172a' : 'rgba(255, 255, 255, 0.9)',
                color: role === 'Energy Auditor' ? '#ffffff' : '#334155',
                border: `1px solid ${role === 'Energy Auditor' ? '#0f172a' : 'rgba(0, 0, 0, 0.08)'}`,
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              Energy Auditor
              <span style={{ display: 'block', fontSize: 9, opacity: 0.75, fontWeight: 400 }}>
                What-If &amp; Carbon Reports
              </span>
            </button>
          </div>
        </div>

        {/* Standard Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: 'block',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                color: '#475569',
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Operator ID / Email
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  borderRadius: 8,
                  padding: '9px 12px 9px 34px',
                  fontSize: 13,
                  color: '#0f172a',
                  outline: 'none',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              />
              <Mail
                size={14}
                color="#94a3b8"
                style={{ position: 'absolute', left: 12, top: 11 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: 'block',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                color: '#475569',
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Security PIN / Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  borderRadius: 8,
                  padding: '9px 12px 9px 34px',
                  fontSize: 13,
                  color: '#0f172a',
                  outline: 'none',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              />
              <Lock
                size={14}
                color="#94a3b8"
                style={{ position: 'absolute', left: 12, top: 11 }}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '11px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(15, 23, 42, 0.18)',
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Enter PrecisionWorks Plant</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        {/* Back to Home Link */}
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button
            type="button"
            onClick={onBackToHome}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Back to Interactive Glide Home
          </button>
        </div>
      </div>
    </div>
  );
}
