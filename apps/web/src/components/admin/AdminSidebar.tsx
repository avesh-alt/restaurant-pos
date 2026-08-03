import type { ChangeEvent, ReactElement } from "react";

export interface Branch {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface SessionUser {
  id: string;
  restaurantId: string | undefined;
  branchId: string | undefined;
  role: string;
  email: string;
}

export type AdminSection = "overview" | "menu" | "tables" | "orders" | "billing" | "settings";

interface AdminSidebarProps {
  user: SessionUser;
  restaurantName?: string;
  branches: Branch[];
  activeBranchId: string | null;
  branchLoading: boolean;
  activeSection: AdminSection;
  onNavigate: (section: AdminSection) => void;
  onBranchChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onOrdersView: () => void;
  onSignOut: () => void;
}

function IconGrid() {
  return (
    <svg className="sb-nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="5.5" height="5.5" rx="1.5" />
      <rect x="10.5" y="2" width="5.5" height="5.5" rx="1.5" />
      <rect x="2" y="10.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1.5" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg className="sb-nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M9 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z" />
      <path d="M9 6v3l1.5 1.5" />
      <path d="M3 9h2M13 9h2" />
    </svg>
  );
}

function IconTable() {
  return (
    <svg className="sb-nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="14" height="14" rx="2" />
      <path d="M9 2v14M2 9h14" />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg className="sb-nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="1.5" width="12" height="15" rx="2" />
      <path d="M6 5.5h6M6 8.5h6M6 11.5h4" />
    </svg>
  );
}

function IconBilling() {
  return (
    <svg className="sb-nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="14" height="10" rx="2" />
      <path d="M2 7h14" />
      <path d="M5.5 11h2M10 11h2.5" />
    </svg>
  );
}

function IconFloor() {
  return (
    <svg className="sb-nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2h6v6H2zM10 2h6v6h-6zM2 10h6v6H2zM10 10h6v6h-6z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="sb-nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="2.5" />
      <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.6 3.6l1.4 1.4M13 13l1.4 1.4M3.6 14.4l1.4-1.4M13 5l1.4-1.4" />
    </svg>
  );
}

function IconSignOut() {
  return (
    <svg style={{ width: 14, height: 14 }} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 3H13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2.5M6.5 5.5 4 8l2.5 2.5M4 8h7" />
    </svg>
  );
}

const NAV_ITEMS: { id: AdminSection; label: string; Icon: () => ReactElement }[] = [
  { id: "overview",  label: "Overview", Icon: IconGrid },
  { id: "menu",      label: "Menu",     Icon: IconMenu },
  { id: "tables",    label: "Tables",   Icon: IconTable },
  { id: "orders",    label: "Orders",   Icon: IconOrders },
  { id: "billing",   label: "Billing",  Icon: IconBilling },
  { id: "settings",  label: "Settings", Icon: IconSettings },
];

export function AdminSidebar({
  user,
  restaurantName = "Restaurant",
  branches,
  activeBranchId,
  branchLoading,
  activeSection,
  onNavigate,
  onBranchChange,
  onOrdersView,
  onSignOut,
}: AdminSidebarProps) {
  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <aside className="admin-sidebar">
      {/* Brand */}
      <div className="sb-brand">
        <div className="sb-brand__icon">POS</div>
        <div className="sb-brand__text">
          <div className="sb-brand__name">{restaurantName}</div>
          <div className="sb-brand__sub">Admin Panel</div>
        </div>
      </div>

      {/* Branch selector */}
      {user.restaurantId && branches.length > 0 && (
        <div className="sb-branch">
          <label className="sb-branch__label">Branch</label>
          <select
            className="sb-branch__select"
            value={activeBranchId ?? ""}
            onChange={onBranchChange}
            disabled={branchLoading || branches.length === 0}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Nav */}
      <nav className="sb-nav">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`sb-nav-item${activeSection === id ? " sb-nav-item--active" : ""}`}
            onClick={() => onNavigate(id)}
          >
            <Icon />
            {label}
          </button>
        ))}

        <div className="sb-divider" />

        <button type="button" className="sb-nav-item" onClick={onOrdersView}>
          <IconFloor />
          Table View
        </button>
      </nav>

      {/* Footer */}
      <div className="sb-footer">
        <div className="sb-user">
          <div className="sb-user__avatar">{initials}</div>
          <div className="sb-user__info">
            <div className="sb-user__name">{user.email}</div>
            <div className="sb-user__role">{user.role}</div>
          </div>
        </div>
        <div className="sb-footer__actions">
          <button type="button" className="sb-action sb-action--danger" onClick={onSignOut}>
            <IconSignOut /> Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
