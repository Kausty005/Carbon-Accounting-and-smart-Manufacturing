import React, { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ExplainContext } from '../../services/aiApi';
import { useAIExplain } from './AIExplainContext';

interface ExplainableProps {
  context: ExplainContext;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  showBadge?: boolean;
}

export function Explainable({
  context,
  children,
  className = '',
  style = {},
  showBadge = true,
}: ExplainableProps) {
  const { explain, activeContext, popoverStatus } = useAIExplain();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const isCurrentActive =
    activeContext?.identifier === context.identifier &&
    activeContext?.title === context.title;

  const handleClick = (e: React.MouseEvent) => {
    // If the click is on an interactive button or link inside, don't hijack unless direct
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('select')) {
      return;
    }

    if (containerRef.current) {
      explain(context, containerRef.current);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (containerRef.current) {
        explain(context, containerRef.current);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={0}
      role="button"
      aria-label={`Explain ${context.title} with AI`}
      className={`explainable-element ${className}`}
      style={{
        position: 'relative',
        cursor: 'pointer',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        outline: isCurrentActive ? '2px solid #0284C7' : 'none',
        outlineOffset: 2,
        ...style,
      }}
    >
      {children}

      {/* Subtle AI Sparkle Affordance on Hover / Active */}
      {showBadge && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: isCurrentActive
              ? '#0284C7'
              : isHovered
              ? 'rgba(255, 255, 255, 0.95)'
              : 'transparent',
            color: isCurrentActive
              ? '#FFFFFF'
              : isHovered
              ? '#0369A1'
              : 'transparent',
            border: isHovered && !isCurrentActive ? '1px solid #BAE6FD' : 'none',
            borderRadius: 9999,
            padding: '2px 6px',
            fontSize: 9.5,
            fontWeight: 600,
            opacity: isHovered || isCurrentActive ? 1 : 0,
            transform: isHovered || isCurrentActive ? 'scale(1)' : 'scale(0.85)',
            transition: 'all 0.18s ease',
            pointerEvents: 'none',
            boxShadow: isHovered ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',
            zIndex: 10,
          }}
        >
          <Sparkles
            size={11}
            color={isCurrentActive ? '#FFFFFF' : isHovered ? '#0284C7' : '#94A3B8'}
          />
          {(isHovered || isCurrentActive) && <span>AI Explain</span>}
        </div>
      )}
    </div>
  );
}
