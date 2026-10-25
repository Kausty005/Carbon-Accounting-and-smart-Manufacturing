import React, { useState } from 'react';
import {
  Lock, Mail, Shield, ArrowRight, CheckCircle2,
  Cpu, Zap, Compass, User, AlertCircle, Key, ShieldCheck, Sparkles, Building2
} from 'lucide-react';
import { RoleId, DEMO_USERS, UserProfile } from '../../auth/authTypes';

interface LoginModalProps {
  onLogin: (user: UserProfile) => void;
  onBackToHome: () => void;
  initialRole?: RoleId;
}

export default function LoginModal({ onLogin, onBackToHome, initialRole = 'operator' }: LoginModalProps) {
  const [selectedRole, setSelectedRole] = useState<RoleId>(initialRole);
  const [email, setEmail] = useState<string>(DEMO_USERS[initialRole].email);
  const [password, setPassword] = useState<string>('••••••••••••');
  const [loading, setLoading] = useState<boolean>(false);

  const activePersona = DEMO_USERS[selectedRole];

  const handleSelectRole = (roleId: RoleId) => {
    setSelectedRole(roleId);
    setEmail(DEMO_USERS[roleId].email);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      onLogin(DEMO_USERS[selectedRole]);
      setLoading(false);
    }, 350);
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
        background: '#EDE7DC',
        padding: '24px 16px',
        overflowY: 'auto',
      }}
    >
      {/* Background subtle architectural grid lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(to right, rgba(90,75,55,0.06) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(90,75,55,0.06) 1px, transparent 1px)`,
          backgroundSize: '36px 36px',
          pointerEvents: 'none',
        }}
      />

      {/* Main Login Card */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '540px',
          background: 'rgba(244, 239, 230, 0.94)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.85)',
          borderRadius: '24px',
          padding: '36px 36px 32px',
          boxShadow: '12px 12px 35px #C4BAAB, -12px -12px 35px #FFFFFF',
        }}
      >
        {/* Top Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 14px',
              borderRadius: '9999px',
              background: 'rgba(24, 25, 27, 0.05)',
              marginBottom: '14px',
              border: '1px solid rgba(255, 255, 255, 0.6)',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: '#475569',
                textTransform: 'uppercase',
              }}
            >
              PrecisionWorks Terminal • RBAC Gateway
            </span>
          </div>

          <h2
            style={{
              fontFamily: "'Cinzel', 'Playfair Display', Georgia, serif",
              fontSize: '26px',
              fontWeight: 700,
              color: '#18191B',
              letterSpacing: '-0.01em',
              marginBottom: '6px',
            }}
          >
            SIGN IN TO WATTWISE AI
          </h2>
          <p style={{ fontSize: '13px', color: '#68645C', margin: 0 }}>
            Select an industrial credential role to access authorized telemetry &amp; twin controls.
          </p>
        </div>

        {/* 1-Click Role Quick Selectors (4 Roles) */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '9.5px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7E796E',
              fontWeight: 700,
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>SELECT INDUSTRIAL ROLE (1-CLICK DEMO)</span>
            <span style={{ color: activePersona.avatarColor, fontWeight: 800 }}>
              {activePersona.allowedViews.length} OF 11 MODULES
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {(Object.keys(DEMO_USERS) as RoleId[]).map((roleKey) => {
              const u = DEMO_USERS[roleKey];
              const isSelected = selectedRole === roleKey;
              return (
                <button
                  key={roleKey}
                  type="button"
                  onClick={() => handleSelectRole(roleKey)}
                  style={{
                    backgroundColor: isSelected ? '#18191B' : 'rgba(255, 255, 255, 0.8)',
                    color: isSelected ? '#EDE7DC' : '#2D2B28',
                    border: isSelected ? '1px solid #18191B' : '1px solid rgba(0, 0, 0, 0.08)',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    boxShadow: isSelected
                      ? '0 6px 16px rgba(0,0,0,0.22)'
                      : '2px 2px 6px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: u.avatarColor,
                          boxShadow: `0 0 8px ${u.avatarColor}`,
                        }}
                      />
                      <span
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          fontFamily: "'IBM Plex Mono', monospace",
                          color: isSelected ? '#FFFFFF' : '#18191B',
                        }}
                      >
                        {u.name}
                      </span>
                    </div>
                    {isSelected && <CheckCircle2 size={13} color="#10B981" />}
                  </div>

                  <div style={{ fontSize: '11px', fontWeight: 600, opacity: isSelected ? 0.9 : 0.8 }}>
                    {u.roleTitle}
                  </div>
                  <div style={{ fontSize: '9.5px', color: isSelected ? '#A8A29E' : '#78716C', marginTop: '2px' }}>
                    {u.allowedViews.length} Authorized Views
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Role Description Callout */}
          <div
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.65)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              fontSize: '11.5px',
              color: '#4B4843',
              lineHeight: 1.45,
            }}
          >
            <strong style={{ color: '#18191B' }}>Permissions: </strong>
            {activePersona.description}
          </div>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '10px',
                fontWeight: 700,
                color: '#5C584F',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}
            >
              Operator / Auditor Email
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  borderRadius: '10px',
                  padding: '10px 12px 10px 36px',
                  fontSize: '13px',
                  color: '#18191B',
                  outline: 'none',
                  fontFamily: "'IBM Plex Mono', monospace",
                  boxSizing: 'border-box',
                }}
              />
              <Mail
                size={14}
                color="#78716C"
                style={{ position: 'absolute', left: 12, top: 13 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '22px' }}>
            <label
              style={{
                display: 'block',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '10px',
                fontWeight: 700,
                color: '#5C584F',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}
            >
              Industrial PIN / Security Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  borderRadius: '10px',
                  padding: '10px 12px 10px 36px',
                  fontSize: '13px',
                  color: '#18191B',
                  outline: 'none',
                  fontFamily: "'IBM Plex Mono', monospace",
                  boxSizing: 'border-box',
                }}
              />
              <Lock
                size={14}
                color="#78716C"
                style={{ position: 'absolute', left: 12, top: 13 }}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: '#18191B',
              color: '#EDE7DC',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 18px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.2)',
              transition: 'all 0.2s',
            }}
          >
            {loading ? (
              <span>Authenticating Credentials...</span>
            ) : (
              <>
                <span>Sign In as {activePersona.roleTitle}</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Back to Home Link */}
        <div style={{ textAlign: 'center', marginTop: '18px' }}>
          <button
            type="button"
            onClick={onBackToHome}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#78716C',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            ← Back to Interactive 3D Landing Page
          </button>
        </div>
      </div>
    </div>
  );
}
