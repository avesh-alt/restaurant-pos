import { useCallback, useEffect, useState } from "react";

const API =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://127.0.0.1:4000";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Session {
  token: string;
  email: string;
  role: string;
}

interface Stats {
  restaurants: number;
  users: number;
  orders: number;
  activeOrders: number;
}

interface Branch {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
}

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  _count: { branches: number; users: number; orders: number };
}

interface RestaurantDetail extends Restaurant {
  branches: Branch[];
}

type UserRole =
  | "SUPER_ADMIN"
  | "RESTAURANT_ADMIN"
  | "MANAGER"
  | "CASHIER"
  | "WAITER"
  | "KITCHEN";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  restaurantId: string | null;
  branchId: string | null;
  isActive: boolean;
  createdAt: string;
  restaurant: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
}

type View = "dashboard" | "restaurants" | "users";

// ── API helpers ───────────────────────────────────────────────────────────────

function adminHeaders(session: Session): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`,
  };
}

class UnauthorizedError extends Error {
  constructor() { super("Session expired. Please sign in again."); }
}

function handleApiError(err: unknown, onUnauthorized: () => void, setError: (msg: string) => void) {
  if (err instanceof UnauthorizedError) { onUnauthorized(); return; }
  setError((err as Error).message);
}

async function apiGet<T>(session: Session, path: string): Promise<T> {
  const res = await fetch(`${API}/api/admin${path}`, { headers: adminHeaders(session) });
  if (!res.ok) {
    if (res.status === 401) throw new UnauthorizedError();
    const err = await res.json().catch(() => ({})) as { message?: string; error?: { message?: string } };
    throw new Error(err.error?.message ?? err.message ?? `Request failed: ${res.status}`);
  }
  const data = await res.json() as { data: T };
  return data.data;
}

async function apiPost<T>(session: Session, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}/api/admin${path}`, {
    method: "POST",
    headers: adminHeaders(session),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401) throw new UnauthorizedError();
    const err = await res.json().catch(() => ({})) as { message?: string; error?: { message?: string } };
    throw new Error(err.error?.message ?? err.message ?? `Request failed: ${res.status}`);
  }
  const data = await res.json() as { data: T };
  return data.data;
}

