import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  MessageSquare,
  X,
  Send,
  Square,
  RotateCcw,
  Cpu,
  CornerDownLeft,
  ChevronDown,
  Info,
  Bot,
} from 'lucide-react';
import { useAIExplain } from '../AIExplain/AIExplainContext';

const STARTER_QUESTIONS = [
  'Why is our energy cost high today?',
  'Which machine is wasting the most energy?',
  'Explain the current critical alerts.',
  'How can we reduce peak demand?',
  'Explain the energy demand chart.',
  'What does this power factor mean?',
];

export function FloatingChatbot() {
  const {
    isChatOpen,
    chatContext,
    chatMessages,
    isStreaming,
    aiStatus,
    toggleChat,
    closeChat,
    clearChatContext,
    sendChat,
    resetChat,
    abortChat,
  } = useAIExplain();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages or tokens
  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isChatOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput('');
    sendChat(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {/* ─── Persistent Floating Trigger Button (Bottom-Right: Black Robot Icon) ─── */}
      {!isChatOpen && (
        <button
          onClick={toggleChat}
          aria-label="Open AI Assistant"
          title="Ask WattWise AI Assistant"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9998,
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: '#18191B',
            color: '#F5EFE6',
            border: '1.5px solid rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.2)',
            cursor: 'pointer',
            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, background-color 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 22px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 18px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.2)';
          }}
        >
          <Bot size={24} color="#F5EFE6" strokeWidth={2.2} />
          {/* Subtle online status indicator */}
          <span
            style={{
              position: 'absolute',
              top: 3,
              right: 3,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: aiStatus?.status === 'ready' ? '#22C55E' : '#10B981',
              border: '2px solid #18191B',
              boxShadow: '0 0 6px rgba(34, 197, 94, 0.8)',
            }}
          />
        </button>
      )}

      {/* ─── Sliding Accessible Chat Panel ─────────────────────────────────── */}
      {isChatOpen && (
        <div
          role="dialog"
          aria-label="WATTWISE AI Chatbot"
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            width: window.innerWidth < 640 ? 'calc(100vw - 32px)' : 420,
            height: window.innerWidth < 640 ? '80vh' : 580,
            maxHeight: '90vh',
            background: '#FFFFFF',
            border: '1px solid #EAE3D7',
            borderRadius: 14,
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0,0,0,0.05)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeInPop 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              background: '#FAF6F0',
              borderBottom: '1px solid #F1EBE1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#18191B',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bot size={17} color="#F5EFE6" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1E252D' }}>
                    WATTWISE AI Assistant
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: aiStatus?.status === 'ready' ? '#16A34A' : '#F59E0B',
                    }}
                  />
                  <span style={{ fontSize: 10, color: '#64748B', fontWeight: 500 }}>
                    {aiStatus?.active_model || 'qwen2.5-coder:3b'} (Local Ollama)
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={resetChat}
                title="Reset conversation"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748B',
                  padding: 5,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={closeChat}
                title="Close chat"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748B',
                  padding: 5,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Context Pill Banner (if opened from element) */}
          {chatContext && (
            <div
              style={{
                background: '#FEF3C7',
                borderBottom: '1px solid #FDE68A',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#92400E',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <Info size={13} color="#D97706" style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Context:</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {chatContext.title} ({chatContext.value || 'active'}{' '}
                  {chatContext.unit || ''})
                </span>
              </div>
              <button
                onClick={clearChatContext}
                title="Clear selected context"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#92400E',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Conversation Area */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: '#FDFBF7',
            }}
          >
            {/* Messages */}
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '86%',
                    padding: '9px 13px',
                    borderRadius: 10,
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    background:
                      msg.role === 'user'
                        ? '#0284C7'
                        : '#FFFFFF',
                    color: msg.role === 'user' ? '#FFFFFF' : '#1E252D',
                    border:
                      msg.role === 'user'
                        ? 'none'
                        : '1px solid #EAE3D7',
                    boxShadow:
                      msg.role === 'user'
                        ? '0 1px 3px rgba(2, 132, 199, 0.2)'
                        : '0 1px 3px rgba(0, 0, 0, 0.03)',
                  }}
                >
                  {/* Assistant response content */}
                  {msg.content || (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#94A3B8' }}>
                      <span className="dot-pulse" /> Generating analysis...
                    </span>
                  )}
                  {/* Cursor if active streaming message */}
                  {isStreaming && idx === chatMessages.length - 1 && msg.role === 'assistant' && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 12,
                        background: '#0284C7',
                        marginLeft: 3,
                        verticalAlign: 'middle',
                        animation: 'blink 0.8s infinite',
                      }}
                    />
                  )}
                </div>
              </div>
            ))}

            {/* Starter Questions if conversation is young */}
            {chatMessages.length <= 2 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Suggested Questions
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {STARTER_QUESTIONS.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendChat(q)}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: 6,
                        padding: '5px 9px',
                        fontSize: 11,
                        color: '#334155',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: '10px 14px',
              borderTop: '1px solid #F1EBE1',
              background: '#FAF6F0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? 'AI is generating...' : 'Ask about plant telemetry, energy or machines...'}
              disabled={isStreaming}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #EAE3D7',
                background: '#FFFFFF',
                fontSize: 12,
                color: '#1E252D',
                outline: 'none',
              }}
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={abortChat}
                title="Stop generation"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Square size={13} fill="#FFFFFF" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send message"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: input.trim() ? '#0284C7' : '#CBD5E1',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: input.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s ease',
                }}
              >
                <Send size={14} />
              </button>
            )}
          </form>
        </div>
      )}
    </>
  );
}
