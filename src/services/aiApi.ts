/**
 * WattWise AI — Local AI Explain & Chat API Service
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export interface ChartSeriesInfo {
  name: string;
  unit?: string;
  color?: string;
  peak_value?: number;
  average_value?: number;
  current_value?: number;
  summary_note?: string;
}

export interface ExplainContext {
  component_type?: string;
  title?: string;
  identifier?: string;
  value?: any;
  unit?: string;
  baseline_or_target?: any;
  trend?: string;
  timestamp?: string;
  time_range?: string;
  site?: string;
  asset_id?: string;
  asset_name?: string;
  severity?: string;
  evidence?: Record<string, any>;
  series?: ChartSeriesInfo[];
  additional_context?: string;
  [key: string]: any;
}

export interface ExplainRequest {
  context: ExplainContext;
  user_question?: string;
}

export interface ExplainResponse {
  summary: string;
  what_it_means: string;
  why_it_matters: string;
  observed_evidence: string[];
  possible_causes: string[];
  recommended_actions: string[];
  caveats: string[];
  data_freshness: string;
  model_name: string;
  is_grounded: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  current_plant?: string;
  selected_asset?: string;
  active_context?: ExplainContext;
  stream?: boolean;
}

export interface ChatResponse {
  message: ChatMessage;
  model_name: string;
  relevant_references?: string[];
}

export interface AIStatusResponse {
  status: string;
  ollama_url: string;
  active_model: string;
  available_models: string[];
  is_local: boolean;
  gpu_accelerated: boolean;
  provider: string;
}

export async function fetchAiStatus(): Promise<AIStatusResponse> {
  const res = await fetch(`${API_BASE}/api/v1/ai/status`);
  if (!res.ok) {
    throw new Error(`Failed to fetch AI status: ${res.statusText}`);
  }
  return res.json();
}

export async function explainElement(
  request: ExplainRequest,
  signal?: AbortSignal
): Promise<ExplainResponse> {
  const res = await fetch(`${API_BASE}/api/v1/ai/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Explanation request failed (${res.status})`);
  }
  return res.json();
}

export async function sendChatMessage(
  request: ChatRequest,
  signal?: AbortSignal
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/v1/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Chat request failed (${res.status})`);
  }
  return res.json();
}

export async function streamChatMessage(
  request: ChatRequest,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: any) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/ai/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`Streaming failed with status: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.replace('data: ', '').trim());
            if (data.token) {
              onToken(data.token);
            }
            if (data.done) {
              onDone();
              return;
            }
          } catch {
            // Ignore parse errors on partial chunks
          }
        }
      }
    }
    onDone();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      onDone();
      return;
    }
    onError(err);
  }
}
