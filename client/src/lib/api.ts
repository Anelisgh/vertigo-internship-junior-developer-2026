const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4001";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  totalPages: number;
  total: number;
}

export interface MarketOutcome {
  id: number;
  title: string;
  odds: number;
  totalBets: number;
}

export interface Market {
  id: number;
  title: string;
  description?: string;
  status: "active" | "resolved";
  creator?: string | null;
  createdAt?: string;
  resolvedOutcomeId?: number | null;
  resolvedOutcome?: { id: number; title: string } | null;
  outcomes: MarketOutcome[];
  totalMarketBets: number;
  participantsCount: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  balance: number;
  isAdmin: boolean;
  hasApiKey?: boolean;
  token: string;
}

export interface Bet {
  id: number;
  userId: number;
  marketId: number;
  outcomeId: number;
  amount: number;
  createdAt: string;
  newBalance?: number;
}

export interface UserBet {
  id: number;
  amount: number;
  createdAt: string | null;
  outcomeId: number;
  outcomeTitle: string;
  marketId: number;
  marketTitle: string;
  marketStatus: "active" | "resolved";
  resolvedOutcomeId: number | null;
  odds: number | null;
  won: boolean | null;
  payout: number | null;
}

export interface LeaderboardEntry {
  rank: number;
  id: number;
  username: string;
  balance: number;
}

// ─── API Client ───────────────────────────────────────────────────────────────

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAuthHeader(): Record<string, string> {
    const token = localStorage.getItem("auth_token");
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...this.getAuthHeader(),
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      if (data.errors && Array.isArray(data.errors)) {
        const errorMessage = data.errors
          .map((e: { field: string; message: string }) => `${e.field}: ${e.message}`)
          .join(", ");
        throw new Error(errorMessage);
      }
      throw new Error(data.error || `API Error: ${response.status}`);
    }

    return (data ?? {}) as T;
  }

  // Auth
  async register(username: string, email: string, password: string): Promise<User> {
    return this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    });
  }

  async login(email: string, password: string): Promise<User> {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  // User
  async getMe(): Promise<Omit<User, "token">> {
    return this.request("/api/users/me");
  }

  async getUserBets(
    type: "active" | "resolved" | "all" = "all",
    page = 1,
  ): Promise<PaginatedResponse<UserBet>> {
    return this.request(`/api/users/me/bets?type=${type}&page=${page}`);
  }

  async generateApiKey(): Promise<{ apiKey: string }> {
    return this.request("/api/users/me/api-keys", { method: "POST" });
  }

  async revokeApiKey(): Promise<{ success: boolean }> {
    return this.request("/api/users/me/api-keys", { method: "DELETE" });
  }

  // Markets
  async listMarkets(
    status: "active" | "resolved" = "active",
    page = 1,
    sort = "createdAt",
    order = "desc",
  ): Promise<PaginatedResponse<Market>> {
    return this.request(`/api/markets?status=${status}&page=${page}&sort=${sort}&order=${order}`);
  }

  async getMarket(id: number): Promise<Market> {
    return this.request(`/api/markets/${id}`);
  }

  async createMarket(title: string, description: string, outcomes: string[]): Promise<Market> {
    return this.request("/api/markets", {
      method: "POST",
      body: JSON.stringify({ title, description, outcomes }),
    });
  }

  // Bets
  async placeBet(marketId: number, outcomeId: number, amount: number): Promise<Bet> {
    return this.request(`/api/markets/${marketId}/bets`, {
      method: "POST",
      body: JSON.stringify({ outcomeId, amount }),
    });
  }

  // Admin
  async resolveMarket(marketId: number, outcomeId: number): Promise<{ success: boolean }> {
    return this.request(`/api/markets/${marketId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ outcomeId }),
    });
  }

  async archiveMarket(marketId: number): Promise<{ success: boolean }> {
    return this.request(`/api/markets/${marketId}/archive`, { method: "POST" });
  }

  // Leaderboard
  async getLeaderboard(page = 1): Promise<PaginatedResponse<LeaderboardEntry>> {
    return this.request(`/api/leaderboard?page=${page}`);
  }

  // SSE helpers
  subscribeToMarkets(onUpdate: (payload: { type: string; market: Market }) => void): EventSource {
    const es = new EventSource(`${this.baseUrl}/api/markets/stream`);
    es.onmessage = (e) => {
      try {
        onUpdate(JSON.parse(e.data));
      } catch {
        /* ignore malformed events */
      }
    };
    return es;
  }

  subscribeToMarket(
    id: number,
    onUpdate: (payload: { type: string; market: Market }) => void,
  ): EventSource {
    const es = new EventSource(`${this.baseUrl}/api/markets/${id}/stream`);
    es.onmessage = (e) => {
      try {
        onUpdate(JSON.parse(e.data));
      } catch {
        /* ignore malformed events */
      }
    };
    return es;
  }
}

export const api = new ApiClient(API_BASE_URL);
