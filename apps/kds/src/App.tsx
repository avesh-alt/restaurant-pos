import { useCallback, useEffect, useRef, useState } from "react";

const API =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://127.0.0.1:4000";
const POLL_INTERVAL = 8000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Session {
  token: string;
  restaurantId: string | null;
  branchId: string | null;
  email: string;
}

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  tableId: string | null;
  branchId: string | null;
  totalAmount: string;
  createdAt: string;
  updatedAt: string;
}

interface OrderItem {
  id: string;
  menuItemId: string;
  quantity: number;
  notes: string | null;
  menuItem: { id: string; name: string; type: string };
}

interface OrderDetail extends OrderSummary {
  items: OrderItem[];
}

interface Table {
  id: string;
  name: string;
  code: string;
}

type KDSStatus = "PLACED" | "IN_PREPARATION" | "READY";

// ── Column metadata ───────────────────────────────────────────────────────────

const KDS_COLS: KDSStatus[] = ["PLACED", "IN_PREPARATION", "READY"];

interface ColMeta {
  label: string;
  accent: string;
  actionLabel: string;
  nextStatus: string;
}

const COL_META: Record<KDSStatus, ColMeta> = {
  PLACED: {
    label: "New Orders",
    accent: "#3b82f6",
    actionLabel: "Start Cooking",
    nextStatus: "IN_PREPARATION",
  },
  IN_PREPARATION: {
    label: "In Kitchen",
    accent: "#f59e0b",
    actionLabel: "Mark Ready",
    nextStatus: "READY",
  },
  READY: {
    label: "Ready to Serve",
    accent: "#22c55e",
    actionLabel: "Mark Served",
    nextStatus: "SERVED",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeaders(session: Session): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`,
  };
  if (session.restaurantId) h["x-restaurant-id"] = session.restaurantId;
  if (session.branchId) h["x-branch-id"] = session.branchId;
  return h;
}

function elapsed(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function urgency(createdAt: string): "ok" | "warn" | "urgent" {
  const mins = (Date.now() - new Date(createdAt).getTime()) / 60000;
  if (mins > 15) return "urgent";
  if (mins > 8) return "warn";
  return "ok";
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function apiLogin(email: string, password: string) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: { message?: string } };
    throw new Error(err.error?.message ?? err.message ?? "Login failed");
  }
  return res.json();
}

async function apiFetchOrders(session: Session): Promise<OrderSummary[]> {
  const res = await fetch(`${API}/api/v1/orders`, {
    headers: authHeaders(session),
  });
  if (!res.ok) throw new Error("Failed to fetch orders");
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? data.orders ?? []);
}

async function apiFetchOrderDetail(
  session: Session,
  orderId: string,
): Promise<OrderDetail> {
  const res = await fetch(`${API}/api/v1/orders/${orderId}`, {
    headers: authHeaders(session),
  });
  if (!res.ok) throw new Error("Failed to fetch order detail");
  const data = await res.json();
  return data.data ?? data;
}

async function apiPatchOrderStatus(
  session: Session,
  orderId: string,
  status: string,
): Promise<void> {
  const res = await fetch(`${API}/api/v1/orders/${orderId}`, {
    method: "PATCH",
    headers: authHeaders(session),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update order status");
}

async function apiFetchTables(session: Session): Promise<Table[]> {
  const res = await fetch(`${API}/api/v1/tables`, {
    headers: authHeaders(session),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? data.tables ?? []);
}

// ── Login Screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // Response shape: { user: { id, restaurantId, branchId, ... }, tokens: { accessToken, ... } }
      const data = await apiLogin(email, password);
      onLogin({
        token: data.tokens.accessToken,
        restaurantId: data.user.restaurantId ?? null,
        branchId: data.user.branchId ?? null,
        email: data.user.email ?? email,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-icon">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="19" stroke="#f59e0b" strokeWidth="1.5" />
            <path
              d="M10 28h20M13 28v-6a7 7 0 0 1 14 0v6"
              stroke="#f59e0b"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="20" cy="14" r="3.5" stroke="#f59e0b" strokeWidth="1.8" />
          </svg>
        </div>
        <h1 className="login-title">Kitchen Display</h1>
        <p className="login-sub">Sign in to view live orders</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="kds-email">Email</label>
            <input
              id="kds-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="chef@restaurant.com"
            />
          </div>
          <div className="login-field">
            <label htmlFor="kds-password">Password</label>
            <input
              id="kds-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading} className="login-btn">
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Order Card ────────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: OrderDetail;
  tableName: string;
  status: KDSStatus;
  onAction: (orderId: string, nextStatus: string) => void;
  actioning: boolean;
}

function OrderCard({
  order,
  tableName,
  status,
  onAction,
  actioning,
}: OrderCardProps) {
  const [, setTick] = useState(0);
  const meta = COL_META[status];
  const urg = urgency(order.createdAt);

  // Tick every 30s so elapsed time stays fresh
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const cssStatus = status.toLowerCase().replace("_", "-");

  return (
    <div
      className={`order-card order-card--${cssStatus} order-card--${urg}`}
      style={{ "--col-accent": meta.accent } as React.CSSProperties}
    >
      {/* Header row */}
      <div className="order-card__head">
        <span className="order-card__num">{order.orderNumber}</span>
        <span className={`order-card__timer order-card__timer--${urg}`}>
          {elapsed(order.createdAt)}
        </span>
        {tableName ? (
          <span className="order-card__table">
            <svg
              width="11"
              height="11"
              viewBox="0 0 12 12"
              fill="currentColor"
            >
              <rect x="0" y="3" width="12" height="3" rx="1" />
              <rect x="1.5" y="6" width="1.5" height="5" rx="0.5" />
              <rect x="9" y="6" width="1.5" height="5" rx="0.5" />
            </svg>
            {tableName}
          </span>
        ) : (
          <span className="order-card__table order-card__table--takeout">
            Takeout
          </span>
        )}
      </div>

      {/* Items */}
      <ul className="order-card__items">
        {order.items.length === 0 ? (
          <li className="order-card__item order-card__item--empty">
            No items
          </li>
        ) : (
          order.items.map((item) => (
            <li key={item.id} className="order-card__item">
              <span className="order-card__qty">{item.quantity}×</span>
              <span className="order-card__name">
                {item.menuItem?.name ?? item.menuItemId}
              </span>
              {item.notes && (
                <span className="order-card__notes">{item.notes}</span>
              )}
            </li>
          ))
        )}
      </ul>

      {/* Action */}
      <button
        className={`order-card__action order-card__action--${cssStatus}`}
        onClick={() => onAction(order.id, meta.nextStatus)}
        disabled={actioning}
      >
        {actioning ? (
          "Updating…"
        ) : (
          <>
            {meta.actionLabel}
            <svg
              width="13"
              height="13"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 7h10M8 3l4 4-4 4" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}

// ── KDS Board ─────────────────────────────────────────────────────────────────

function KDSScreen({
  session,
  onLogout,
}: {
  session: Session;
  onLogout: () => void;
}) {
  const [orders, setOrders] = useState<Record<string, OrderDetail>>({});
  const [tables, setTables] = useState<Record<string, string>>({});
  const [lastPoll, setLastPoll] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const [actioning, setActioning] = useState<Record<string, boolean>>({});
  // Cache of orderId → updatedAt to avoid re-fetching unchanged orders
  const updatedCache = useRef<Record<string, string>>({});

  const fetchOrders = useCallback(async () => {
    setPolling(true);
    try {
      const summaries = await apiFetchOrders(session);
      const kds = summaries.filter((o) =>
        ["PLACED", "IN_PREPARATION", "READY"].includes(o.status),
      );

      // Fetch full details only for orders that are new or have changed
      const toFetch = kds.filter(
        (o) => updatedCache.current[o.id] !== o.updatedAt,
      );
      const settled = await Promise.allSettled(
        toFetch.map((o) => apiFetchOrderDetail(session, o.id)),
      );
      toFetch.forEach((o) => {
        updatedCache.current[o.id] = o.updatedAt;
      });

      // Evict stale cache entries for orders no longer in KDS statuses
      const live = new Set(kds.map((o) => o.id));
      for (const id of Object.keys(updatedCache.current)) {
        if (!live.has(id)) delete updatedCache.current[id];
      }

      setOrders((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          if (!live.has(id)) delete next[id];
        }
        // Merge newly fetched details
        settled.forEach((r) => {
          if (r.status === "fulfilled") next[r.value.id] = r.value;
        });
        return next;
      });
      setLastPoll(Date.now());
    } catch (err) {
      console.error("KDS poll error:", err);
    } finally {
      setPolling(false);
    }
  }, [session]);

  // Bootstrap
  useEffect(() => {
    apiFetchTables(session).then((ts) => {
      const map: Record<string, string> = {};
      ts.forEach((t) => (map[t.id] = t.name));
      setTables(map);
    });
    fetchOrders();
  }, [session, fetchOrders]);

  // Polling loop
  useEffect(() => {
    const t = setInterval(fetchOrders, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchOrders]);

  const handleAction = useCallback(
    async (orderId: string, nextStatus: string) => {
      setActioning((a) => ({ ...a, [orderId]: true }));
      try {
        await apiPatchOrderStatus(session, orderId, nextStatus);
        delete updatedCache.current[orderId];
        const updated = await apiFetchOrderDetail(session, orderId);
        setOrders((prev) => {
          const next = { ...prev };
          if (["PLACED", "IN_PREPARATION", "READY"].includes(updated.status)) {
            next[orderId] = updated;
          } else {
            delete next[orderId];
          }
          return next;
        });
        updatedCache.current[orderId] = updated.updatedAt;
      } catch (err) {
        console.error("KDS action error:", err);
      } finally {
        setActioning((a) => ({ ...a, [orderId]: false }));
      }
    },
    [session],
  );

  const byStatus = KDS_COLS.reduce<Record<KDSStatus, OrderDetail[]>>(
    (acc, s) => {
      acc[s] = Object.values(orders)
        .filter((o) => o.status === s)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      return acc;
    },
    { PLACED: [], IN_PREPARATION: [], READY: [] },
  );

  const totalActive = Object.values(orders).length;
  const urgentCount = Object.values(orders).filter(
    (o) => urgency(o.createdAt) === "urgent",
  ).length;

  return (
    <div className="kds">
      {/* ── Topbar ── */}
      <header className="kds-bar">
        <div className="kds-bar__brand">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <rect x="1" y="4" width="18" height="5" rx="1.5" />
            <path d="M3 9v7M17 9v7M7 9v7M13 9v7" />
          </svg>
          <span>Kitchen Display</span>
        </div>

        <div className="kds-bar__info">
          <span
            className={`kds-bar__dot ${polling ? "kds-bar__dot--busy" : "kds-bar__dot--live"}`}
          />
          <span className="kds-bar__sync">
            {lastPoll
              ? `Synced ${elapsed(new Date(lastPoll).toISOString())} ago`
              : "Loading…"}
          </span>
          <span className="kds-bar__pill">{totalActive} active</span>
          {urgentCount > 0 && (
            <span className="kds-bar__pill kds-bar__pill--urgent">
              {urgentCount} urgent
            </span>
          )}
        </div>

        <div className="kds-bar__actions">
          <button
            className="kds-bar__btn"
            onClick={fetchOrders}
            disabled={polling}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.7 3.8L12.2 3.8L12.2 1.3"/>
              <path d="M6.5 2.2A6 6 0 1 1 12.2 3.8"/>
            </svg>
            Refresh
          </button>
          <button
            className="kds-bar__btn kds-bar__btn--danger"
            onClick={onLogout}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3" />
              <path d="M9 10l4-3-4-3" />
              <path d="M13 7H5" />
            </svg>
            Logout
          </button>
        </div>
      </header>

      {/* ── Board ── */}
      <main className="kds-board">
        {KDS_COLS.map((status) => {
          const meta = COL_META[status];
          const colOrders = byStatus[status];
          return (
            <div
              key={status}
              className="kds-col"
              style={{ "--col-accent": meta.accent } as React.CSSProperties}
            >
              <div className="kds-col__head">
                <span className="kds-col__dot" />
                <span className="kds-col__title">{meta.label}</span>
                <span className="kds-col__count">{colOrders.length}</span>
              </div>

              <div className="kds-col__body">
                {colOrders.length === 0 ? (
                  <div className="kds-col__empty">
                    <svg
                      width="36"
                      height="36"
                      viewBox="0 0 36 36"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    >
                      <circle cx="18" cy="18" r="15" />
                      <path d="M12 18h12M18 12v12" />
                    </svg>
                    <span>Nothing here</span>
                  </div>
                ) : (
                  colOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      tableName={tables[order.tableId ?? ""] ?? ""}
                      status={status}
                      onAction={handleAction}
                      actioning={!!actioning[order.id]}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const raw = localStorage.getItem("kds_session");
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  });

  const handleLogin = (s: Session) => {
    localStorage.setItem("kds_session", JSON.stringify(s));
    setSession(s);
  };

  const handleLogout = () => {
    localStorage.removeItem("kds_session");
    setSession(null);
  };

  if (!session) return <LoginScreen onLogin={handleLogin} />;
  return <KDSScreen session={session} onLogout={handleLogout} />;
}
