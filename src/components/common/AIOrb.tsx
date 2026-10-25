import React from 'react';

export interface AIOrbProps {
  /** Size in pixels or preset string ('sm' = 24px, 'md' = 52px, 'lg' = 84px) */
  size?: number | 'sm' | 'md' | 'lg';
  /** Animation operational state */
  state?: 'idle' | 'thinking' | 'streaming';
  /** Show soft outer atmospheric radiant aura */
  showAura?: boolean;
  /** Show orbiting celestial resonance ring */
  showRings?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function AIOrb({
  size = 'md',
  state = 'thinking',
  showAura = true,
  showRings = true,
  className = '',
  style = {},
}: AIOrbProps) {
  const pixelSize =
    typeof size === 'number'
      ? size
      : size === 'sm'
      ? 24
      : size === 'lg'
      ? 84
      : 52;

  const isSmall = pixelSize <= 30;

  return (
    <div
      className={`ai-orb-container ${state} ${className}`}
      style={{
        width: pixelSize,
        height: pixelSize,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        userSelect: 'none',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {/* ─── 1. Atmospheric Ambient Glow Aura ──────────────────────────────── */}
      {showAura && (
        <div
          className={`ai-orb-aura ${state}`}
          style={{
            position: 'absolute',
            inset: isSmall ? -3 : -12,
            borderRadius: '50%',
            background:
              state === 'thinking'
                ? 'radial-gradient(circle, rgba(2, 132, 199, 0.42) 0%, rgba(245, 158, 11, 0.22) 48%, rgba(16, 185, 129, 0.12) 72%, transparent 80%)'
                : 'radial-gradient(circle, rgba(2, 132, 199, 0.28) 0%, rgba(245, 158, 11, 0.14) 55%, transparent 75%)',
            filter: `blur(${isSmall ? 4 : 10}px)`,
            zIndex: 1,
          }}
        />
      )}

      {/* ─── 2. Orbital Gyroscopic Celestial Ring ──────────────────────────── */}
      {showRings && !isSmall && (
        <div
          className={`ai-orb-ring ${state}`}
          style={{
            position: 'absolute',
            width: pixelSize * 1.32,
            height: pixelSize * 1.32,
            borderRadius: '50%',
            border: '1.2px solid transparent',
            borderTopColor: 'rgba(2, 132, 199, 0.65)',
            borderRightColor: 'rgba(245, 158, 11, 0.55)',
            borderBottomColor: 'rgba(16, 185, 129, 0.35)',
            borderLeftColor: 'rgba(2, 132, 199, 0.2)',
            zIndex: 2,
          }}
        />
      )}

      {/* ─── 3. Fluid Morphing Organic Core Plasma ──────────────────────────── */}
      <div
        className={`ai-orb-core ${state}`}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          zIndex: 3,
          overflow: 'hidden',
          boxShadow: isSmall
            ? '0 0 10px rgba(2, 132, 199, 0.5), inset 0 0 6px rgba(255, 255, 255, 0.6)'
            : '0 4px 18px rgba(2, 132, 199, 0.38), inset 0 0 14px rgba(255, 255, 255, 0.7), inset 0 0 6px rgba(245, 158, 11, 0.5)',
        }}
      >
        {/* Swirling Color Strands */}
        <div className={`ai-orb-swirl ${state}`} />

        {/* Dynamic Inner Light Node */}
        <div className={`ai-orb-nucleus ${state}`} />

        {/* 3D Glass Specular Reflection Highlight */}
        <div
          style={{
            position: 'absolute',
            top: '8%',
            left: '14%',
            width: '42%',
            height: '35%',
            borderRadius: '50%',
            background:
              'radial-gradient(ellipse at top left, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.2) 60%, transparent 100%)',
            transform: 'rotate(-25deg)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
