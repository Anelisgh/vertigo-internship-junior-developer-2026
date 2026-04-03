import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, Market, PaginatedResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MarketCard } from "@/components/market-card";
import { Pagination } from "@/components/pagination";
import { useSSE } from "@/hooks/useSSE";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Plus, ArrowUpDown } from "lucide-react";

const SORT_OPTIONS = [
  { value: "createdAt", label: "Newest" },
  { value: "totalBets", label: "Most Bets" },
  { value: "participants", label: "Most Participants" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];
type StatusFilter = "active" | "resolved";

function DashboardPage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState<PaginatedResponse<Market> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("active");
  const [sort, setSort] = useState<SortOption>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const loadMarkets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.listMarkets(status, page, sort, sortDir);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load markets");
    } finally {
      setIsLoading(false);
    }
  }, [status, page, sort, sortDir]);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  // Real-time updates via SSE
  useSSE<{ type: string; market: Market }>(
    isAuthenticated ? `${import.meta.env.VITE_API_URL || "http://localhost:4001"}/api/markets/stream` : null,
    (_payload) => {
      // Refresh the current page when any market updates
      loadMarkets();
    },
  );

  const handleStatusChange = (newStatus: StatusFilter) => {
    setStatus(newStatus);
    setPage(1);
  };

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort);
    setPage(1);
  };

  const toggleSortDir = () => {
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    setPage(1);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <div className="text-center px-4 max-w-md">
          <div className="mb-6 flex justify-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-3 tracking-tight">PredictIt</h1>
          <p className="text-muted-foreground mb-8 text-lg">
            Bet on the future. Win big with prediction markets.
          </p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => navigate({ to: "/auth/login" })} size="lg">
              Login
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/auth/register" })} size="lg">
              Sign Up
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const markets = result?.data ?? [];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-background to-muted/20">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Markets</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back, <span className="font-medium text-foreground">{user?.username}</span>!
            </p>
          </div>
          <Button onClick={() => navigate({ to: "/markets/new" })} className="gap-2 self-start sm:self-auto">
            <Plus className="h-4 w-4" />
            Create Market
          </Button>
        </div>

        {/* Filters & Sort */}
        <div className="flex flex-wrap gap-2 mb-6">
          {/* Status toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => handleStatusChange("active")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                status === "active"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Active
            </button>
            <button
              onClick={() => handleStatusChange("resolved")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-l border-border ${
                status === "resolved"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Resolved
            </button>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggleSortDir}
              className={`p-2 rounded-md transition-all hover:bg-muted ${
                sortDir === "asc" ? "rotate-180" : ""
              }`}
              title={`Sorting ${sortDir === "asc" ? "Ascending" : "Descending"}`}
            >
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            </button>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSortChange(opt.value)}
                className={`px-3 py-2 text-sm rounded-md transition-colors ${
                  sort === opt.value
                    ? "bg-secondary text-secondary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-6">
            {error}
          </div>
        )}

        {/* Results count */}
        {result && !isLoading && (
          <p className="text-sm text-muted-foreground mb-4">
            Showing {markets.length} of {result.total} markets
          </p>
        )}

        {/* Market Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="h-48 pt-6" />
              </Card>
            ))}
          </div>
        ) : markets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <TrendingUp className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground text-lg font-medium">
                No {status} markets yet.
              </p>
              {status === "active" && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => navigate({ to: "/markets/new" })}
                >
                  Create the first market
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {markets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {result && (
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")(
  { component: DashboardPage },
);