async function apiPatch<T>(session: Session, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}/api/admin${path}`, {
    method: "PATCH",
    headers: adminHeaders(session),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401) throw new UnauthorizedError();
    const err = await res.json().catch(() => ({})) as { message?: string; error?: { message?: string } };
    throw new Error(err.error?.message ?? err.message ?? `Request failed: ${res.status}`);
  }
  const data = await res.json() as { data: T };
  return data.data;
}

async function apiLogin(email: string, password: string): Promise<Session> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json() as {
    user?: { role?: string; email?: string };
    tokens?: { accessToken?: string };
    error?: { message?: string };
    message?: string;
  };
  if (!res.ok) throw new Error(data.error?.message ?? data.message ?? "Login failed");
  if (data.user?.role !== "SUPER_ADMIN") {
    throw new Error("Access denied. Super admin credentials required.");
  }
  return {
    token: data.tokens?.accessToken ?? "",
    email: data.user?.email ?? email,
    role: data.user?.role ?? "",
  };
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
      onLogin(await apiLogin(email, password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand__icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="2" y="6" width="24" height="16" rx="3" />
              <path d="M2 11h24" />
              <path d="M8 16h4M16 16h4" />
            </svg>
          </div>
          <span>Master Admin</span>
        </div>
        <h1>Sign in to your account</h1>
        <p className="login-sub">Super admin access only</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="ma-email">Email address</label>
            <input id="ma-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="admin@example.com" />
          </div>
          <div className="field">
            <label htmlFor="ma-pass">Password</label>
            <input id="ma-pass" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Stat Cards ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent }: { label: string; value: number | string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="stat-card" style={{ "--accent": accent } as React.CSSProperties}>
      <div className="stat-card__icon">{icon}</div>
      <div className="stat-card__body">
        <span className="stat-card__value">{value}</span>
        <span className="stat-card__label">{label}</span>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function DashboardView({ session, onUnauthorized }: { session: Session; onUnauthorized: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    apiGet<Stats>(session, "/stats")
      .then(setStats)
      .catch(err => handleApiError(err, onUnauthorized, setError))
      .finally(() => setLoading(false));
  }, [session, onUnauthorized]);

  return (
    <div className="view">
      <div className="view__header">
        <h2>Dashboard</h2>
        <p className="view__sub">System overview across all restaurants</p>
      </div>

      {loading && <p className="state-msg">Loading…</p>}
      {error && <p className="state-msg state-msg--error">{error}</p>}

      {stats && (
        <div className="stat-grid">
          <StatCard label="Restaurants" value={stats.restaurants} accent="#6366f1"
            icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="7" width="16" height="11" rx="1.5" /><path d="M6 7V5a4 4 0 0 1 8 0v2" /></svg>} />
          <StatCard label="Total Users" value={stats.users} accent="#8b5cf6"
            icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="8" cy="7" r="3" /><path d="M2 17c0-3.3 2.7-6 6-6" /><circle cx="15" cy="8" r="2.5" /><path d="M12 17c0-2.2 1.3-4 3-4s3 1.8 3 4" /></svg>} />
          <StatCard label="Total Orders" value={stats.orders} accent="#06b6d4"
            icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="2" width="14" height="16" rx="1.5" /><path d="M7 7h6M7 10h6M7 13h4" /></svg>} />
          <StatCard label="Active Orders" value={stats.activeOrders} accent="#10b981"
            icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 2v4M10 14v4M2 10h4M14 10h4" /><circle cx="10" cy="10" r="3" /></svg>} />
        </div>
      )}
    </div>
  );
}

// ── Restaurants ───────────────────────────────────────────────────────────────

function RestaurantsView({ session, onUnauthorized }: { session: Session; onUnauthorized: () => void }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<RestaurantDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create restaurant modal
  const [showCreate, setShowCreate] = useState(false);
  const [crName, setCrName] = useState("");
  const [crSlug, setCrSlug] = useState("");
  const [crSubmitting, setCrSubmitting] = useState(false);
  const [crError, setCrError] = useState("");

  // Create branch modal
  const [showBranch, setShowBranch] = useState(false);
  const [brName, setBrName] = useState("");
  const [brCode, setBrCode] = useState("");
  const [brSubmitting, setBrSubmitting] = useState(false);
  const [brError, setBrError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    apiGet<Restaurant[]>(session, "/restaurants")
      .then(setRestaurants)
      .catch(err => handleApiError(err, onUnauthorized, setError))
      .finally(() => setLoading(false));
  }, [session, onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  const openDetail = (id: string) => {
    setDetail(null);
    setDetailLoading(true);
    apiGet<RestaurantDetail>(session, `/restaurants/${id}`)
      .then(setDetail)
      .catch(err => handleApiError(err, onUnauthorized, setError))
      .finally(() => setDetailLoading(false));
  };

  const toggleActive = async (r: Restaurant) => {
    try {
      await apiPatch(session, `/restaurants/${r.id}`, { isActive: !r.isActive });
      load();
      if (detail?.id === r.id) openDetail(r.id);
    } catch (err) { handleApiError(err, onUnauthorized, setError); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCrSubmitting(true); setCrError("");
    try {
      await apiPost(session, "/restaurants", { name: crName.trim(), slug: crSlug.trim() });
      setShowCreate(false); setCrName(""); setCrSlug("");
      load();
    } catch (err) { handleApiError(err, onUnauthorized, setCrError); }
    finally { setCrSubmitting(false); }
  };

  const handleBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setBrSubmitting(true); setBrError("");
    try {
      await apiPost(session, `/restaurants/${detail.id}/branches`, { name: brName.trim(), code: brCode.trim().toUpperCase() });
      setShowBranch(false); setBrName(""); setBrCode("");
      openDetail(detail.id);
    } catch (err) { handleApiError(err, onUnauthorized, setBrError); }
    finally { setBrSubmitting(false); }
  };

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <div className="view">
      <div className="view__header">
        <div>
          <h2>Restaurants</h2>
          <p className="view__sub">{restaurants.length} restaurant{restaurants.length !== 1 ? "s" : ""} registered</p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M7 2v10M2 7h10" /></svg>
          New Restaurant
        </button>
      </div>

      {loading && <p className="state-msg">Loading…</p>}
      {error && <p className="state-msg state-msg--error">{error}</p>}

      <div className="rest-layout">
        {/* List */}
        <div className="rest-list">
          {restaurants.map(r => (
            <div
              key={r.id}
              className={`rest-row ${detail?.id === r.id ? "rest-row--active" : ""} ${!r.isActive ? "rest-row--inactive" : ""}`}
              onClick={() => openDetail(r.id)}
            >
              <div className="rest-row__avatar">{r.name[0]?.toUpperCase()}</div>
              <div className="rest-row__body">
                <span className="rest-row__name">{r.name}</span>
                <span className="rest-row__slug">{r.slug}</span>
              </div>
              <div className="rest-row__meta">
                <span className="chip">{r._count.branches}B</span>
                <span className="chip">{r._count.users}U</span>
                <span className={`badge ${r.isActive ? "badge--green" : "badge--gray"}`}>
                  {r.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          ))}
          {!loading && restaurants.length === 0 && (
            <div className="empty-state">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="4" y="12" width="32" height="24" rx="2" /><path d="M12 12V9a8 8 0 0 1 16 0v3" /></svg>
              <p>No restaurants yet</p>
              <button className="btn btn--primary" onClick={() => setShowCreate(true)}>Add first restaurant</button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {(detail || detailLoading) && (
          <div className="rest-detail">
            {detailLoading && <p className="state-msg">Loading…</p>}
            {detail && !detailLoading && (
              <>
                <div className="rest-detail__head">
                  <div>
                    <h3>{detail.name}</h3>
                    <span className="rest-detail__slug">/{detail.slug}</span>
                  </div>
                  <div className="rest-detail__actions">
                    <button
                      className={`btn ${detail.isActive ? "btn--danger-outline" : "btn--outline"}`}
                      onClick={() => toggleActive(detail)}
                    >
                      {detail.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button className="btn btn--ghost" onClick={() => setDetail(null)}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13" /></svg>
                    </button>
                  </div>
                </div>

                <div className="rest-detail__section">
                  <div className="section-head">
                    <span className="section-title">Branches</span>
                    <button className="btn btn--sm btn--outline" onClick={() => setShowBranch(true)}>
                      <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M7 2v10M2 7h10" /></svg>
                      Add
                    </button>
                  </div>
                  {detail.branches.length === 0 ? (
                    <p className="detail-empty">No branches yet</p>
                  ) : (
                    <ul className="branch-list">
                      {detail.branches.map(b => (
                        <li key={b.id} className="branch-item">
                          <span className="branch-item__name">{b.name}</span>
                          <span className="branch-item__code">{b.code}</span>
                          <span className={`badge ${b.isActive ? "badge--green" : "badge--gray"}`}>
                            {b.isActive ? "Active" : "Inactive"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Create Restaurant Modal */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__head">
              <h3>New Restaurant</h3>
              <button className="btn btn--ghost" onClick={() => setShowCreate(false)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13" /></svg>
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="field">
                <label>Restaurant name</label>
                <input type="text" value={crName} onChange={e => { setCrName(e.target.value); setCrSlug(autoSlug(e.target.value)); }} required placeholder="Spice Garden" autoFocus />
              </div>
              <div className="field">
                <label>URL slug</label>
                <input type="text" value={crSlug} onChange={e => setCrSlug(e.target.value)} required placeholder="spice-garden" pattern="[a-z0-9-]+" />
                <span className="field__hint">Lowercase letters, numbers, hyphens</span>
              </div>
              {crError && <p className="form-error">{crError}</p>}
              <div className="modal__foot">
                <button type="button" className="btn btn--outline" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={crSubmitting}>
                  {crSubmitting ? "Creating…" : "Create Restaurant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Branch Modal */}
      {showBranch && detail && (
        <div className="modal-backdrop" onClick={() => setShowBranch(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__head">
              <h3>Add Branch — {detail.name}</h3>
              <button className="btn btn--ghost" onClick={() => setShowBranch(false)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13" /></svg>
              </button>
            </div>
            <form onSubmit={handleBranch}>
              <div className="field">
                <label>Branch name</label>
                <input type="text" value={brName} onChange={e => setBrName(e.target.value)} required placeholder="Main Branch" autoFocus />
              </div>
              <div className="field">
                <label>Branch code</label>
                <input type="text" value={brCode} onChange={e => setBrCode(e.target.value.toUpperCase())} required placeholder="MAIN" maxLength={20} />
                <span className="field__hint">Short identifier, e.g. MAIN, NORTH, B2</span>
              </div>
              {brError && <p className="form-error">{brError}</p>}
              <div className="modal__foot">
                <button type="button" className="btn btn--outline" onClick={() => setShowBranch(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={brSubmitting}>
                  {brSubmitting ? "Adding…" : "Add Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────

const ALL_ROLES: UserRole[] = ["SUPER_ADMIN", "RESTAURANT_ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN"];

const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: "badge--violet",
  RESTAURANT_ADMIN: "badge--indigo",
  MANAGER: "badge--blue",
  CASHIER: "badge--cyan",
  WAITER: "badge--green",
  KITCHEN: "badge--amber",
};

function UsersView({ session, onUnauthorized }: { session: Session; onUnauthorized: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<UserRole | "">("");
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [fFirst, setFFirst] = useState("");
  const [fLast, setFLast] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fRole, setFRole] = useState<UserRole>("WAITER");
  const [fRestaurant, setFRestaurant] = useState("");
  const [fActive, setFActive] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiGet<User[]>(session, "/users"),
      apiGet<Restaurant[]>(session, "/restaurants"),
    ]).then(([u, r]) => { setUsers(u); setRestaurants(r); })
      .catch(err => handleApiError(err, onUnauthorized, () => {}))
      .finally(() => setLoading(false));
  }, [session, onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setFFirst(""); setFLast(""); setFEmail(""); setFPassword("");
    setFRole("WAITER"); setFRestaurant(""); setFActive(true);
    setSubmitError(""); setShowCreate(true);
  };

  const openEdit = (u: User) => {
    setFFirst(u.firstName); setFLast(u.lastName); setFEmail(u.email); setFPassword("");
    setFRole(u.role); setFRestaurant(u.restaurantId ?? ""); setFActive(u.isActive);
    setSubmitError(""); setEditUser(u);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setSubmitError("");
    try {
      await apiPost(session, "/users", {
        firstName: fFirst.trim(), lastName: fLast.trim(), email: fEmail.trim(),
        password: fPassword, role: fRole,
        restaurantId: fRestaurant || null,
      });
      setShowCreate(false); load();
    } catch (err) { handleApiError(err, onUnauthorized, setSubmitError); }
    finally { setSubmitting(false); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setSubmitting(true); setSubmitError("");
    try {
      await apiPatch(session, `/users/${editUser.id}`, {
        firstName: fFirst.trim(), lastName: fLast.trim(), email: fEmail.trim(),
        role: fRole, restaurantId: fRestaurant || null, isActive: fActive,
      });
      setEditUser(null); load();
    } catch (err) { handleApiError(err, onUnauthorized, setSubmitError); }
    finally { setSubmitting(false); }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    if (q && !`${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q)) return false;
    if (filterRole && u.role !== filterRole) return false;
    return true;
  });

  return (
    <div className="view">
      <div className="view__header">
        <div>
          <h2>Users</h2>
          <p className="view__sub">{users.length} user{users.length !== 1 ? "s" : ""} across all restaurants</p>
        </div>
        <button className="btn btn--primary" onClick={openCreate}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M7 2v10M2 7h10" /></svg>
          New User
        </button>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="5.5" cy="5.5" r="4" /><path d="M8.5 8.5L13 13" /></svg>
          <input type="search" placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value as UserRole | "")}>
          <option value="">All roles</option>
          {ALL_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {loading && <p className="state-msg">Loading…</p>}

      <div className="user-table-wrap">
        <table className="user-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Restaurant</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id}>
                <td className="user-table__name">{u.firstName} {u.lastName}</td>
                <td className="user-table__email">{u.email}</td>
                <td><span className={`badge ${ROLE_COLORS[u.role]}`}>{u.role.replace(/_/g, " ")}</span></td>
                <td className="user-table__restaurant">{u.restaurant?.name ?? <span className="muted">—</span>}</td>
                <td><span className={`badge ${u.isActive ? "badge--green" : "badge--gray"}`}>{u.isActive ? "Active" : "Inactive"}</span></td>
                <td>
                  <button className="btn btn--sm btn--ghost" onClick={() => openEdit(u)}>Edit</button>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="user-table__empty">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      {(showCreate || editUser) && (
        <div className="modal-backdrop" onClick={() => { setShowCreate(false); setEditUser(null); setFFirst(""); setFLast(""); setFEmail(""); setFPassword(""); setFRole("WAITER"); setFRestaurant(""); setFActive(true); setSubmitError(""); }}>
          <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
            <div className="modal__head">
              <h3>{editUser ? `Edit ${editUser.firstName} ${editUser.lastName}` : "New User"}</h3>
              <button className="btn btn--ghost" onClick={() => { setShowCreate(false); setEditUser(null); }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13" /></svg>
              </button>
            </div>
            <form onSubmit={editUser ? handleUpdate : handleCreate}>
              <div className="field-row">
                <div className="field">
                  <label>First name</label>
                  <input type="text" value={fFirst} onChange={e => setFFirst(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Last name</label>
                  <input type="text" value={fLast} onChange={e => setFLast(e.target.value)} required />
                </div>
              </div>
              <div className="field">
                <label>Email address</label>
                <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} required />
              </div>
              {!editUser && (
                <div className="field">
                  <label>Password</label>
                  <input type="password" value={fPassword} onChange={e => setFPassword(e.target.value)} required minLength={6} placeholder="Min 6 characters" />
                </div>
              )}
              <div className="field-row">
                <div className="field">
                  <label>Role</label>
                  <select value={fRole} onChange={e => setFRole(e.target.value as UserRole)}>
                    {ALL_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Restaurant</label>
                  <select value={fRestaurant} onChange={e => setFRestaurant(e.target.value)}>
                    <option value="">— None (Super Admin) —</option>
                    {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              {editUser && (
                <div className="field field--inline">
                  <input type="checkbox" id="u-active" checked={fActive} onChange={e => setFActive(e.target.checked)} />
                  <label htmlFor="u-active">Active account</label>
                </div>
              )}
              {submitError && <p className="form-error">{submitError}</p>}
              <div className="modal__foot">
                <button type="button" className="btn btn--outline" onClick={() => { setShowCreate(false); setEditUser(null); }}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={submitting}>
                  {submitting ? "Saving…" : editUser ? "Save Changes" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function Shell({ session, onLogout, onUnauthorized }: { session: Session; onLogout: () => void; onUnauthorized: () => void }) {
  const [view, setView] = useState<View>("dashboard");

  const NAV: { id: View; label: string; icon: React.ReactNode }[] = [
    {
      id: "dashboard", label: "Dashboard",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" /><rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>,
    },
    {
      id: "restaurants", label: "Restaurants",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="6" width="14" height="9" rx="1" /><path d="M4 6V4a4 4 0 0 1 8 0v2" /></svg>,
    },
    {
      id: "users", label: "Users",
      icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="6" cy="5" r="3" /><path d="M1 14c0-2.8 2.2-5 5-5" /><circle cx="12.5" cy="6" r="2.5" /><path d="M10 14c0-1.9 1.1-3.5 2.5-3.5S15 12.1 15 14" /></svg>,
    },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="5" width="16" height="11" rx="1.5" /><path d="M5 5V4a4 4 0 0 1 8 0v1" /></svg>
          </div>
          <div>
            <span className="sidebar__name">Restaurant POS</span>
            <span className="sidebar__role">Master Admin</span>
          </div>
        </div>

        <nav className="sidebar__nav">
          {NAV.map(n => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? "nav-item--active" : ""}`}
              onClick={() => setView(n.id)}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="sidebar__avatar">{session.email[0]?.toUpperCase()}</div>
            <div className="sidebar__user-info">
              <span className="sidebar__user-email">{session.email}</span>
              <span className="sidebar__user-role">Super Admin</span>
            </div>
          </div>
          <button className="btn btn--ghost btn--icon sidebar__logout" onClick={onLogout} title="Sign out">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 2H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h2" />
              <path d="M10 11l4-3.5-4-3.5" />
              <path d="M14 7.5H6" />
            </svg>
          </button>
        </div>
      </aside>

      <main className="content">
        {view === "dashboard" && <DashboardView session={session} onUnauthorized={onUnauthorized} />}
        {view === "restaurants" && <RestaurantsView session={session} onUnauthorized={onUnauthorized} />}
        {view === "users" && <UsersView session={session} onUnauthorized={onUnauthorized} />}
      </main>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const raw = localStorage.getItem("ma_session");
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch { return null; }
  });

  const handleLogin = (s: Session) => {
    localStorage.setItem("ma_session", JSON.stringify(s));
    setSession(s);
  };

  const handleLogout = () => {
    localStorage.removeItem("ma_session");
    setSession(null);
  };

  if (!session) return <LoginScreen onLogin={handleLogin} />;
  return <Shell session={session} onLogout={handleLogout} onUnauthorized={handleLogout} />;
}
