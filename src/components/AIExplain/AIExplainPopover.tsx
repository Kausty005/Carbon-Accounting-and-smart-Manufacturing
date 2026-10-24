import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  X,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Wrench,
  RefreshCw,
  Cpu,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { useAIExplain } from './AIExplainContext';
import { AIOrb } from '../common/AIOrb';

export function AIExplainPopover() {
  const {
    activeContext,
    anchorRect,
    popoverStatus,
    explanation,
    errorMessage,
    closePopover,
    retryExplain,
    openInChat,
  } = useAIExplain();

  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; isMobile: boolean }>({
    top: 0,
    left: 0,
    isMobile: false,
  });

  // Calculate position relative to viewport and anchor rect
  useEffect(() => {
    if (!anchorRect) return;

    const calculatePosition = () => {
      const isMobile = window.innerWidth < 640;
      if (isMobile) {
        setPosition({ top: 0, left: 0, isMobile: true });
        return;
      }

      const popoverWidth = 440;
      const popoverHeight = 480;
      const margin = 12;

      // Default try placing to the right of anchor
      let left = anchorRect.right + margin;
      let top = anchorRect.top;

      // If overflows right side, try left of anchor
      if (left + popoverWidth > window.innerWidth - margin) {
        left = anchorRect.left - popoverWidth - margin;
      }

      // If still overflowing left, center horizontally below
      if (left < margin) {
        left = Math.max(margin, (window.innerWidth - popoverWidth) / 2);
        top = anchorRect.bottom + margin;
      }

      // If overflows bottom, shift up
      if (top + popoverHeight > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - popoverHeight - margin);
      }

      setPosition({ top, left, isMobile: false });
    };

    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    return () => window.removeEventListener('resize', calculatePosition);
  }, [anchorRect]);

  // Handle click outside and Escape key
  useEffect(() => {
    if (popoverStatus === 'idle') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePopover();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        closePopover();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Timeout to prevent immediate trigger on opening click
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(timer);
    };
  }, [popoverStatus, closePopover]);

  if (popoverStatus === 'idle' || !activeContext) {
    return null;
  }

  // Mobile Bottom Sheet Modal
  if (position.isMobile) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(3px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
      >
        <div
          ref={popoverRef}
          style={{
            background: '#FFFFFF',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
            border: '1px solid #EAE3D7',
          }}
        >
          {renderPopoverContent()}
        </div>
      </div>
    );
  }

  // Desktop Floating Popover
  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: 440,
        maxHeight: '80vh',
        background: '#FFFFFF',
        border: '1px solid #EAE3D7',
        borderRadius: 12,
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0,0,0,0.04)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeInPop 0.18s ease-out forwards',
      }}
    >
      {renderPopoverContent()}
    </div>
  );

  function renderPopoverContent() {
    return (
      <>
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #F1EBE1',
            background: '#FAF6F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AIOrb size={24} state="idle" showAura={false} showRings={false} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1E252D' }}>
                  {activeContext?.title}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: '#E2E8F0',
                    color: '#475569',
                  }}
                >
                  {activeContext?.component_type}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: '#64748B' }}>
                {activeContext?.asset_name || activeContext?.site || 'Plant SCADA Overview'}
              </div>
            </div>
          </div>

          <button
            onClick={closePopover}
            aria-label="Close explanation"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748B',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body Content */}
        <div
          style={{
            padding: '14px 16px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {/* Loading State with Theme-Matched AI Orb */}
          {popoverStatus === 'loading' && (
            <div style={{ padding: '34px 0 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ marginBottom: 18 }}>
                <AIOrb size={68} state="thinking" showAura={true} showRings={true} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E252D', letterSpacing: '-0.01em' }}>
                Grounding telemetry with Local LLM...
              </div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, maxWidth: 280, lineHeight: 1.45 }}>
                Evaluating physical load, baseline deviation, and equipment causes
              </div>
            </div>
          )}

          {/* Error State */}
          {popoverStatus === 'error' && (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                padding: '12px 14px',
                color: '#991B1B',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4 }}>
                <AlertTriangle size={15} color="#DC2626" />
                <span>Explanation Unavailable</span>
              </div>
              <div style={{ fontSize: 11.5, marginBottom: 10 }}>{errorMessage}</div>
              <button
                onClick={retryExplain}
                style={{
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <RefreshCw size={12} />
                <span>Retry Analysis</span>
              </button>
            </div>
          )}

          {/* Success Content */}
          {popoverStatus === 'success' && explanation && (
            <>
              {/* Executive Summary */}
              <div
                style={{
                  background: '#F0F9FF',
                  border: '1px solid #BAE6FD',
                  borderRadius: 8,
                  padding: '10px 12px',
                  color: '#0369A1',
                  fontWeight: 500,
                }}
              >
                {explanation.summary}
              </div>

              {/* What Does This Mean? */}
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#64748B',
                    letterSpacing: '0.04em',
                    marginBottom: 3,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <HelpCircle size={13} color="#0284C7" />
                  <span>What Does This Mean?</span>
                </div>
                <div style={{ color: '#1E252D' }}>{explanation.what_it_means}</div>
              </div>

              {/* Why Does It Matter? */}
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#64748B',
                    letterSpacing: '0.04em',
                    marginBottom: 3,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Layers size={13} color="#D97706" />
                  <span>Why Does It Matter?</span>
                </div>
                <div style={{ color: '#1E252D' }}>{explanation.why_it_matters}</div>
              </div>

              {/* Observed Evidence */}
              {explanation.observed_evidence?.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: '#64748B',
                      letterSpacing: '0.04em',
                      marginBottom: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <CheckCircle size={13} color="#16A34A" />
                    <span>Observed Evidence (Measured Facts)</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: '#334155' }}>
                    {explanation.observed_evidence.map((ev, idx) => (
                      <li key={idx} style={{ marginBottom: 3 }}>
                        {ev}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Possible Causes (Hypotheses) */}
              {explanation.possible_causes?.length > 0 && (
                <div
                  style={{
                    background: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: 8,
                    padding: '8px 12px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#92400E',
                      marginBottom: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <AlertTriangle size={13} color="#D97706" />
                    <span>Possible Causes (Hypotheses for Verification)</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: '#78350F' }}>
                    {explanation.possible_causes.map((c, idx) => (
                      <li key={idx} style={{ marginBottom: 3 }}>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommended Actions */}
              {explanation.recommended_actions?.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: '#64748B',
                      letterSpacing: '0.04em',
                      marginBottom: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Wrench size={13} color="#0284C7" />
                    <span>Recommended Actions</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {explanation.recommended_actions.map((act, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 6,
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: 6,
                          padding: '6px 8px',
                          color: '#1E252D',
                        }}
                      >
                        <ChevronRight size={14} color="#0284C7" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>{act}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Caveats */}
              {explanation.caveats?.length > 0 && (
                <div style={{ fontSize: 10.5, color: '#64748B', borderTop: '1px dashed #E2E8F0', paddingTop: 8 }}>
                  <span style={{ fontWeight: 600 }}>Limitations & Caveats: </span>
                  {explanation.caveats.join(' • ')}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid #F1EBE1',
            background: '#FAF6F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 10.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748B' }}>
            <Cpu size={13} color="#16A34A" />
            <span style={{ fontWeight: 500 }}>
              {explanation?.model_name || 'qwen2.5-coder:3b (Local Ollama)'}
            </span>
          </div>

          <button
            onClick={() => openInChat(activeContext || undefined)}
            style={{
              background: '#0284C7',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
            }}
          >
            <MessageSquare size={13} />
            <span>Open in Chat</span>
          </button>
        </div>
      </>
    );
  }
}
