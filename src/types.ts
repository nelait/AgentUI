export interface Me {
  id: string;
  name: string;
  role: string;
  active: boolean;
  grantedScopes: string[];
}

export interface LoginOption {
  id: string;
  name: string;
  role: string;
}

export interface UserRecord {
  id: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
}

export interface RoleDef {
  name: string;
  description: string;
  grants: string[];
}

export type AgentType = 'mock' | 'rest' | 'a2a' | 'mcp' | 'mcp-llm';

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  type: AgentType;
  connection: { endpoint?: string; authToken?: string; authScheme?: 'bearer' | 'api-key' };
  toolScopes: string[];
  allowedRoles: string[];
  enabled: boolean;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  agentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  traceId?: string;
  dlpActions: string[];
  createdAt: string;
}

export interface TraceSummary {
  traceId: string;
  sessionId: string;
  agentId: string;
  startedAt: string;
  durationMs: number;
  status: string;
  spanCount: number;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startedAt: string;
  durationMs: number;
  status: string;
  attributes: Record<string, string>;
}

export interface DlpEvent {
  id: string;
  createdAt: string;
  sessionId: string;
  agentId: string;
  userId: string;
  direction: 'inbound' | 'outbound';
  detector: string;
  action: 'redact' | 'block';
  sample: string;
}

export interface ToolScope {
  name: string;
  description: string;
  sensitive: boolean;
}

export interface ReportSummary {
  windowDays: number;
  totals: {
    users: number;
    activeUsers: number;
    agents: number;
    sessions: number;
    messages: number;
    dlpEvents: number;
    emaDenials: number;
    avgLatencyMs: number;
  };
  messagesByDay: { date: string; user: number; assistant: number }[];
  perAgent: {
    agentId: string;
    name: string;
    type: string;
    sessions: number;
    messages: number;
    avgLatencyMs: number;
    emaDenials: number;
    dlpEvents: number;
  }[];
  dlpByDetector: { detector: string; redact: number; block: number }[];
  topUsers: { userId: string; name: string; messages: number }[];
}
