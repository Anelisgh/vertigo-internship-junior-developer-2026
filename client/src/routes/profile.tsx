import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, UserBet, PaginatedResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/pagination";
import { useSSE } from "@/hooks/useSSE";
import {
  User,
  Wallet,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Key,
  Eye,
  EyeOff,
  Copy,
  Clock,
  Archive,
} from "lucide-react";

// ─── Bet row ──────────────────────────────────────────────────────────────────
function BetRow({ bet }: { bet: UserBet }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{bet.marketTitle}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Bet on: <span className="font-medium text-foreground">{bet.outcomeTitle}</span>
        </p>
        {bet.createdAt && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(bet.createdAt).toLocaleDateString()}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold">${bet.amount.toFixed(2)}</p>
        {bet.marketStatus === "active" && bet.odds !== null && (
          <p className="text-xs text-primary tabular-nums">{bet.odds}% odds</p>
        )}
        {bet.marketStatus === "resolved" && (
          <div className="flex flex-col items-end gap-0.5 mt-0.5">
            {bet.won === true ? (
              <>
                <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                  <CheckCircle2 className="h-3 w-3" />
                  Won
                </Badge>
                {bet.payout !== null && (
                  <p className="text-xs text-emerald-600 font-medium">+${bet.payout.toFixed(2)}</p>
                )}
              </>
            ) : bet.won === false ? (
              <Badge variant="secondary" className="gap-1 text-muted-foreground">
                <XCircle className="h-3 w-3" />
                Lost
              </Badge>
            ) : (
              <>
                <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-600 bg-amber-500/10">
                  <Archive className="h-3 w-3" />
                  Refunded
                </Badge>
                <p className="text-xs text-amber-600 font-medium">+${bet.amount.toFixed(2)}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── API Key section ──────────────────────────────────────────────────────────
function ApiKeySection({ hasApiKey }: { hasApiKey: boolean }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentHasKey, setCurrentHasKey] = useState(hasApiKey);

  const generate = async () => {
    if (!confirm("Generate a new API key? Any existing key will be replaced.")) return;
    try {
      setIsGenerating(true);
      const { apiKey: key } = await api.generateApiKey();
      setApiKey(key);
      setShowKey(true);
      setCurrentHasKey(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate key");
    } finally {
      setIsGenerating(false);
    }
  };

  const revoke = async () => {
    if (!confirm("Revoke your API key? Any bots using it will stop working.")) return;
    try {
      setIsRevoking(true);
      await api.revokeApiKey();
      setApiKey(null);
      setCurrentHasKey(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setIsRevoking(false);
    }
  };

  const copyToClipboard = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Key className="h-4 w-4" />
          API Key
        </CardTitle>
        <CardDescription>
          Use your API key to place bets programmatically via{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">X-API-Key</code> header.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {apiKey ? (
          <div className="space-y-2">
            <p className="text-xs text-amber-600 font-medium">
              ⚠️ Save this key — you won't be able to see it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-lg font-mono truncate">
                {showKey ? apiKey : "pm_" + "•".repeat(32)}
              </code>
              <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-1.5">
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
        ) : currentHasKey ? (
          <p className="text-sm text-muted-foreground">
            You have an active API key. Generate a new one to replace it.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No API key yet. Generate one to start.</p>
        )}

        <div className="flex gap-2">
          <Button onClick={generate} disabled={isGenerating || isRevoking} size="sm" className="gap-1.5">
            <Key className="h-4 w-4" />
            {isGenerating ? "Generating…" : currentHasKey ? "Regenerate Key" : "Generate API Key"}
          </Button>
          {currentHasKey && (
            <Button
              variant="outline"
              size="sm"
              onClick={revoke}
              disabled={isRevoking || isGenerating}
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              {isRevoking ? "Revoking…" : "Revoke Key"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type BetTab = "active" | "resolved";

function ProfilePage() {
  const { user, isAuthenticated, isLoading: authLoading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<BetTab>("active");
  const [activeBets, setActiveBets] = useState<PaginatedResponse<UserBet> | null>(null);
  const [resolvedBets, setResolvedBets] = useState<PaginatedResponse<UserBet> | null>(null);
  const [activeLoading, setActiveLoading] = useState(true);
  const [resolvedLoading, setResolvedLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [resolvedPage, setResolvedPage] = useState(1);

  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:4001";

  const loadActiveBets = useCallback(async () => {
    try {
      setActiveLoading(true);
      const data = await api.getUserBets("active", activePage);
      setActiveBets(data);
    } finally {
      setActiveLoading(false);
    }
  }, [activePage]);

  const loadResolvedBets = useCallback(async () => {
    try {
      setResolvedLoading(true);
      const data = await api.getUserBets("resolved", resolvedPage);
      setResolvedBets(data);
    } finally {
      setResolvedLoading(false);
    }
  }, [resolvedPage]);

  useEffect(() => {
    if (isAuthenticated) loadActiveBets();
  }, [isAuthenticated, loadActiveBets]);

  useEffect(() => {
    if (isAuthenticated) loadResolvedBets();
  }, [isAuthenticated, loadResolvedBets]);

  // SSE: refresh active bets when odds update
  useSSE<{ type: string }>(
    isAuthenticated ? `${apiBase}/api/markets/stream` : null,
    () => {
      loadActiveBets();
      refreshUser(); // update balance in nav
    },
  );

  if (authLoading) return null;

  if (!isAuthenticated) {
    navigate({ to: "/auth/login" });
    return null;
  }

  const totalWon =
    resolvedBets?.data.filter((b) => b.won).reduce((sum, b) => sum + (b.payout ?? 0), 0) ?? 0;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-background to-muted/20 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Username</p>
                  <p className="font-semibold">{user?.username}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className="font-semibold text-emerald-600">${user?.balance.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Won</p>
                  <p className="font-semibold text-amber-600">${totalWon.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bets */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">My Bets</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Tab toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden mb-4 w-fit">
              {(["active", "resolved"] as BetTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    tab === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  } ${t === "resolved" ? "border-l border-border" : ""}`}
                >
                  {t}
                  {t === "active" && activeBets && (
                    <span className="ml-1.5 text-xs opacity-70">({activeBets.total})</span>
                  )}
                  {t === "resolved" && resolvedBets && (
                    <span className="ml-1.5 text-xs opacity-70">({resolvedBets.total})</span>
                  )}
                </button>
              ))}
            </div>

            {/* Active bets */}
            {tab === "active" && (
              <>
                {activeLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : activeBets && activeBets.data.length > 0 ? (
                  <div>
                    {activeBets.data.map((bet) => <BetRow key={bet.id} bet={bet} />)}
                    <Pagination
                      page={activeBets.page}
                      totalPages={activeBets.totalPages}
                      onPageChange={setActivePage}
                    />
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No active bets yet.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate({ to: "/" })}>
                      Browse markets
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Resolved bets */}
            {tab === "resolved" && (
              <>
                {resolvedLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : resolvedBets && resolvedBets.data.length > 0 ? (
                  <div>
                    {resolvedBets.data.map((bet) => <BetRow key={bet.id} bet={bet} />)}
                    <Pagination
                      page={resolvedBets.page}
                      totalPages={resolvedBets.totalPages}
                      onPageChange={setResolvedPage}
                    />
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No resolved bets yet.</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* API Key */}
        <ApiKeySection hasApiKey={user?.hasApiKey ?? false} />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});
