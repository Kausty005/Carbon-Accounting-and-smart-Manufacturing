import React from 'react';
import { ShieldAlert, Lock, ArrowRight, CheckCircle2, UserCheck, Sparkles } from 'lucide-react';
import { RoleId, DEMO_USERS, VIEW_SECURITY_METADATA } from '../../auth/authTypes';

interface AccessDeniedViewProps {
  currentRole: RoleId;
  viewId: string;
  onSwitchRole: (role: RoleId) => void;
  onGoToOverview: () => void;
}

export function AccessDeniedView({
  currentRole,
  viewId,
  onSwitchRole,
  onGoToOverview,
}: AccessDeniedViewProps) {
  const currentUser = DEMO_USERS[currentRole] || DEMO_USERS.operator;
  const viewMeta = VIEW_SECURITY_METADATA[viewId] || {
    title: viewId,
    requiredRoles: ['manager'],
    category: 'Analytics',
  };

  const eligibleRoles = viewMeta.requiredRoles.map((r) => DEMO_USERS[r]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '75vh',
        padding: '32px 20px',
        fontFamily: 'var(--font-ui, sans-serif)',
      }}
    >
      <div
        style={{
          maxWidth: '680px',
          width: '100%',
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
        }}
      >
        {/* Top Warning Banner */}
        <div
          style={{
            backgroundColor: '#FFFBEB',
            borderBottom: '1px solid #FDE68A',
            padding: '20px 28px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: '#FEF3C7',
              border: '1px solid #F59E0B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldAlert size={22} color="#D97706" />
          </div>
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '10px',
                fontFamily: "'IBM Plex Mono', monospace",
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: '#B45309',
                textTransform: 'uppercase',
                marginBottom: '2px',
              }}
            >
              <span>Security Clearance Interlock</span>
              <span>•</span>
              <span>RBAC Policy</span>
            </div>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: '#1E252D',
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              Access Restricted: {viewMeta.title}
            </h2>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '28px' }}>
          <p
            style={{
              fontSize: '13.5px',
              color: '#475569',
              lineHeight: 1.6,
              marginTop: 0,
              marginBottom: '20px',
            }}
          >
            This module contains specialized industrial intelligence reserved for designated personnel under the
            PrecisionWorks <strong>ISO 27001 & ISO 50001 Role-Based Access Control policy</strong>.
          </p>

          {/* Current Profile Card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              borderRadius: '14px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: currentUser.avatarColor,
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '13px',
                }}
              >
                {currentUser.initials}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                  {currentUser.name}
                </div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  Current Role: <span style={{ fontWeight: 600, color: '#334155' }}>{currentUser.roleTitle}</span>
                </div>
              </div>
            </div>

            <span
              style={{
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                backgroundColor: currentUser.badge.bg,
                color: currentUser.badge.color,
                border: `1px solid ${currentUser.badge.border}`,
              }}
            >
              {currentUser.badge.label}
            </span>
          </div>

          {/* Authorized Roles Section */}
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                fontSize: '11px',
                fontFamily: "'IBM Plex Mono', monospace",
                fontWeight: 700,
                color: '#64748B',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: '10px',
              }}
            >
              Eligible Roles For This View ({viewMeta.requiredRoles.length})
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              {eligibleRoles.map((role) => (
                <div
                  key={role.roleId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: role.avatarColor,
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '11px',
                      }}
                    >
                      {role.initials}
                    </div>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E252D' }}>
                        {role.roleTitle} ({role.name})
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {role.description}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onSwitchRole(role.roleId)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      backgroundColor: '#0F172A',
                      color: '#FFFFFF',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'background 0.15s',
                    }}
                  >
                    <UserCheck size={13} />
                    <span>Switch Role</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid #F1F5F9',
              paddingTop: '20px',
            }}
          >
            <button
              onClick={onGoToOverview}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                borderRadius: '8px',
                backgroundColor: '#F1F5F9',
                color: '#334155',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span>← Return to Plant Overview</span>
            </button>

            <button
              onClick={() => onSwitchRole('manager')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 18px',
                borderRadius: '8px',
                backgroundColor: '#D97706',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(217, 119, 6, 0.25)',
              }}
            >
              <Sparkles size={13} />
              <span>Sign In as Plant GM (Unlock All)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
