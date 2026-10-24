import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  ExplainContext,
  ExplainResponse,
  ChatMessage,
  AIStatusResponse,
  explainElement,
  streamChatMessage,
  fetchAiStatus,
} from '../../services/aiApi';

interface AIExplainContextType {
  // Popover state
  activeContext: ExplainContext | null;
  anchorRect: DOMRect | null;
  popoverStatus: 'idle' | 'loading' | 'success' | 'error';
  explanation: ExplainResponse | null;
  errorMessage: string | null;
  explain: (context: ExplainContext, anchorEl: HTMLElement) => void;
  closePopover: () => void;
  retryExplain: () => void;
  openInChat: (context?: ExplainContext) => void;

  // Floating chat state
  isChatOpen: boolean;
  chatContext: ExplainContext | null;
  chatMessages: ChatMessage[];
  isStreaming: boolean;
  aiStatus: AIStatusResponse | null;
  toggleChat: () => void;
  openChat: (context?: ExplainContext) => void;
  closeChat: () => void;
  clearChatContext: () => void;
  sendChat: (text: string) => Promise<void>;
  resetChat: () => void;
  abortChat: () => void;
}

const AIExplainContext = createContext<AIExplainContextType | null>(null);

const DEFAULT_WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    'Hello! I am **WATTWISE AI**, your local plant intelligence assistant powered by local Ollama.\n\n' +
    'Ask me about live plant telemetry, energy consumption (12,480 kWh today), machine health, alerts, or carbon footprint.',
};

export function AIExplainProvider({ children }: { children: React.ReactNode }) {
  // Popover state
  const [activeContext, setActiveContext] = useState<ExplainContext | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [popoverStatus, setPopoverStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [explanation, setExplanation] = useState<ExplainResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<ExplainContext | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([DEFAULT_WELCOME_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatusResponse | null>(null);

  // Inflight controllers
  const explainAbortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  // Poll or check AI status on mount
  useEffect(() => {
    fetchAiStatus()
      .then(setAiStatus)
      .catch(() => {
        setAiStatus({
          status: 'degraded',
          ollama_url: 'http://127.0.0.1:11434',
          active_model: 'WattWise Rule Engine',
          available_models: [],
          is_local: true,
          gpu_accelerated: false,
          provider: 'WattWise Local Fallback',
        });
      });
  }, []);

  const explain = useCallback(
    async (context: ExplainContext, anchorEl: HTMLElement) => {
      // Prevent duplicate inflight request if user clicks same element while loading
      if (
        popoverStatus === 'loading' &&
        activeContext?.identifier === context.identifier &&
        activeContext?.title === context.title
      ) {
        return;
      }

      // Abort any prior request
      if (explainAbortRef.current) {
        explainAbortRef.current.abort();
      }
      explainAbortRef.current = new AbortController();

      const rect = anchorEl.getBoundingClientRect();
      setAnchorRect(rect);
      setActiveContext(context);
      setPopoverStatus('loading');
      setExplanation(null);
      setErrorMessage(null);

      try {
        const result = await explainElement(
          { context },
          explainAbortRef.current.signal
        );
        setExplanation(result);
        setPopoverStatus('success');
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setErrorMessage(err.message || 'Failed to generate explanation');
        setPopoverStatus('error');
      }
    },
    [popoverStatus, activeContext]
  );

  const closePopover = useCallback(() => {
    if (explainAbortRef.current) {
      explainAbortRef.current.abort();
    }
    setPopoverStatus('idle');
    setActiveContext(null);
    setAnchorRect(null);
    setExplanation(null);
    setErrorMessage(null);
  }, []);

  const retryExplain = useCallback(() => {
    if (activeContext && anchorRect) {
      const dummyEl = {
        getBoundingClientRect: () => anchorRect,
      } as HTMLElement;
      explain(activeContext, dummyEl);
    }
  }, [activeContext, anchorRect, explain]);

  const openInChat = useCallback(
    (context?: ExplainContext) => {
      const targetCtx = context || activeContext;
      closePopover();
      setIsChatOpen(true);
      if (targetCtx) {
        setChatContext(targetCtx);
        // Add a prompt hint message if desired
        const followUpPrompt = `I would like to explore **${targetCtx.title}** (${targetCtx.value || 'current state'} ${targetCtx.unit || ''}). What recommendations or root causes should I investigate?`;
        sendChat(followUpPrompt, targetCtx);
      }
    },
    [activeContext, closePopover]
  );

  const toggleChat = useCallback(() => {
    setIsChatOpen((prev) => !prev);
  }, []);

  const openChat = useCallback((context?: ExplainContext) => {
    setIsChatOpen(true);
    if (context) {
      setChatContext(context);
    }
  }, []);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  const clearChatContext = useCallback(() => {
    setChatContext(null);
  }, []);

  const abortChat = useCallback(() => {
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
    }
    setIsStreaming(false);
  }, []);

  const resetChat = useCallback(() => {
    abortChat();
    setChatMessages([DEFAULT_WELCOME_MESSAGE]);
    setChatContext(null);
  }, [abortChat]);

  const sendChat = useCallback(
    async (text: string, overrideCtx?: ExplainContext) => {
      if (!text.trim() || isStreaming) return;

      const userMsg: ChatMessage = { role: 'user', content: text.trim() };
      const updatedMessages = [...chatMessages, userMsg];
      setChatMessages(updatedMessages);
      setIsStreaming(true);

      // Placeholder for streaming assistant response
      const assistantMsgIndex = updatedMessages.length;
      let assistantContent = '';

      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '' },
      ]);

      if (chatAbortRef.current) {
        chatAbortRef.current.abort();
      }
      chatAbortRef.current = new AbortController();

      const ctxToSend = overrideCtx || chatContext || undefined;

      await streamChatMessage(
        {
          messages: updatedMessages,
          current_plant: 'PrecisionWorks Mfg',
          selected_asset: ctxToSend?.asset_id,
          active_context: ctxToSend,
        },
        (token) => {
          assistantContent += token;
          setChatMessages((prev) => {
            const next = [...prev];
            if (next[assistantMsgIndex]) {
              next[assistantMsgIndex] = {
                role: 'assistant',
                content: assistantContent,
              };
            }
            return next;
          });
        },
        () => {
          setIsStreaming(false);
        },
        (err) => {
          setIsStreaming(false);
          setChatMessages((prev) => {
            const next = [...prev];
            if (next[assistantMsgIndex]) {
              next[assistantMsgIndex] = {
                role: 'assistant',
                content:
                  assistantContent ||
                  `Sorry, I encountered an issue communicating with the local model: ${err.message || 'Unknown error'}. Please try again.`,
              };
            }
            return next;
          });
        },
        chatAbortRef.current.signal
      );
    },
    [chatMessages, isStreaming, chatContext]
  );

  return (
    <AIExplainContext.Provider
      value={{
        activeContext,
        anchorRect,
        popoverStatus,
        explanation,
        errorMessage,
        explain,
        closePopover,
        retryExplain,
        openInChat,
        isChatOpen,
        chatContext,
        chatMessages,
        isStreaming,
        aiStatus,
        toggleChat,
        openChat,
        closeChat,
        clearChatContext,
        sendChat,
        resetChat,
        abortChat,
      }}
    >
      {children}
    </AIExplainContext.Provider>
  );
}

export function useAIExplain() {
  const context = useContext(AIExplainContext);
  if (!context) {
    throw new Error('useAIExplain must be used within an AIExplainProvider');
  }
  return context;
}
