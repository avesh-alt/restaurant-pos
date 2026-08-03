import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { AdminSidebar } from "./components/admin/AdminSidebar.js";
import { Button } from "./components/ui/button.js";

/* %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
   Types
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% */

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      getVersion: () => Promise<string>;
      getApiUrl: () => Promise<string>;
      setApiUrl: (url: string) => Promise<{ ok: boolean }>;
      isOnline: () => Promise<boolean>;
      getPendingCount: () => Promise<number>;
      triggerSync: () => Promise<{ ok: boolean }>;
      onNetworkOnline: (cb: () => void) => void;
      onNetworkOffline: (cb: () => void) => void;
      onSyncProgress: (cb: (d: { synced: number; failed: number; remaining: number }) => void) => void;
      onSyncComplete: (cb: (d: { synced: number; failed: number; remaining: number }) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

// When running inside Electron, the local proxy server (port 4001) handles
// both static files AND API calls — so apiBaseUrl is just the same origin.
const apiBaseUrl = window.electronAPI?.isElectron
  ? ""   // same-origin: http://127.0.0.1:4001/api/v1/...
  : (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
    "http://127.0.0.1:4000";

interface SessionUser {
  id: string;
  restaurantId: string | undefined;
  branchId: string | undefined;
  role: string;
  email: string;
}
interface AuthResponse {
  user: SessionUser;
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}
interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
}
interface Branch {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}
interface MenuItem {
  id: string;
  menuCategoryId: string;
  name: string;
  sku: string | null;
  description: string | null;
  type: "FOOD" | "BEVERAGE" | "ADDON";
  price: string;
  taxRate: string;
  isActive: boolean;
}
interface RestaurantTable {
  id: string;
  name: string;
  code: string;
  capacity: number;
  status: string;
  branchId: string | null;
}
interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: string;
  createdAt: string;
  branchId: string | null;
  tableId: string | null;
}
interface OrderDetailItem {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: string;
  taxAmount: string;
  lineTotal: string;
  notes: string | null;
  menuItem: { id: string; name: string; type: MenuItem["type"] };
}
interface OrderDetail extends Order {
  notes: string | null;
  subtotalAmount: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  items: OrderDetailItem[];
}
type InvoiceStatus = "OPEN" | "PAID" | "VOID";
type PaymentMethod = "CASH" | "CARD" | "UPI" | "OTHER";
type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
type WorkspaceView = "admin" | "orders";
type AdminSection = "overview" | "menu" | "tables" | "orders" | "billing" | "settings";

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

interface InvoiceSummary {
  id: string;
  orderId: string;
  branchId: string | null;
  invoiceNumber: string;
  status: InvoiceStatus;
  subtotalAmount: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  paidAmount: string;
  issuedAt: string;
  dueAt: string | null;
  notes: string | null;
}
interface InvoicePayment {
  id: string;
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  paidAt: string;
  notes: string | null;
}
interface InvoiceDetail extends InvoiceSummary {
  restaurantId: string;
  order: OrderDetail;
  payments: InvoicePayment[];
}
interface ListResponse<T> { data: T[] }
interface DetailResponse<T> { data: T }
interface DashboardData {
  menuCategories: MenuCategory[];
  menuItems: MenuItem[];
  tables: RestaurantTable[];
  orders: Order[];
  invoices: InvoiceSummary[];
}
const emptyDashboardData: DashboardData = {
  menuCategories: [], menuItems: [], tables: [], orders: [], invoices: [],
};
interface ApiErrorResponse { error?: { message?: string } }

/* %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
   Utilities
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% */

function buildBranchStorageKey(user: SessionUser): string | null {
  if (!user.restaurantId) return null;
  return `restaurant-pos-active-branch:${user.restaurantId}:${user.id}`;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as ApiErrorResponse;
    return data.error?.message ?? fallback;
  } catch { return fallback; }
}

function buildAuthHeaders(
  accessToken: string | null,
  restaurantId: string,
  branchId?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = { "x-restaurant-id": restaurantId };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (branchId) headers["x-branch-id"] = branchId;
  return headers;
}

function formatMoney(value: string | number | null | undefined): string {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

function getInvoiceDueAmount(invoice: InvoiceSummary | InvoiceDetail | null): string {
  if (!invoice) return "0.00";
  return Math.max(Number(invoice.totalAmount) - Number(invoice.paidAmount), 0).toFixed(2);
}

function generateOrderNumber(branchCode?: string | null): string {
  const now = new Date();
  const d = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
  const t = `${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}${String(now.getSeconds()).padStart(2,"0")}`;
  const b = (branchCode ?? "walkin").replace(/[^a-z0-9]+/gi,"").toUpperCase() || "WALKIN";
  return `ORD-${b}-${d}-${t}-${String(Math.floor(Math.random()*900)+100)}`;
}

function buildRequestInit(headers: Record<string,string>, signal?: AbortSignal): RequestInit {
  return signal ? { headers, signal } : { headers };
}

function orderStatusBadge(status: string) {
  const map: Record<string,string> = {
    DRAFT: "badge-draft", PLACED: "badge-placed",
    IN_PREPARATION: "badge-prep", READY: "badge-ready",
    COMPLETED: "badge-completed", CANCELED: "badge-canceled",
  };
  const label: Record<string,string> = {
    DRAFT: "Draft", PLACED: "Placed",
    IN_PREPARATION: "In Prep", READY: "Ready",
    COMPLETED: "Completed", CANCELED: "Canceled",
  };
  return <span className={`badge ${map[status] ?? "badge-draft"}`}>{label[status] ?? status}</span>;
}

function invoiceBadge(status: InvoiceStatus) {
  const map: Record<InvoiceStatus, string> = { OPEN: "badge-open", PAID: "badge-paid", VOID: "badge-void" };
  return <span className={`badge ${map[status]}`}>{status}</span>;
}

function tableBadge(status: string) {
  const map: Record<string,string> = {
    AVAILABLE: "badge-available", OCCUPIED: "badge-occupied",
    RESERVED: "badge-reserved", OUT_OF_SERVICE: "badge-oos",
  };
  return <span className={`badge ${map[status] ?? "badge-draft"}`}>{status.replace("_"," ")}</span>;
}

function itemTypeBadge(type: MenuItem["type"]) {
  const map: Record<string,string> = { FOOD: "badge-food", BEVERAGE: "badge-beverage", ADDON: "badge-addon" };
  return <span className={`badge ${map[type]}`}>{type}</span>;
}

/* %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
   Section titles
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% */

const SECTION_TITLES: Record<AdminSection, string> = {
  overview: "Overview",
  menu:     "Menu Management",
  tables:   "Table Management",
  orders:   "Orders",
  billing:  "Billing & Invoices",
  settings: "Settings",
};

/* %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
   App
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% */

export function App() {
  /* Auth */
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [loginStatus, setLoginStatus] = useState<string>("");
  const [loginError, setLoginError]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signedInUser, setSignedInUser] = useState<SessionUser | null>(null);

  /* Branches */
  const [branches, setBranches]         = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [branchLoading, setBranchLoading]   = useState(false);

  /* Dashboard */
  const [dashboardData, setDashboardData]     = useState<DashboardData>(emptyDashboardData);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardStatus, setDashboardStatus]   = useState("Waiting for session.");

  /* Navigation */
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() =>
    typeof window !== "undefined" && window.location.hash.startsWith("#orders") ? "orders" : "admin"
  );
  const [adminSection, setAdminSection] = useState<AdminSection>(() => {
    if (typeof window === "undefined") return "overview";
    const [, section] = window.location.hash.split("/");
    return window.location.hash.startsWith("#admin/") && section ? section as AdminSection : "overview";
  });

  /* Theme */
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    (typeof window !== "undefined" ? window.localStorage.getItem("restaurant-pos-theme") ?? "dark" : "dark") as "dark" | "light"
  );

  /* Order workspace (table view) */
  const [cart, setCart]                           = useState<CartItem[]>([]);
  const [itemSearchQuery, setItemSearchQuery]     = useState("");
  const [selectedFloorTableId, setSelectedFloorTableId] = useState<string | null>(null);
  const [tableOrderStatus, setTableOrderStatus]   = useState("");
  const [tableOrderSubmitting, setTableOrderSubmitting] = useState(false);
  const [tableOrders, setTableOrders]                   = useState<Order[]>([]);
  const [existingTableOrder, setExistingTableOrder]     = useState<Order | null>(null);
  const [tableOrderDetail, setTableOrderDetail]         = useState<OrderDetail | null>(null);
  const [tableOrderDetailLoading, setTableOrderDetailLoading] = useState(false);
  const [tableInvoice, setTableInvoice]                 = useState<InvoiceSummary | null>(null);
  const [tableInvoiceLoading, setTableInvoiceLoading]   = useState(false);
  const [tableBillSubmitting, setTableBillSubmitting]   = useState(false);
  const [tableBillModal, setTableBillModal]             = useState<{ tableId: string; tableName: string; orders: Order[] } | null>(null);
  const [billDiscount, setBillDiscount]                 = useState("0");
  const [billDiscountType, setBillDiscountType]         = useState<"flat" | "pct">("flat");
  const [billPayMethod, setBillPayMethod]               = useState<PaymentMethod>("CASH");
  const [billAmtReceived, setBillAmtReceived]           = useState("");
  const [billSubmitting, setBillSubmitting]             = useState(false);
  const [billError, setBillError]                       = useState("");
  const [combinedTableBill, setCombinedTableBill]       = useState<{
    tableName: string;
    invoiceNumbers: string[];
    issuedAt: string;
    rounds: Array<{ orderNumber: string; notes: string | null; items: OrderDetail["items"] }>;
    subtotal: number; tax: number; discount: number; total: number; paid: number;
  } | null>(null);

  /* Category form */
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryName, setCategoryName]           = useState("");
  const [categorySlug, setCategorySlug]           = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState("0");
  const [categoryActive, setCategoryActive]       = useState(true);
  const [categoryStatus, setCategoryStatus]       = useState("");
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [editingCategoryId, setEditingCategoryId]   = useState<string | null>(null);

  /* Menu item form */
  const [showItemModal, setShowItemModal]   = useState(false);
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [itemName, setItemName]             = useState("");
  const [itemSku, setItemSku]               = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemType, setItemType]             = useState<MenuItem["type"]>("FOOD");
  const [itemPrice, setItemPrice]           = useState("");
  const [itemTaxRate, setItemTaxRate]       = useState("0");
  const [itemActive, setItemActive]         = useState(true);
  const [itemStatus, setItemStatus]         = useState("");
  const [itemSubmitting, setItemSubmitting] = useState(false);
  const [editingItemId, setEditingItemId]   = useState<string | null>(null);

  /* Table form */
  const [showTableModal, setShowTableModal]       = useState(false);
  const [tableName, setTableName]                 = useState("");
  const [tableCode, setTableCode]                 = useState("");
  const [tableCapacity, setTableCapacity]         = useState("4");
  const [tableStatusValue, setTableStatusValue]   = useState<RestaurantTable["status"]>("AVAILABLE");
  const [tableQrCodeValue, setTableQrCodeValue]   = useState("");
  const [tableSortOrder, setTableSortOrder]       = useState("0");
  const [tableActive, setTableActive]             = useState(true);
  const [tableStatusMessage, setTableStatusMessage] = useState("");
  const [tableSubmitting, setTableSubmitting]     = useState(false);
  const [editingTableId, setEditingTableId]       = useState<string | null>(null);

  /* Order form */
  const [orderNumber, setOrderNumber]           = useState("");
  const [orderTableId, setOrderTableId]         = useState("");
  const [orderMenuItemId, setOrderMenuItemId]   = useState("");
  const [orderQuantity, setOrderQuantity]       = useState("1");
  const [orderNotes, setOrderNotes]             = useState("");
  const [orderCategoryFilter, setOrderCategoryFilter] = useState("all");
  const [orderStatus, setOrderStatus]           = useState("");
  const [orderSubmitting, setOrderSubmitting]   = useState(false);
  const [showOrderForm, setShowOrderForm]       = useState(false);

  /* Order detail */
  const [selectedOrderId, setSelectedOrderId]       = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder]           = useState<OrderDetail | null>(null);
  const [selectedOrderStatus, setSelectedOrderStatus] = useState("");
  const [selectedOrderLoading, setSelectedOrderLoading] = useState(false);
  const [selectedOrderNotes, setSelectedOrderNotes]     = useState("");
  const [selectedOrderTableId, setSelectedOrderTableId] = useState("");

  /* Invoice */
  const [selectedInvoice, setSelectedInvoice]           = useState<InvoiceDetail | null>(null);
  const [selectedInvoiceStatus, setSelectedInvoiceStatus] = useState("");
  const [selectedInvoiceLoading, setSelectedInvoiceLoading] = useState(false);
  const [invoiceSubmitting, setInvoiceSubmitting]         = useState(false);
  const [paymentSubmitting, setPaymentSubmitting]         = useState(false);
  const [paymentAmount, setPaymentAmount]                 = useState("");
  const [paymentMethod, setPaymentMethod]                 = useState<PaymentMethod>("CASH");
  const [paymentReference, setPaymentReference]           = useState("");
  const [paymentNotes, setPaymentNotes]                   = useState("");
  const [pendingReceiptPrintOrderId, setPendingReceiptPrintOrderId] = useState<string | null>(null);

  /* %%% Effects %%% */

  useEffect(() => {
    const stored = window.localStorage.getItem("restaurant-pos-user");
    if (!stored) return;
    try {
      setSignedInUser(JSON.parse(stored) as SessionUser);
    } catch {
      window.localStorage.removeItem("restaurant-pos-user");
      window.localStorage.removeItem("restaurant-pos-access-token");
      window.localStorage.removeItem("restaurant-pos-refresh-token");
    }
  }, []);

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash.startsWith("#orders")) { setWorkspaceView("orders"); return; }
      setWorkspaceView("admin");
      const [, section] = window.location.hash.split("/");
      setAdminSection(window.location.hash.startsWith("#admin/") && section ? section as AdminSection : "overview");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!signedInUser) return;
    const next = workspaceView === "orders" ? "#orders" : adminSection === "overview" ? "#admin" : `#admin/${adminSection}`;
    if (window.location.hash !== next) window.history.replaceState(null, "", next);
  }, [adminSection, signedInUser, workspaceView]);

  const loadBranches = useCallback(async (signal?: AbortSignal) => {
    const user = signedInUser;
    const restaurantId = user?.restaurantId;
    if (!user || !restaurantId) { setBranches([]); setActiveBranchId(null); return; }
    setBranchLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/branches`,
        buildRequestInit(buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), restaurantId), signal));
      if (!res.ok) throw new Error(await readErrorMessage(res, "Unable to load branches."));
      const json = (await res.json()) as ListResponse<Branch>;
      const nextBranches = json.data;
      const storageKey = buildBranchStorageKey(user);
      const storedBranchId = storageKey ? window.localStorage.getItem(storageKey) : null;
      const branchIds = new Set(nextBranches.map(b => b.id));
      const nextBranchId =
        (storedBranchId && branchIds.has(storedBranchId) && storedBranchId) ||
        (user.branchId && branchIds.has(user.branchId) ? user.branchId : null) ||
        nextBranches[0]?.id || null;
      setBranches(nextBranches);
      setActiveBranchId(nextBranchId);
      if (storageKey && nextBranchId) window.localStorage.setItem(storageKey, nextBranchId);
    } catch (err) {
      if (signal?.aborted) return;
      setBranches([]); setActiveBranchId(null);
    } finally {
      if (!signal?.aborted) setBranchLoading(false);
    }
  }, [signedInUser]);

  const loadDashboardData = useCallback(async (signal?: AbortSignal) => {
    const user = signedInUser;
    const restaurantId = user?.restaurantId;
    if (!user) { setDashboardData(emptyDashboardData); setDashboardStatus("Waiting for session."); return; }
    if (!restaurantId) { setDashboardData(emptyDashboardData); setDashboardStatus("No restaurant assigned."); return; }
    setDashboardLoading(true); setDashboardStatus("Loading...");
    try {
      const headers = buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), restaurantId, activeBranchId);
      const ri = buildRequestInit(headers, signal);
      const [r1, r2, r3, r4, r5] = await Promise.all([
        fetch(`${apiBaseUrl}/api/v1/menu-categories`, ri),
        fetch(`${apiBaseUrl}/api/v1/menu-items`, ri),
        fetch(`${apiBaseUrl}/api/v1/tables`, ri),
        fetch(`${apiBaseUrl}/api/v1/orders`, ri),
        fetch(`${apiBaseUrl}/api/v1/invoices`, ri),
      ]);
      if (!r1.ok || !r2.ok || !r3.ok || !r4.ok || !r5.ok) throw new Error("Failed to load data.");
      const [j1, j2, j3, j4, j5] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json(), r5.json()]);
      setDashboardData({
        menuCategories: (j1 as ListResponse<MenuCategory>).data,
        menuItems:      (j2 as ListResponse<MenuItem>).data,
        tables:         (j3 as ListResponse<RestaurantTable>).data,
        orders:         (j4 as ListResponse<Order>).data,
        invoices:       (j5 as ListResponse<InvoiceSummary>).data,
      });
      setDashboardStatus("Loaded.");
    } catch (err) {
      if (signal?.aborted) return;
      setDashboardData(emptyDashboardData);
      setDashboardStatus(err instanceof Error ? err.message : "Failed.");
    } finally {
      if (!signal?.aborted) setDashboardLoading(false);
    }
  }, [activeBranchId, signedInUser]);

  const loadSelectedInvoice = useCallback(async (orderId: string | null, signal?: AbortSignal) => {
    const user = signedInUser;
    const restaurantId = user?.restaurantId;
    if (!user || !restaurantId || !orderId) {
      setSelectedInvoice(null); setSelectedInvoiceStatus("");
      setPaymentAmount(""); setPaymentMethod("CASH"); setPaymentReference(""); setPaymentNotes("");
      return;
    }
    setSelectedInvoiceLoading(true); setSelectedInvoiceStatus("Loading invoice...");
    try {
      const headers = buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), restaurantId, activeBranchId);
      const res = await fetch(`${apiBaseUrl}/api/v1/invoices?orderId=${encodeURIComponent(orderId)}`, buildRequestInit(headers, signal));
      if (!res.ok) throw new Error(await readErrorMessage(res, "Unable to load invoice."));
      const listJson = (await res.json()) as ListResponse<InvoiceSummary>;
      const summary = listJson.data[0] ?? null;
      if (!summary) {
        setSelectedInvoice(null); setSelectedInvoiceStatus("No invoice issued yet.");
        setPaymentAmount(""); setPaymentMethod("CASH"); setPaymentReference(""); setPaymentNotes("");
        return;
      }
      const detailRes = await fetch(`${apiBaseUrl}/api/v1/invoices/${summary.id}`, buildRequestInit(headers, signal));
      if (!detailRes.ok) throw new Error(await readErrorMessage(detailRes, "Unable to load invoice details."));
      const detailJson = (await detailRes.json()) as DetailResponse<InvoiceDetail>;
      const invoice = detailJson.data;
      setSelectedInvoice(invoice);
      setSelectedInvoiceStatus(`Invoice ${invoice.invoiceNumber}`);
      setPaymentAmount(getInvoiceDueAmount(invoice));
      setPaymentMethod("CASH"); setPaymentReference(""); setPaymentNotes("");
    } catch (err) {
      if (signal?.aborted) return;
      setSelectedInvoice(null);
      setSelectedInvoiceStatus(err instanceof Error ? err.message : "Unable to load invoice.");
    } finally {
      if (!signal?.aborted) setSelectedInvoiceLoading(false);
    }
  }, [activeBranchId, signedInUser]);

  const loadSelectedOrder = useCallback(async (orderId: string | null, signal?: AbortSignal) => {
    const user = signedInUser;
    const restaurantId = user?.restaurantId;
    if (!user || !restaurantId || !orderId) {
      setSelectedOrder(null); setSelectedOrderStatus(""); setSelectedOrderNotes(""); setSelectedOrderTableId("");
      setSelectedInvoice(null); setSelectedInvoiceStatus("");
      setPaymentAmount(""); setPaymentMethod("CASH"); setPaymentReference(""); setPaymentNotes("");
      return;
    }
    setSelectedOrderLoading(true); setSelectedOrderStatus("Loading order...");
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/orders/${orderId}`,
        buildRequestInit(buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), restaurantId, activeBranchId), signal));
      if (!res.ok) throw new Error(await readErrorMessage(res, "Unable to load order."));
      const json = (await res.json()) as { data: OrderDetail };
      setSelectedOrder(json.data);
      setSelectedOrderNotes(json.data.notes ?? "");
      setSelectedOrderTableId(json.data.tableId ?? "");
      setSelectedOrderStatus("Order loaded.");
      await loadSelectedInvoice(orderId, signal);
    } catch (err) {
      if (signal?.aborted) return;
      setSelectedOrder(null); setSelectedInvoice(null);
      setSelectedOrderNotes(""); setSelectedOrderTableId("");
      setSelectedOrderStatus(err instanceof Error ? err.message : "Unable to load order.");
      setSelectedInvoiceStatus("");
    } finally {
      if (!signal?.aborted) setSelectedOrderLoading(false);
    }
  }, [activeBranchId, loadSelectedInvoice, signedInUser]);

  useEffect(() => { const c = new AbortController(); void loadBranches(c.signal); return () => c.abort(); }, [loadBranches]);
  useEffect(() => { const c = new AbortController(); void loadDashboardData(c.signal); return () => c.abort(); }, [loadDashboardData]);
  useEffect(() => { const c = new AbortController(); void loadSelectedOrder(selectedOrderId, c.signal); return () => c.abort(); }, [loadSelectedOrder, selectedOrderId]);

  useEffect(() => {
    if (dashboardData.menuCategories.length === 0) { setItemCategoryId(""); return; }
    const [first] = dashboardData.menuCategories;
    if (first && !dashboardData.menuCategories.some(c => c.id === itemCategoryId)) setItemCategoryId(first.id);
  }, [dashboardData.menuCategories, itemCategoryId]);

  useEffect(() => {
    if (editingCategoryId && !dashboardData.menuCategories.some(c => c.id === editingCategoryId)) {
      setEditingCategoryId(null); setCategoryName(""); setCategorySlug(""); setCategorySortOrder("0"); setCategoryActive(true);
    }
  }, [dashboardData.menuCategories, editingCategoryId]);

  useEffect(() => {
    if (dashboardData.menuItems.length === 0) { setOrderMenuItemId(""); return; }
    const [first] = dashboardData.menuItems;
    if (first && !dashboardData.menuItems.some(i => i.id === orderMenuItemId)) setOrderMenuItemId(first.id);
  }, [dashboardData.menuItems, orderMenuItemId]);

  useEffect(() => {
    if (dashboardData.menuCategories.length === 0) { setOrderCategoryFilter("all"); return; }
    const exists = orderCategoryFilter === "all" || dashboardData.menuCategories.some(c => c.id === orderCategoryFilter);
    if (!exists) setOrderCategoryFilter("all");
  }, [dashboardData.menuCategories, orderCategoryFilter]);

  useEffect(() => {
    if (editingItemId && !dashboardData.menuItems.some(i => i.id === editingItemId)) {
      setEditingItemId(null); setItemCategoryId(""); setItemName(""); setItemSku(""); setItemDescription(""); setItemType("FOOD"); setItemPrice(""); setItemTaxRate("0"); setItemActive(true);
    }
  }, [dashboardData.menuItems, editingItemId]);

  useEffect(() => {
    if (dashboardData.tables.length === 0) { setOrderTableId(""); return; }
    const [first] = dashboardData.tables;
    if (first && !dashboardData.tables.some(t => t.id === orderTableId)) setOrderTableId(first.id);
  }, [dashboardData.tables, orderTableId]);

  useEffect(() => {
    if (editingTableId && !dashboardData.tables.some(t => t.id === editingTableId)) {
      setEditingTableId(null); setTableName(""); setTableCode(""); setTableCapacity("4"); setTableStatusValue("AVAILABLE"); setTableQrCodeValue(""); setTableSortOrder("0"); setTableActive(true);
    }
  }, [dashboardData.tables, editingTableId]);

  useEffect(() => {
    if (!signedInUser) return;
    const branch = branches.find(b => b.id === activeBranchId) ?? null;
    setOrderNumber(generateOrderNumber(branch?.code ?? "walkin"));
  }, [activeBranchId, branches, signedInUser]);

  useEffect(() => { if (selectedInvoice) setPaymentAmount(getInvoiceDueAmount(selectedInvoice)); }, [selectedInvoice]);

  useEffect(() => {
    if (!pendingReceiptPrintOrderId || selectedOrderId !== pendingReceiptPrintOrderId || !selectedInvoice) return;
    const t = window.setTimeout(() => { window.print(); setPendingReceiptPrintOrderId(null); }, 0);
    return () => window.clearTimeout(t);
  }, [pendingReceiptPrintOrderId, selectedInvoice, selectedOrderId]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("restaurant-pos-theme", theme);
  }, [theme]);

  /* When selected floor table changes, collect all active orders (token/round system) */
  useEffect(() => {
    if (!selectedFloorTableId) { setTableOrders([]); setExistingTableOrder(null); return; }
    const active = dashboardData.orders
      .filter(o => o.tableId === selectedFloorTableId && ["DRAFT","PLACED","IN_PREPARATION","READY","SERVED"].includes(o.status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setTableOrders(active);
    setExistingTableOrder(prev => {
      // keep the currently selected order if it's still in the active list
      if (prev && active.find(o => o.id === prev.id)) return prev;
      return active[0] ?? null;
    });
  }, [selectedFloorTableId, dashboardData.orders]);

  /* Load full order detail + invoice when existingTableOrder is known */
  useEffect(() => {
    if (!existingTableOrder || !signedInUser?.restaurantId) {
      setTableOrderDetail(null); setTableInvoice(null); return;
    }
    const c = new AbortController();
    const load = async () => {
      setTableOrderDetailLoading(true);
      try {
        const headers = buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser.restaurantId!, activeBranchId);
        const [rOrder, rInv] = await Promise.all([
          fetch(`${apiBaseUrl}/api/v1/orders/${existingTableOrder.id}`, buildRequestInit(headers, c.signal)),
          fetch(`${apiBaseUrl}/api/v1/invoices?orderId=${existingTableOrder.id}`, buildRequestInit(headers, c.signal)),
        ]);
        if (rOrder.ok) {
          const j = await rOrder.json() as { data: OrderDetail };
          setTableOrderDetail(j.data);
        }
        if (rInv.ok) {
          const j = await rInv.json() as ListResponse<InvoiceSummary>;
          setTableInvoice(j.data[0] ?? null);
        }
      } catch { /* aborted or network error */ }
      finally { if (!c.signal.aborted) setTableOrderDetailLoading(false); }
    };
    void load();
    return () => c.abort();
  }, [existingTableOrder?.id, existingTableOrder?.totalAmount, activeBranchId, signedInUser]);

  /* %%% Auth handlers %%% */

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true); setLoginError(false); setLoginStatus("Signing in...");
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as AuthResponse & { error?: { message?: string } };
      if (!res.ok) throw new Error(data.error?.message ?? "Login failed.");
      window.localStorage.setItem("restaurant-pos-access-token", data.tokens.accessToken);
      window.localStorage.setItem("restaurant-pos-refresh-token", data.tokens.refreshToken);
      window.localStorage.setItem("restaurant-pos-user", JSON.stringify(data.user));
      setSignedInUser(data.user);
      handleAdminSectionNavigate("overview");
      setLoginStatus(`Signed in as ${data.user.email}`);
    } catch (err) {
      setLoginError(true);
      setLoginStatus(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSignOut() {
    const storageKey = signedInUser ? buildBranchStorageKey(signedInUser) : null;
    window.localStorage.removeItem("restaurant-pos-user");
    window.localStorage.removeItem("restaurant-pos-access-token");
    window.localStorage.removeItem("restaurant-pos-refresh-token");
    if (storageKey) window.localStorage.removeItem(storageKey);
    setSignedInUser(null); setWorkspaceView("admin"); setAdminSection("overview");
    window.history.replaceState(null, "", window.location.pathname);
    setPassword(""); setBranches([]); setActiveBranchId(null);
    setDashboardData(emptyDashboardData); setDashboardStatus("Waiting for session.");
    resetCategoryForm(); resetItemForm(); resetTableForm();
    setOrderNumber(""); setOrderTableId(""); setOrderMenuItemId(""); setOrderQuantity("1"); setOrderNotes(""); setOrderStatus("");
    setSelectedOrderId(null); setSelectedOrder(null); setSelectedOrderStatus(""); setSelectedOrderNotes(""); setSelectedOrderTableId("");
    setLoginStatus(""); setLoginError(false);
  }

  function handleBranchChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextBranchId = event.target.value || null;
    setActiveBranchId(nextBranchId);
    if (signedInUser?.restaurantId) {
      const storageKey = buildBranchStorageKey(signedInUser);
      if (storageKey) {
        if (nextBranchId) window.localStorage.setItem(storageKey, nextBranchId);
        else window.localStorage.removeItem(storageKey);
      }
    }
  }

  /* %%% Category form helpers %%% */

  function resetCategoryForm() {
    setCategoryName(""); setCategorySlug(""); setCategorySortOrder("0"); setCategoryActive(true);
    setCategoryStatus(""); setEditingCategoryId(null);
  }

  function openCategoryModal(category?: MenuCategory) {
    if (category) {
      setEditingCategoryId(category.id);
      setCategoryName(category.name); setCategorySlug(category.slug);
      setCategorySortOrder(String(category.sortOrder)); setCategoryActive(category.isActive);
    } else {
      resetCategoryForm();
    }
    setCategoryStatus(""); setShowCategoryModal(true);
  }

  function closeCategoryModal() {
    setShowCategoryModal(false); resetCategoryForm();
  }

  async function handleSaveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCategorySubmitting(true);
    const isEditing = Boolean(editingCategoryId);
    setCategoryStatus(isEditing ? "Updating..." : "Creating...");
    try {
      const res = await fetch(
        isEditing ? `${apiBaseUrl}/api/v1/menu-categories/${editingCategoryId}` : `${apiBaseUrl}/api/v1/menu-categories`,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", ...buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId) },
          body: JSON.stringify({ name: categoryName.trim(), slug: categorySlug.trim() || undefined, sortOrder: Number(categorySortOrder), isActive: categoryActive }),
        }
      );
      if (!res.ok) throw new Error(await readErrorMessage(res, isEditing ? "Unable to update." : "Unable to create."));
      closeCategoryModal();
      await loadDashboardData();
    } catch (err) {
      setCategoryStatus(err instanceof Error ? err.message : "Error.");
    } finally {
      setCategorySubmitting(false);
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!window.confirm("Delete this category?")) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/menu-categories/${categoryId}`, {
        method: "DELETE",
        headers: buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId),
      });
      if (!res.ok && res.status !== 204) throw new Error(await readErrorMessage(res, "Unable to delete."));
      if (editingCategoryId === categoryId) closeCategoryModal();
      await loadDashboardData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete category.");
    }
  }

  /* %%% Menu item form helpers %%% */

  function resetItemForm() {
    setItemName(""); setItemSku(""); setItemDescription(""); setItemType("FOOD");
    setItemPrice(""); setItemTaxRate("0"); setItemActive(true);
    setItemStatus(""); setEditingItemId(null);
  }

  function openItemModal(item?: MenuItem) {
    if (item) {
      setEditingItemId(item.id); setItemCategoryId(item.menuCategoryId);
      setItemName(item.name); setItemSku(item.sku ?? ""); setItemDescription(item.description ?? "");
      setItemType(item.type); setItemPrice(item.price); setItemTaxRate(item.taxRate); setItemActive(item.isActive);
    } else {
      resetItemForm();
      if (dashboardData.menuCategories[0]) setItemCategoryId(dashboardData.menuCategories[0].id);
    }
    setItemStatus(""); setShowItemModal(true);
  }

  function closeItemModal() {
    setShowItemModal(false); resetItemForm();
  }

  async function handleSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setItemSubmitting(true);
    const isEditing = Boolean(editingItemId);
    setItemStatus(isEditing ? "Updating..." : "Creating...");
    try {
      const res = await fetch(
        isEditing ? `${apiBaseUrl}/api/v1/menu-items/${editingItemId}` : `${apiBaseUrl}/api/v1/menu-items`,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", ...buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId) },
          body: JSON.stringify({ menuCategoryId: itemCategoryId, name: itemName.trim(), sku: itemSku.trim() || null, description: itemDescription.trim() || null, type: itemType, price: Number(itemPrice), taxRate: Number(itemTaxRate), isActive: itemActive }),
        }
      );
      if (!res.ok) throw new Error(await readErrorMessage(res, isEditing ? "Unable to update." : "Unable to create."));
      closeItemModal();
      await loadDashboardData();
    } catch (err) {
      setItemStatus(err instanceof Error ? err.message : "Error.");
    } finally {
      setItemSubmitting(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!window.confirm("Delete this menu item?")) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/menu-items/${itemId}`, {
        method: "DELETE",
        headers: buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId),
      });
      if (!res.ok && res.status !== 204) throw new Error(await readErrorMessage(res, "Unable to delete."));
      if (editingItemId === itemId) closeItemModal();
      await loadDashboardData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete item.");
    }
  }

  /* %%% Table form helpers %%% */

  function resetTableForm() {
    setTableName(""); setTableCode(""); setTableCapacity("4"); setTableStatusValue("AVAILABLE");
    setTableQrCodeValue(""); setTableSortOrder("0"); setTableActive(true);
    setTableStatusMessage(""); setEditingTableId(null);
  }

  function openTableModal(table?: RestaurantTable) {
    if (table) {
      setEditingTableId(table.id); setTableName(table.name); setTableCode(table.code);
      setTableCapacity(String(table.capacity)); setTableStatusValue(table.status as RestaurantTable["status"]);
      setTableQrCodeValue(""); setTableSortOrder("0"); setTableActive(true);
    } else {
      resetTableForm();
    }
    setTableStatusMessage(""); setShowTableModal(true);
  }

  function closeTableModal() {
    setShowTableModal(false); resetTableForm();
  }

  async function handleSaveTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTableSubmitting(true);
    const isEditing = Boolean(editingTableId);
    setTableStatusMessage(isEditing ? "Updating..." : "Creating...");
    try {
      const res = await fetch(
        isEditing ? `${apiBaseUrl}/api/v1/tables/${editingTableId}` : `${apiBaseUrl}/api/v1/tables`,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", ...buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId) },
          body: JSON.stringify({ name: tableName.trim(), code: tableCode.trim(), capacity: Number(tableCapacity), status: tableStatusValue, qrCodeValue: tableQrCodeValue.trim() || null, sortOrder: Number(tableSortOrder), isActive: tableActive }),
        }
      );
      if (!res.ok) throw new Error(await readErrorMessage(res, isEditing ? "Unable to update." : "Unable to create."));
      closeTableModal();
      await loadDashboardData();
    } catch (err) {
      setTableStatusMessage(err instanceof Error ? err.message : "Error.");
    } finally {
      setTableSubmitting(false);
    }
  }

  async function handleDeleteTable(tableId: string) {
    if (!window.confirm("Delete this table?")) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/tables/${tableId}`, {
        method: "DELETE",
        headers: buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId),
      });
      if (!res.ok && res.status !== 204) throw new Error(await readErrorMessage(res, "Unable to delete."));
      if (editingTableId === tableId) closeTableModal();
      await loadDashboardData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete table.");
    }
  }

  /* %%% Order handlers %%% */

  async function handleCreateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrderSubmitting(true); setOrderStatus("Creating order...");
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId) },
        body: JSON.stringify({ orderNumber: orderNumber.trim(), tableId: orderTableId || null, status: "DRAFT", notes: orderNotes.trim() || null, items: [{ menuItemId: orderMenuItemId, quantity: Number(orderQuantity) }] }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Unable to create order."));
      setOrderQuantity("1"); setOrderNotes(""); setOrderStatus("Order created.");
      setOrderNumber(generateOrderNumber(branches.find(b => b.id === activeBranchId)?.code ?? "walkin"));
      setShowOrderForm(false);
      await loadDashboardData();
    } catch (err) {
      setOrderStatus(err instanceof Error ? err.message : "Unable to create order.");
    } finally {
      setOrderSubmitting(false);
    }
  }

  async function handleOrderStatusChange(orderId: string, status: Order["status"]) {
    setSelectedOrderStatus("Updating...");
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId) },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Unable to update order."));
      const json = (await res.json()) as { data: OrderDetail };
      setSelectedOrder(json.data);
      setSelectedOrderStatus(`Updated → ${status.replace(/_/g, " ")}`);
      await loadDashboardData();
    } catch (err) {
      setSelectedOrderStatus(err instanceof Error ? err.message : "Unable to update.");
    }
  }

  async function handleOrderNotesSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    setSelectedOrderStatus("Saving...");
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/orders/${selectedOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId) },
        body: JSON.stringify({ notes: selectedOrderNotes.trim() || null, tableId: selectedOrderTableId || null }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Unable to save order."));
      const json = (await res.json()) as { data: OrderDetail };
      setSelectedOrder(json.data); setSelectedOrderStatus("Saved.");
      await loadDashboardData();
    } catch (err) {
      setSelectedOrderStatus(err instanceof Error ? err.message : "Unable to save.");
    }
  }

  /* %%% Cart / table view helpers %%% */

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id);
      if (existing) return prev.map(c => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { menuItemId: item.id, name: item.name, price: Number(item.price), quantity: 1 }];
    });
  }

  function adjustCartQty(menuItemId: string, delta: number) {
    setCart(prev =>
      prev.map(c => c.menuItemId === menuItemId ? { ...c, quantity: c.quantity + delta } : c)
          .filter(c => c.quantity > 0)
    );
  }

  const cartTotal = useMemo(() => cart.reduce((s, c) => s + c.price * c.quantity, 0), [cart]);
  const cartTax   = useMemo(() => cart.reduce((s, c) => {
    const item = dashboardData.menuItems.find(i => i.id === c.menuItemId);
    return s + (c.price * c.quantity * Number(item?.taxRate ?? 0)) / 100;
  }, 0), [cart, dashboardData.menuItems]);

  async function handlePlaceTableOrder() {
    if (cart.length === 0) return;
    const authHeaders = buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId);
    setTableOrderSubmitting(true); setTableOrderStatus("Sending…");
    const appendableStatuses = ["DRAFT", "PLACED", "IN_PREPARATION", "READY"];
    const canAppend = existingTableOrder && appendableStatuses.includes(existingTableOrder.status);
    try {
      if (canAppend) {
        /* %% Add items to the existing order %% */
        const itemsPayload = cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity }));

        /* Try RESTful sub-resource first */
        let res = await fetch(`${apiBaseUrl}/api/v1/orders/${existingTableOrder.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ items: itemsPayload }),
        });

        /* If endpoint doesn't exist, fall back to PATCH with items */
        if (res.status === 404 || res.status === 405) {
          res = await fetch(`${apiBaseUrl}/api/v1/orders/${existingTableOrder.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ items: itemsPayload }),
          });
        }

        if (!res.ok) throw new Error(await readErrorMessage(res, "Unable to add items to order."));
        setCart([]);
        setTableOrderStatus("Items added!");
      } else {
        /* %% Create a new order (no appendable order, or current is SERVED — new round) %% */
        const res = await fetch(`${apiBaseUrl}/api/v1/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            orderNumber: orderNumber.trim(),
            tableId: selectedFloorTableId || null,
            status: "PLACED",
            items: cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
          }),
        });
        if (!res.ok) throw new Error(await readErrorMessage(res, "Unable to place order."));
        setCart([]);
        setTableOrderStatus("Order placed!");
        setOrderNumber(generateOrderNumber(activeBranch?.code ?? "walkin"));
      }
      await loadDashboardData();
    } catch (err) {
      setTableOrderStatus(err instanceof Error ? err.message : "Error.");
    } finally {
      setTableOrderSubmitting(false);
    }
  }

  async function handleIssueBillForTable() {
    if (!existingTableOrder) return;
    setTableBillSubmitting(true); setTableOrderStatus("Issuing bill…");
    const authHeaders = buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId);
    try {
      let invoiceId = tableInvoice?.id;
      if (!invoiceId) {
        const res = await fetch(`${apiBaseUrl}/api/v1/invoices`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ orderId: existingTableOrder.id }),
        });
        if (!res.ok) throw new Error(await readErrorMessage(res, "Unable to issue bill."));
        const j = await res.json() as DetailResponse<InvoiceDetail>;
        setTableInvoice(j.data);
        invoiceId = j.data.id;
        setTableOrderStatus("Bill issued — ready to print.");
      } else {
        setTableOrderStatus("Bill already issued — ready to print.");
      }
      /* Refresh dashboard so billing section shows the new invoice */
      await loadDashboardData();
      /* Print immediately */
      window.setTimeout(() => window.print(), 200);
    } catch (err) {
      setTableOrderStatus(err instanceof Error ? err.message : "Error.");
    } finally {
      setTableBillSubmitting(false);
    }
  }

  function openTableBillModal(tableId: string, tableName: string, orders: Order[]) {
    setBillDiscount("0");
    setBillDiscountType("flat");
    setBillPayMethod("CASH");
    setBillAmtReceived("");
    setBillError("");
    setTableBillModal({ tableId, tableName, orders });
  }

  async function handleSubmitTableBill() {
    if (!tableBillModal) return;
    const { tableId, tableName, orders } = tableBillModal;
    const authHeaders = buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId);

    const combinedTotal = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
    const discountNum = Math.max(0, Number(billDiscount) || 0);
    const discountAmt = billDiscountType === "pct"
      ? (combinedTotal * discountNum) / 100
      : Math.min(discountNum, combinedTotal);
    const finalTotal  = Math.max(0, combinedTotal - discountAmt);

    setBillSubmitting(true); setBillError("");
    try {
      const rounds: { orderNumber: string; notes: string | null; items: OrderDetail["items"] }[] = [];
      let subtotal = 0, tax = 0, totalDiscount = 0, total = 0, paid = 0;
      const invoiceNumbers: string[] = [];
      let issuedAt = new Date().toISOString();

      for (const order of orders) {
        // Proportional discount for this order
        const orderTotal = Number(order.totalAmount);
        const orderDiscount = combinedTotal > 0
          ? parseFloat(((discountAmt * orderTotal) / combinedTotal).toFixed(2))
          : 0;

        // Create invoice (with discount applied); if already exists, reuse it
        let inv = dashboardData.invoices.find(i => i.orderId === order.id);
        if (!inv) {
          const res = await fetch(`${apiBaseUrl}/api/v1/invoices`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ orderId: order.id, discountAmount: orderDiscount }),
          });
          if (!res.ok) throw new Error(await readErrorMessage(res, "Unable to issue invoice."));
          const j = await res.json() as DetailResponse<InvoiceDetail>;
          inv = j.data;
        }

        // Record payment equal to invoice's totalAmount (after discount)
        const due = Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount));
        if (due > 0) {
          const pRes = await fetch(`${apiBaseUrl}/api/v1/invoices/${inv.id}/payments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ amount: due, method: billPayMethod }),
          });
          if (!pRes.ok) throw new Error(await readErrorMessage(pRes, "Unable to record payment."));
          const pj = await pRes.json() as DetailResponse<InvoiceDetail>;
          inv = pj.data;
        }

        // Load full order detail for receipt
        const rOrder = await fetch(`${apiBaseUrl}/api/v1/orders/${order.id}`, buildRequestInit(authHeaders));
        if (!rOrder.ok) throw new Error("Unable to load order details.");
        const { data: detail } = await rOrder.json() as { data: OrderDetail };

        rounds.push({ orderNumber: order.orderNumber, notes: detail.notes, items: detail.items });
        subtotal      += Number(inv.subtotalAmount);
        tax           += Number(inv.taxAmount);
        totalDiscount += Number(inv.discountAmount ?? 0);
        total         += Number(inv.totalAmount);
        paid          += Number(inv.paidAmount);
        invoiceNumbers.push(inv.invoiceNumber);
        issuedAt = inv.issuedAt;
      }

      // Mark all orders COMPLETED
      for (const o of orders) {
        if (!["COMPLETED", "CANCELED"].includes(o.status)) {
          await fetch(`${apiBaseUrl}/api/v1/orders/${o.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ status: "COMPLETED" }),
          });
        }
      }

      setCombinedTableBill({ tableName, invoiceNumbers, issuedAt, rounds, subtotal, tax, discount: totalDiscount, total, paid });
      setTableBillModal(null);
      await loadDashboardData();
      window.setTimeout(() => window.print(), 300);
    } catch (err) {
      setBillError(err instanceof Error ? err.message : "Error processing payment.");
    } finally {
      setBillSubmitting(false);
    }
  }

  async function handleCompleteTable(orders: Order[]) {
    const authHeaders = buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId);
    try {
      for (const o of orders) {
        if (!["COMPLETED", "CANCELED"].includes(o.status)) {
          await fetch(`${apiBaseUrl}/api/v1/orders/${o.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ status: "COMPLETED" }),
          });
        }
      }
      setCombinedTableBill(null);
      await loadDashboardData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error completing table.");
    }
  }

  /* %%% Invoice / payment handlers %%% */

  async function handleCreateInvoice() {
    if (!selectedOrder) return;
    setInvoiceSubmitting(true); setSelectedInvoiceStatus("Issuing invoice...");
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId) },
        body: JSON.stringify({ orderId: selectedOrder.id, notes: selectedOrder.notes }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Unable to create invoice."));
      const json = (await res.json()) as DetailResponse<InvoiceDetail>;
      setSelectedInvoice(json.data);
      setSelectedInvoiceStatus(`Invoice ${json.data.invoiceNumber} issued.`);
      setPaymentAmount(getInvoiceDueAmount(json.data));
      setPaymentMethod("CASH"); setPaymentReference(""); setPaymentNotes("");
    } catch (err) {
      setSelectedInvoiceStatus(err instanceof Error ? err.message : "Unable to create invoice.");
    } finally {
      setInvoiceSubmitting(false);
    }
  }

  async function handleRecordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoice) return;
    setPaymentSubmitting(true); setSelectedInvoiceStatus("Recording payment...");
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/invoices/${selectedInvoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders(window.localStorage.getItem("restaurant-pos-access-token"), signedInUser?.restaurantId ?? "", activeBranchId) },
        body: JSON.stringify({ amount: paymentAmount, method: paymentMethod, reference: paymentReference.trim() || null, notes: paymentNotes.trim() || null }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Unable to record payment."));
      const json = (await res.json()) as DetailResponse<InvoiceDetail>;
      setSelectedInvoice(json.data);
      setSelectedInvoiceStatus(`Payment recorded.`);
      setPaymentAmount(getInvoiceDueAmount(json.data)); setPaymentReference(""); setPaymentNotes("");
    } catch (err) {
      setSelectedInvoiceStatus(err instanceof Error ? err.message : "Unable to record payment.");
    } finally {
      setPaymentSubmitting(false);
    }
  }

  /* %%% Navigation helpers %%% */

  function handleWorkspaceNavigate(nextView: WorkspaceView) {
    setWorkspaceView(nextView);
    window.history.replaceState(null, "", `#${nextView}`);
  }

  function handleAdminSectionNavigate(nextSection: AdminSection) {
    setAdminSection(nextSection); setWorkspaceView("admin");
    window.history.replaceState(null, "", nextSection === "overview" ? "#admin" : `#admin/${nextSection}`);
  }

  function handleOpenOrder(orderId: string) { setPendingReceiptPrintOrderId(null); setSelectedOrderId(orderId); }
  function handlePrintOrderReceipt(orderId: string) { setPendingReceiptPrintOrderId(orderId); setSelectedOrderId(orderId); }

  /* %%% Computed values %%% */

  const activeBranch = useMemo(() => branches.find(b => b.id === activeBranchId) ?? null, [branches, activeBranchId]);

  const printInvoice = useMemo(() => {
    if (selectedInvoice) {
      const tbl = dashboardData.tables.find(t => t.id === selectedInvoice.order.tableId);
      return {
        invoiceNumber: selectedInvoice.invoiceNumber,
        orderNumber:   selectedInvoice.order.orderNumber,
        tableName:     tbl?.name ?? null,
        issuedAt:      selectedInvoice.issuedAt,
        status:        selectedInvoice.status,
        items:         selectedInvoice.order.items,
        subtotal:      selectedInvoice.subtotalAmount,
        tax:           selectedInvoice.taxAmount,
        discount:      selectedInvoice.discountAmount,
        total:         selectedInvoice.totalAmount,
        paid:          selectedInvoice.paidAmount,
        payments:      selectedInvoice.payments,
        orderNotes:    selectedInvoice.order.notes,
      };
    }
    if (tableInvoice && tableOrderDetail) {
      const tbl = dashboardData.tables.find(t => t.id === selectedFloorTableId);
      return {
        invoiceNumber: tableInvoice.invoiceNumber,
        orderNumber:   tableOrderDetail.orderNumber,
        tableName:     tbl?.name ?? null,
        issuedAt:      tableInvoice.issuedAt,
        status:        tableInvoice.status,
        items:         tableOrderDetail.items,
        subtotal:      tableInvoice.subtotalAmount,
        tax:           tableInvoice.taxAmount,
        discount:      tableInvoice.discountAmount,
        total:         tableInvoice.totalAmount,
        paid:          tableInvoice.paidAmount,
        payments:      [] as InvoicePayment[],
        orderNotes:    tableOrderDetail.notes,
      };
    }
    return null;
  }, [selectedInvoice, tableInvoice, tableOrderDetail, dashboardData.tables, selectedFloorTableId]);

  const renderPrintReceipt = () => {
    // Combined table bill (multiple orders) takes priority
    if (combinedTableBill) {
      const cb = combinedTableBill;
      const due = Math.max(cb.total - cb.paid, 0).toFixed(2);
      const dateStr = new Date(cb.issuedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const allItems = cb.rounds.flatMap(r => r.items);
      return (
        <div className="pr" aria-hidden="true">
          <div className="pr-head">
            <div className="pr-biz">{activeBranch?.name ?? "Restaurant"}</div>
            <div className="pr-sub">Tax Invoice / Receipt</div>
          </div>
          <div className="pr-rule" />
          <div className="pr-meta">
            <div><span>Table</span><span>{cb.tableName}</span></div>
            <div><span>Date</span><span>{dateStr}</span></div>
            <div><span>Orders</span><span>{cb.rounds.length}</span></div>
          </div>
          <div className="pr-rule" />
          <div className="pr-items">
            {cb.rounds.map((round, ri) => (
              <div key={ri}>
                {cb.rounds.length > 1 && (
                  <div className="pr-round-hd">{round.orderNumber}</div>
                )}
                {round.items.map(item => (
                  <div key={item.id} className="pr-item">
                    <div className="pr-item__name">{item.menuItem.name}</div>
                    <div className="pr-item__row">
                      <span>{item.quantity} × {formatMoney(item.unitPrice)}</span>
                      <span>{formatMoney(item.lineTotal)}</span>
                    </div>
                    {item.notes && <div className="pr-item__note">✎ {item.notes}</div>}
                  </div>
                ))}
                {round.notes && <div className="pr-order-note">Note: {round.notes}</div>}
              </div>
            ))}
          </div>
          <div className="pr-rule" />
          <div className="pr-totals">
            <div><span>Subtotal</span><span>{formatMoney(cb.subtotal)}</span></div>
            <div><span>Tax</span><span>{formatMoney(cb.tax)}</span></div>
            {cb.discount > 0 && <div><span>Discount</span><span>−{formatMoney(cb.discount)}</span></div>}
          </div>
          <div className="pr-rule pr-rule--bold" />
          <div className="pr-grand"><span>TOTAL</span><span>{formatMoney(cb.total)}</span></div>
          {cb.paid >= cb.total ? (
            <div className="pr-paid-stamp">✓ PAID</div>
          ) : (
            <div className="pr-due"><span>Amount Due</span><span>{formatMoney(due)}</span></div>
          )}
          <div className="pr-rule" />
          <div className="pr-footer">
            <div>Thank you for dining with us!</div>
            <div className="pr-footer__inv">{cb.invoiceNumbers.join(" · ")}</div>
          </div>
        </div>
      );
    }

    if (!printInvoice) return null;
    const due = Math.max(Number(printInvoice.total) - Number(printInvoice.paid), 0).toFixed(2);
    const dateStr = new Date(printInvoice.issuedAt).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    return (
      <div className="pr" aria-hidden="true">
        {/* Header */}
        <div className="pr-head">
          <div className="pr-biz">{activeBranch?.name ?? "Restaurant"}</div>
          <div className="pr-sub">Tax Invoice / Receipt</div>
        </div>
        <div className="pr-rule" />
        {/* Meta */}
        <div className="pr-meta">
          <div><span>Invoice</span><span>{printInvoice.invoiceNumber}</span></div>
          <div><span>Order</span><span>{printInvoice.orderNumber}</span></div>
          {printInvoice.tableName && <div><span>Table</span><span>{printInvoice.tableName}</span></div>}
          <div><span>Date</span><span>{dateStr}</span></div>
        </div>
        <div className="pr-rule" />
        {/* Items */}
        <div className="pr-items">
          {printInvoice.items.map(item => (
            <div key={item.id} className="pr-item">
              <div className="pr-item__name">{item.menuItem.name}</div>
              <div className="pr-item__row">
                <span>{item.quantity} × {formatMoney(item.unitPrice)}</span>
                <span>{formatMoney(item.lineTotal)}</span>
              </div>
              {item.notes && <div className="pr-item__note">✎ {item.notes}</div>}
            </div>
          ))}
        </div>
        {printInvoice.orderNotes && (
          <div className="pr-order-note">Note: {printInvoice.orderNotes}</div>
        )}
        <div className="pr-rule" />
        {/* Totals */}
        <div className="pr-totals">
          <div><span>Subtotal</span><span>{formatMoney(printInvoice.subtotal)}</span></div>
          <div><span>Tax</span><span>{formatMoney(printInvoice.tax)}</span></div>
          {Number(printInvoice.discount) > 0 && (
            <div><span>Discount</span><span>−{formatMoney(printInvoice.discount)}</span></div>
          )}
        </div>
        <div className="pr-rule pr-rule--bold" />
        <div className="pr-grand">
          <span>TOTAL</span>
          <span>{formatMoney(printInvoice.total)}</span>
        </div>
        {printInvoice.status === "PAID" ? (
          <div className="pr-paid-stamp">✓ PAID</div>
        ) : (
          <div className="pr-due">
            <span>Amount Due</span>
            <span>{formatMoney(due)}</span>
          </div>
        )}
        {/* Payments */}
        {printInvoice.payments.length > 0 && (
          <div className="pr-payments">
            {printInvoice.payments.map(p => (
              <div key={p.id}>
                <span>{p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                <span>{formatMoney(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="pr-rule" />
        {/* Footer */}
        <div className="pr-footer">
          <div>Thank you for dining with us!</div>
          <div className="pr-footer__inv">{printInvoice.invoiceNumber}</div>
        </div>
      </div>
    );
  };

  const kpis = useMemo(() => [
    { label: "Categories", value: dashboardData.menuCategories.length, sub: `${dashboardData.menuItems.length} items`, cls: "kpi-card--amber" },
    { label: "Tables",     value: dashboardData.tables.length, sub: `${dashboardData.tables.filter(t => t.status === "AVAILABLE").length} available`, cls: "kpi-card--green" },
    { label: "Orders",     value: dashboardData.orders.length, sub: `${dashboardData.orders.filter(o => o.status === "READY").length} ready`, cls: "kpi-card--blue" },
    { label: "Invoices",   value: dashboardData.invoices.length, sub: `${dashboardData.invoices.filter(i => i.status === "PAID").length} paid`, cls: "" },
  ], [dashboardData]);

  /* %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
     RENDER: Login
  %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% */

  if (!signedInUser) {
    return (
      <main className="login-page">
        <div className="login-box">
          <div className="login-brand">
            <div className="login-brand__logo">R</div>
            <h1 className="login-brand__title">Restaurant POS</h1>
            <p className="login-brand__sub">Admin Panel   Sign in to continue</p>
          </div>

          <div className="login-card">
            {loginStatus && (
              <div className={`login-status${loginError ? " login-status-error" : ""}`}>
                <div className="login-status-dot" />
                {loginStatus}
              </div>
            )}

            <form className="login-form" onSubmit={handleSignIn}>
              <div className="field">
                <label className="field-label" htmlFor="login-email">Email address</label>
                <input
                  id="login-email"
                  className="field-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@restaurant.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  className="field-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" size="lg" full disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  /* %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
     RENDER: Order Workspace (PetPooja-style)
  %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% */

  if (workspaceView === "orders") {
    const searchQuery = itemSearchQuery.toLowerCase().trim();
    const filteredItems = dashboardData.menuItems
      .filter(i => i.isActive)
      .filter(i => orderCategoryFilter === "all" || i.menuCategoryId === orderCategoryFilter)
      .filter(i => !searchQuery || i.name.toLowerCase().includes(searchQuery) || (i.description ?? "").toLowerCase().includes(searchQuery));

    const allTables = dashboardData.tables;
    const occupiedCount = allTables.filter(t =>
      dashboardData.orders.some(o => o.tableId === t.id && ["PLACED","IN_PREPARATION","READY","SERVED"].includes(o.status))
    ).length;
    const availableCount = allTables.filter(t => t.status === "AVAILABLE" &&
      !dashboardData.orders.some(o => o.tableId === t.id && ["PLACED","IN_PREPARATION","READY","SERVED"].includes(o.status))
    ).length;
    const billingCount = dashboardData.orders.filter(o => o.status === "READY").length;

    /* Compute per-table state */
    const tableRows = allTables.map(table => {
      const related = dashboardData.orders
        .filter(o => o.tableId === table.id)
        .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const latest  = related[0] ?? null;
      const openInv = latest ? dashboardData.invoices.find(inv => inv.orderId === latest.id && inv.status === "OPEN") : undefined;

      let state = "Available"; let cls = "available";
      if      (table.status === "OUT_OF_SERVICE")                                         { state = "Out of service"; cls = "muted"; }
      else if (openInv || latest?.status === "READY" || latest?.status === "SERVED")       { state = "Ready to bill";   cls = "billing"; }
      else if (latest?.status === "IN_PREPARATION")                                       { state = "In prep";        cls = "occupied"; }
      else if (latest?.status === "PLACED")                                               { state = "Occupied";       cls = "occupied"; }
      else if (latest?.status === "DRAFT")                                                { state = "Taking order";   cls = "draft"; }
      else if (table.status === "RESERVED")                                               { state = "Reserved";       cls = "reserved"; }
      return { table, latest, openInv, state, cls };
    });

    const selectedTableRow = tableRows.find(r => r.table.id === selectedFloorTableId) ?? null;
    const tableGroups = [
      ...branches
        .map((branch) => {
          const rows = tableRows.filter(row => row.table.branchId === branch.id);
          return rows.length > 0 ? { id: branch.id, title: branch.name, code: branch.code, rows } : null;
        })
        .filter((group): group is { id: string; title: string; code: string; rows: typeof tableRows } => Boolean(group)),
      ...(() => {
        const rows = tableRows.filter(row => !row.table.branchId);
        return rows.length ? [{ id: "unassigned", title: "Unassigned", code: "zone", rows }] : [];
      })(),
    ];

    return (
      <div className="ow-shell">
        {/* %% Top bar %% */}
        <div className="ow-topbar">
          <div className="ow-logo-pill">POS</div>
          <div className="ow-topbar__brand">
            <div className="ow-topbar__branch">{activeBranch?.name ?? "Restaurant"}</div>
            <div className="ow-topbar__eyebrow">Floor board</div>
          </div>

          <div className="ow-topbar__stats">
            <div className="ow-stat-chip ow-stat-chip--green">
              <span className="ow-stat-chip__dot" />
              {availableCount} available
            </div>
            <div className="ow-stat-chip ow-stat-chip--amber">
              <span className="ow-stat-chip__dot" />
              {occupiedCount} occupied
            </div>
            <div className="ow-stat-chip ow-stat-chip--blue">
              <span className="ow-stat-chip__dot" />
              {billingCount} billing
            </div>
          </div>

          <div className="ow-topbar__actions">
            <button type="button" className="ow-topbar-btn" onClick={() => void loadDashboardData()}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9.7 3.8L12.2 3.8L12.2 1.3"/><path d="M6.5 2.2A6 6 0 1 1 12.2 3.8"/></svg>
              Refresh
            </button>
            <button type="button" className="ow-topbar-btn" onClick={() => handleWorkspaceNavigate("admin")}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>
              Admin
            </button>
          </div>
        </div>

        {/* %% Main workspace %% */}
        <div className="ow-workspace">

          {/* LEFT: Floor + Menu */}
          <div className="ow-left">

            {/* Floor section */}
            <div className="ow-floor-section">
              <div className="ow-floor-hd">
                <span className="ow-floor-hd__title">Tables ({allTables.length})</span>
                <div className="ow-legend">
                  <span className="ow-legend-item ow-legend-item--available">Available</span>
                  <span className="ow-legend-item ow-legend-item--occupied">Occupied</span>
                  <span className="ow-legend-item ow-legend-item--billing">Ready to bill</span>
                  <span className="ow-legend-item ow-legend-item--reserved">Reserved</span>
                </div>
              </div>

              {allTables.length === 0 ? (
                <div className="empty" style={{ padding: "18px" }}>
                  <div className="empty__title">No tables. Add them in Admin ! Tables.</div>
                </div>
              ) : (
                <>
                <div className="ow-floor-groups">
                  {tableGroups.map((group) => {
                    const available = group.rows.filter(row => row.cls === "available").length;
                    const occupied = group.rows.filter(row => row.cls === "occupied").length;
                    const billing = group.rows.filter(row => row.cls === "billing").length;
                    const reserved = group.rows.filter(row => row.cls === "reserved").length;
                    return (
                      <section key={group.id} className="ow-floor-group">
                        <div className="ow-floor-group__hd">
                          <div>
                            <div className="ow-floor-group__title">{group.title}</div>
                            <div className="ow-floor-group__sub">{group.code.toUpperCase()}  {group.rows.length} tables</div>
                          </div>
                          <div className="ow-floor-group__stats">
                            <span>{available} free</span>
                            <span>{occupied} busy</span>
                            <span>{billing} bill</span>
                            <span>{reserved} hold</span>
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
                <div className="ow-table-grid">
                  {tableRows.map(({ table, latest, openInv, state, cls }) => {
                    const isSelected = selectedFloorTableId === table.id;
                    return (
                      <button
                        key={table.id}
                        type="button"
                        className={`ow-tbl ow-tbl--${cls}${isSelected ? " ow-tbl--sel" : ""}`}
                        onClick={() => { setSelectedFloorTableId(table.id); setCart([]); setTableOrderStatus(""); }}
                      >
                        <div className="ow-tbl__top">
                          <span className="ow-tbl__name">{table.name}</span>
                          <span className="ow-tbl__seats">{table.capacity} seats</span>
                        </div>
                        <div className={`ow-tbl__state ow-tbl__state--${cls}`}>{state}</div>
                        {(latest || openInv) && (
                          <div className="ow-tbl__order">
                            {openInv ? openInv.invoiceNumber : latest?.orderNumber}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                </>
              )}
            </div>

            {/* Menu section */}
            <div className="ow-menu-section">
              {/* Search + category */}
              <div className="ow-menu-controls">
                                <div className="ow-search-wrap">
                  <span className="ow-search-icon"></span>
                  <input
                    className="ow-search-input"
                    type="search"
                    placeholder="Search items by name..."
                    value={itemSearchQuery}
                    onChange={e => setItemSearchQuery(e.target.value)}
                  />
                  {itemSearchQuery && (
                    <button type="button" className="ow-search-clear" onClick={() => setItemSearchQuery("")}></button>
                  )}
                </div>
                <div className="cat-pills">
                  <button type="button"
                    className={`cat-pill${orderCategoryFilter === "all" ? " cat-pill--active" : ""}`}
                    onClick={() => setOrderCategoryFilter("all")}>All ({dashboardData.menuItems.filter(i => i.isActive).length})</button>
                  {dashboardData.menuCategories.map(cat => {
                    const count = dashboardData.menuItems.filter(i => i.isActive && i.menuCategoryId === cat.id).length;
                    return (
                      <button key={cat.id} type="button"
                        className={`cat-pill${orderCategoryFilter === cat.id ? " cat-pill--active" : ""}`}
                        onClick={() => setOrderCategoryFilter(cat.id)}>
                        {cat.name} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Item grid */}
              <div className="ow-item-grid-wrap">
                {filteredItems.length === 0 ? (
                  <div className="empty">
                    <div className="empty__icon">
                    {itemSearchQuery
                      ? <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      : <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>}
                  </div>
                    <div className="empty__title">{itemSearchQuery ? `No items matching "${itemSearchQuery}"` : "No items in this category"}</div>
                  </div>
                ) : (
                  <div className="ow-item-grid">
                    {filteredItems.map(item => {
                      const inCart = cart.find(c => c.menuItemId === item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`ow-item-card${inCart ? " ow-item-card--in-cart" : ""}`}
                          onClick={() => {
                            if (!selectedFloorTableId) { setTableOrderStatus("Select a table first"); return; }
                            addToCart(item);
                          }}
                        >
                          <div className="ow-item-card__type">{item.type}</div>
                          <div className="ow-item-card__name">{item.name}</div>
                          {item.description && <div className="ow-item-card__desc">{item.description}</div>}
                          <div className="ow-item-card__footer">
                            <span className="ow-item-card__price">{formatMoney(item.price)}</span>
                            {inCart && <span className="ow-item-card__qty">{inCart.quantity}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Order panel */}
          <div className="ow-right">

            {/* Table header */}
            <div className="ow-ticket-hd">
              {selectedTableRow ? (
                <>
                  <div className="ow-ticket-hd__main">
                    <div className="ow-ticket-hd__table">{selectedTableRow.table.name}</div>
                    <div className={`ow-ticket-hd__state ow-ticket-hd__state--${selectedTableRow.cls}`}>{selectedTableRow.state}</div>
                  </div>
                  <div className="ow-ticket-hd__meta">
                    <span>{selectedTableRow.table.capacity} seats  {selectedTableRow.table.code}</span>
                    {(selectedTableRow.latest || selectedTableRow.openInv) && (
                      <span className="ow-order-num">{selectedTableRow.openInv ? selectedTableRow.openInv.invoiceNumber : selectedTableRow.latest?.orderNumber}</span>
                    )}
                    <button type="button" className="ow-close-btn" onClick={() => { setSelectedFloorTableId(null); setCart([]); setTableOrderStatus(""); }}><svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13"/></svg></button>
                  </div>
                </>
              ) : (
                <div className="ow-ticket-hd__empty">
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No table selected</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>Select a table to resume or take an order</div>
                </div>
              )}
            </div>

            {selectedTableRow && (
              <div className="ow-order-panel">

                {/* %% Multi-order picker (token / round system) %% */}
                {tableOrders.length > 1 && (
                  <div className="ow-order-tabs">
                    {tableOrders.map(o => (
                      <button
                        key={o.id}
                        type="button"
                        className={`ow-order-tab${existingTableOrder?.id === o.id ? " ow-order-tab--active" : ""}`}
                        onClick={() => setExistingTableOrder(o)}
                      >
                        <span className="ow-order-tab__num">{o.orderNumber.split("-").slice(-1)[0]}</span>
                        {orderStatusBadge(o.status)}
                        <span className="ow-order-tab__amt">{formatMoney(o.totalAmount)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* %% SECTION 1: Existing order items %% */}
                {existingTableOrder ? (
                  <div className="ow-panel-section">
                    <div className="ow-panel-section__hd">
                      <span>Order</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {orderStatusBadge(existingTableOrder.status)}
                        <span className="ow-order-num">{existingTableOrder.orderNumber}</span>
                      </div>
                    </div>

                    {tableOrderDetailLoading ? (
                      <div className="ow-panel-loading">Loading items…</div>
                    ) : tableOrderDetail ? (
                      <>
                        <ul className="ow-bill-items">
                          {tableOrderDetail.items.map(item => (
                            <li key={item.id} className="ow-bill-item">
                              <span className="ow-bill-item__name">{item.menuItem.name}</span>
                              <span className="ow-bill-item__qty">{item.quantity}</span>
                              <span className="ow-bill-item__total">{formatMoney(item.lineTotal)}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="ow-bill-subtotal">
                          <span>Order total</span>
                          <strong>{formatMoney(tableOrderDetail.totalAmount)}</strong>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <div className="ow-panel-section">
                    <div className="ow-panel-empty-state">
                      <div>No active order</div>
                      <div className="ow-panel-empty-state__sub">Add items below to start one</div>
                    </div>
                  </div>
                )}

                {/* %% SECTION 2: Cart (new items to add / place) %% */}
                <div className="ow-panel-section ow-panel-section--cart">
                  <div className="ow-panel-section__hd">
                    <span>{(existingTableOrder && ["DRAFT","PLACED","IN_PREPARATION","READY"].includes(existingTableOrder.status)) ? "Add items" : "New order"}</span>
                    {!(existingTableOrder && ["DRAFT","PLACED","IN_PREPARATION","READY"].includes(existingTableOrder.status)) && (
                      <span className="ow-order-num">{orderNumber}</span>
                    )}
                  </div>

                  {cart.length === 0 ? (
                    <div className="ow-cart__empty">
                      Tap items from the menu to add them here
                    </div>
                  ) : (
                    <>
                      <ul className="ow-cart__items">
                        {cart.map(c => (
                          <li key={c.menuItemId} className="ow-cart-item">
                            <div className="ow-cart-item__info">
                              <div className="ow-cart-item__name">{c.name}</div>
                              <div className="ow-cart-item__sub">{formatMoney(c.price)} each</div>
                            </div>
                            <div className="ow-cart-item__controls">
                              <button type="button" className="ow-qty-btn" onClick={() => adjustCartQty(c.menuItemId, -1)}>−</button>
                              <span className="ow-qty-val">{c.quantity}</span>
                              <button type="button" className="ow-qty-btn" onClick={() => adjustCartQty(c.menuItemId, +1)}>+</button>
                            </div>
                            <div className="ow-cart-item__total">{formatMoney(c.price * c.quantity)}</div>
                          </li>
                        ))}
                      </ul>

                      <div className="ow-cart-summary">
                        <div className="ow-totals">
                          <div className="ow-totals__row"><span>New items</span><span>{formatMoney(cartTotal)}</span></div>
                          <div className="ow-totals__row"><span>Est. tax</span><span>{formatMoney(cartTax)}</span></div>
                          {existingTableOrder && tableOrderDetail && ["DRAFT","PLACED","IN_PREPARATION","READY"].includes(existingTableOrder.status) && (
                            <div className="ow-totals__row ow-totals__row--big">
                              <span>Running total</span>
                              <span>{formatMoney(Number(tableOrderDetail.totalAmount) + cartTotal + cartTax)}</span>
                            </div>
                          )}
                          {!(existingTableOrder && ["DRAFT","PLACED","IN_PREPARATION","READY"].includes(existingTableOrder.status)) && (
                            <div className="ow-totals__row ow-totals__row--big">
                              <span>Total</span>
                              <span>{formatMoney(cartTotal + cartTax)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* %% Footer actions %% */}
                <div className="ow-panel-footer">
                  {tableOrderStatus && (
                    <div className="ow-order-status">{tableOrderStatus}</div>
                  )}
                  <Button
                    full
                    disabled={tableOrderSubmitting || cart.length === 0}
                    onClick={() => void handlePlaceTableOrder()}
                  >
                    {tableOrderSubmitting
                      ? "Sending…"
                      : (existingTableOrder && ["DRAFT","PLACED","IN_PREPARATION","READY"].includes(existingTableOrder.status))
                        ? `Add ${cart.length} item${cart.length !== 1 ? "s" : ""} to order`
                        : `Place new order (${cart.length} item${cart.length !== 1 ? "s" : ""})`}
                  </Button>
                  {cart.length > 0 && (
                    <Button variant="ghost" full onClick={() => { setCart([]); setTableOrderStatus(""); }}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
     RENDER: Admin sections
  %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% */

  function renderOverview() {
    return (
      <>
        <div className="page-hd">
          <div className="page-hd__text">
            <h2 className="page-hd__title">Dashboard</h2>
            <p className="page-hd__sub">
              {dashboardLoading ? "Loading…" : `Last updated  ${dashboardStatus}`}
            </p>
          </div>
          <div className="page-hd__actions">
            <Button variant="secondary" size="sm" onClick={() => void loadDashboardData()}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9.7 3.8L12.2 3.8L12.2 1.3"/><path d="M6.5 2.2A6 6 0 1 1 12.2 3.8"/></svg>
              Refresh
            </Button>
            <Button size="sm" onClick={() => handleWorkspaceNavigate("orders")}>
              Table view !
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="kpi-grid">
          {kpis.map(k => (
            <div key={k.label} className={`kpi-card ${k.cls}`}>
              <div className="kpi-card__label">{k.label}</div>
              <div className="kpi-card__value">{dashboardLoading ? " " : k.value}</div>
              <div className="kpi-card__sub">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Quick navigation */}
        <div className="quick-nav">
          <button type="button" className="quick-nav-card" onClick={() => handleAdminSectionNavigate("menu")}>
            <div className="quick-nav-card__icon">MN</div>
            <div className="quick-nav-card__title">Menu</div>
            <div className="quick-nav-card__sub">{dashboardData.menuCategories.length} categories | {dashboardData.menuItems.length} items</div>
          </button>
          <button type="button" className="quick-nav-card" onClick={() => handleAdminSectionNavigate("tables")}>
            <div className="quick-nav-card__icon">TB</div>
            <div className="quick-nav-card__title">Tables</div>
            <div className="quick-nav-card__sub">{dashboardData.tables.length} tables configured</div>
          </button>
          <button type="button" className="quick-nav-card" onClick={() => handleAdminSectionNavigate("orders")}>
            <div className="quick-nav-card__icon">OR</div>
            <div className="quick-nav-card__title">Orders</div>
            <div className="quick-nav-card__sub">{dashboardData.orders.filter(o => ["PLACED","IN_PREPARATION","READY"].includes(o.status)).length} active orders</div>
          </button>
          <button type="button" className="quick-nav-card" onClick={() => handleAdminSectionNavigate("billing")}>
            <div className="quick-nav-card__icon">BL</div>
            <div className="quick-nav-card__title">Billing</div>
            <div className="quick-nav-card__sub">{dashboardData.invoices.filter(i => i.status === "OPEN").length} open invoices</div>
          </button>
        </div>

        {/* Recent orders */}
        {dashboardData.orders.length > 0 && (
          <div className="data-card">
            <div className="dc-head">
              <h3 className="dc-head__title">Recent Orders</h3>
              <div className="dc-head__right">
                <span className="dc-count">{dashboardData.orders.length} total</span>
                <Button variant="secondary" size="sm" onClick={() => handleAdminSectionNavigate("orders")}>View all</Button>
              </div>
            </div>
            <div className="dc-body">
              <ul className="dl">
                {dashboardData.orders.slice(0,6).map(order => (
                  <li key={order.id} className="dl-item">
                    <div className="dl-item__main">
                      <div className="dl-item__title">{order.orderNumber}</div>
                      <div className="dl-item__meta">
                        {orderStatusBadge(order.status)}
                        <span>{formatMoney(order.totalAmount)}</span>
                        <span>{new Date(order.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                    <div className="dl-item__actions">
                      <Button variant="secondary" size="sm" onClick={() => { handleAdminSectionNavigate("orders"); handleOpenOrder(order.id); }}>
                        View
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </>
    );
  }

  function renderMenu() {
    return (
      <>
        <div className="page-hd">
          <div className="page-hd__text">
            <h2 className="page-hd__title">Menu Management</h2>
            <p className="page-hd__sub">{dashboardData.menuCategories.length} categories  {dashboardData.menuItems.length} items</p>
          </div>
          <div className="page-hd__actions">
            <Button variant="secondary" size="sm" onClick={() => openCategoryModal()}>+ Category</Button>
            <Button size="sm" onClick={() => openItemModal()} disabled={dashboardData.menuCategories.length === 0}>
              + Menu Item
            </Button>
          </div>
        </div>

        <div className="menu-layout">
          {/* Categories */}
          <div className="data-card">
            <div className="dc-head">
              <h3 className="dc-head__title">Categories</h3>
              <div className="dc-head__right">
                <span className="dc-count">{dashboardData.menuCategories.length}</span>
                <Button variant="secondary" size="sm" onClick={() => openCategoryModal()}>+ Add</Button>
              </div>
            </div>
            <div className="dc-body">
              {dashboardLoading ? (
                <div className="empty"><div className="empty__title">Loading…</div></div>
              ) : dashboardData.menuCategories.length === 0 ? (
                <div className="empty">
                  <div className="empty__icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></div>
                  <div className="empty__title">No categories yet</div>
                  <div className="empty__sub">Add your first category to start building the menu.</div>
                </div>
              ) : (
                <ul className="dl">
                  {dashboardData.menuCategories.map(cat => (
                    <li key={cat.id} className="dl-item">
                      <div className="dl-item__main">
                        <div className="dl-item__title">{cat.name}</div>
                        <div className="dl-item__meta">
                          <span>{cat.slug}</span>
                          <span>Order: {cat.sortOrder}</span>
                          {!cat.isActive && <span className="badge badge-canceled">Inactive</span>}
                        </div>
                      </div>
                      <div className="dl-item__actions">
                        <Button variant="secondary" size="sm" onClick={() => openCategoryModal(cat)}>Edit</Button>
                        <Button variant="danger" size="sm" onClick={() => void handleDeleteCategory(cat.id)}>Del</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Menu Items */}
          <div className="data-card">
            <div className="dc-head">
              <h3 className="dc-head__title">Menu Items</h3>
              <div className="dc-head__right">
                <span className="dc-count">{dashboardData.menuItems.length}</span>
                <Button size="sm" onClick={() => openItemModal()} disabled={dashboardData.menuCategories.length === 0}>
                  + Add
                </Button>
              </div>
            </div>
            <div className="dc-body">
              {dashboardData.menuItems.length === 0 ? (
                <div className="empty">
                  <div className="empty__icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg></div>
                  <div className="empty__title">No menu items yet</div>
                  <div className="empty__sub">
                    {dashboardData.menuCategories.length === 0
                      ? "Create a category first, then add items."
                      : "Click '+ Add' to create your first menu item."}
                  </div>
                </div>
              ) : (
                <ul className="dl">
                  {dashboardData.menuItems.map(item => {
                    const cat = dashboardData.menuCategories.find(c => c.id === item.menuCategoryId);
                    return (
                      <li key={item.id} className="dl-item">
                        <div className="dl-item__main">
                          <div className="dl-item__title">{item.name}</div>
                          <div className="dl-item__meta">
                            {itemTypeBadge(item.type)}
                            <span>{cat?.name ?? "Uncategorized"}</span>
                            <span className="text-amber">{formatMoney(item.price)}</span>
                            {!item.isActive && <span className="badge badge-canceled">Inactive</span>}
                          </div>
                        </div>
                        <div className="dl-item__actions">
                          <Button variant="secondary" size="sm" onClick={() => openItemModal(item)}>Edit</Button>
                          <Button variant="danger" size="sm" onClick={() => void handleDeleteItem(item.id)}>Del</Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  function renderTables() {
    return (
      <>
        <div className="page-hd">
          <div className="page-hd__text">
            <h2 className="page-hd__title">Table Management</h2>
            <p className="page-hd__sub">
              {activeBranch ? `Branch: ${activeBranch.name}` : "All branches"}  {dashboardData.tables.length} tables
            </p>
          </div>
          <div className="page-hd__actions">
            <Button variant="secondary" size="sm" onClick={() => handleWorkspaceNavigate("orders")}>
              Floor view
            </Button>
            <Button size="sm" onClick={() => openTableModal()}>
              + Add Table
            </Button>
          </div>
        </div>

        {dashboardData.tables.length === 0 ? (
          <div className="data-card">
            <div className="empty">
              <div className="empty__icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg></div>
              <div className="empty__title">No tables configured</div>
              <div className="empty__sub">Add tables to start managing your floor.</div>
            </div>
          </div>
        ) : (
          <div className="data-card">
            <div className="dc-head">
              <h3 className="dc-head__title">Tables</h3>
              <span className="dc-count">{dashboardData.tables.length} total</span>
            </div>
            <div className="dc-body--pad">
              <div className="table-grid">
                {dashboardData.tables.map(table => {
                  const statusMap: Record<string,string> = {
                    AVAILABLE: "available", OCCUPIED: "occupied",
                    RESERVED: "reserved", OUT_OF_SERVICE: "muted",
                  };
                  const cls = statusMap[table.status] ?? "available";
                  return (
                    <button key={table.id} type="button"
                      className={`floor-tbl floor-tbl--${cls}`}
                      onClick={() => openTableModal(table)}>
                      <div className="floor-tbl__head">
                        <span className="floor-tbl__name">{table.name}</span>
                        <span className="floor-tbl__cap">{table.capacity} seats</span>
                      </div>
                      {tableBadge(table.status)}
                      <div className="floor-tbl__meta">
                        <span>{table.code}</span>
                        <span style={{ color: "var(--amber)", fontSize: "0.7rem" }}>Edit !</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Table list for details */}
        {dashboardData.tables.length > 0 && (
          <div className="data-card">
            <div className="dc-head">
              <h3 className="dc-head__title">Table Details</h3>
            </div>
            <div className="dc-body">
              <ul className="dl">
                {dashboardData.tables.map(table => (
                  <li key={table.id} className="dl-item">
                    <div className="dl-item__main">
                      <div className="dl-item__title">{table.name}</div>
                      <div className="dl-item__meta">
                        <span>Code: {table.code}</span>
                        <span>{table.capacity} seats</span>
                        {tableBadge(table.status)}
                      </div>
                    </div>
                    <div className="dl-item__actions">
                      <Button variant="secondary" size="sm" onClick={() => openTableModal(table)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => void handleDeleteTable(table.id)}>Del</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </>
    );
  }

  function renderOrders() {
    const activeOrders = dashboardData.orders.filter(o => ["DRAFT","PLACED","IN_PREPARATION","READY","SERVED"].includes(o.status));
    const doneOrders   = dashboardData.orders.filter(o => ["COMPLETED","CANCELED"].includes(o.status));

    return (
      <>
        <div className="page-hd">
          <div className="page-hd__text">
            <h2 className="page-hd__title">Orders</h2>
            <p className="page-hd__sub">{dashboardData.orders.length} total  {activeOrders.length} active</p>
          </div>
          <div className="page-hd__actions">
            <Button variant="secondary" size="sm" onClick={() => void loadDashboardData()}><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9.7 3.8L12.2 3.8L12.2 1.3"/><path d="M6.5 2.2A6 6 0 1 1 12.2 3.8"/></svg> Refresh</Button>
            <Button size="sm" onClick={() => { setShowOrderForm(true); setOrderStatus(""); }}>+ New Order</Button>
          </div>
        </div>

        {/* Active orders */}
        <div className="data-card">
          <div className="dc-head">
            <h3 className="dc-head__title">Active Orders</h3>
            <span className="dc-count">{activeOrders.length}</span>
          </div>
          <div className="dc-body">
            {activeOrders.length === 0 ? (
              <div className="empty">
                <div className="empty__icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg></div>
                <div className="empty__title">No active orders</div>
                <div className="empty__sub">All caught up! New orders will appear here.</div>
              </div>
            ) : (() => {
              // Group active orders by table (token/round system)
              const grouped = new Map<string, { table: typeof dashboardData.tables[0] | undefined; orders: typeof activeOrders }>();
              for (const order of activeOrders) {
                const key = order.tableId ?? "__walkin__";
                if (!grouped.has(key)) {
                  grouped.set(key, { table: dashboardData.tables.find(t => t.id === order.tableId), orders: [] });
                }
                grouped.get(key)!.orders.push(order);
              }
              return (
                <div className="orders-groups">
                  {[...grouped.entries()].map(([key, group]) => {
                    const isTable = !!group.table;
                    const combinedTotal = group.orders.reduce((s, o) => s + Number(o.totalAmount), 0);
                    const hasInvoice = group.orders.some(o => dashboardData.invoices.some(inv => inv.orderId === o.id));
                    const isBilledGroup = combinedTableBill?.tableName === group.table?.name;
                    // Sort tokens oldest-first so Token 1 = first order placed
                    const tokens = [...group.orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                    return (
                      <div key={key} className="orders-group">
                        {/* Group header */}
                        <div className="orders-group__hd">
                          <span className="orders-group__name">
                            {group.table ? group.table.name : "Walk-in"}
                          </span>
                          <span className="orders-group__count">{tokens.length} token{tokens.length !== 1 ? "s" : ""}</span>
                          <span className="orders-group__total">{formatMoney(combinedTotal)}</span>
                          {isTable && (
                            <div className="orders-group__actions">
                              {/* Bill & Print */}
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (hasInvoice) {
                                    // Already billed — just reprint
                                    setCombinedTableBill(prev => prev ?? null);
                                    window.print();
                                  } else {
                                    openTableBillModal(group.table!.id, group.table!.name, group.orders);
                                  }
                                }}
                              >
                                {hasInvoice ? "Reprint Bill" : "Bill & Print"}
                              </Button>
                              {/* Reprint if already printed this session */}
                              {isBilledGroup && hasInvoice && (
                                <Button size="sm" variant="secondary" onClick={() => window.print()}>
                                  Print
                                </Button>
                              )}
                              {/* Complete Table — closes all tokens */}
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void handleCompleteTable(group.orders)}
                              >
                                Complete Table
                              </Button>
                            </div>
                          )}
                        </div>
                        {/* Token rows */}
                        <ul className="dl">
                          {tokens.map((order, idx) => (
                            <li key={order.id} className="dl-item">
                              <div className="dl-item__main">
                                <div className="dl-item__title">
                                  {isTable ? `Token ${idx + 1}` : order.orderNumber}
                                </div>
                                <div className="dl-item__meta">
                                  {orderStatusBadge(order.status)}
                                  <span>{formatMoney(order.totalAmount)}</span>
                                  <span>{new Date(order.createdAt).toLocaleTimeString()}</span>
                                </div>
                              </div>
                              <div className="dl-item__actions">
                                {/* Walk-in orders keep the View button; table tokens don't need it */}
                                {!isTable && (
                                  <Button variant="secondary" size="sm" onClick={() => handleOpenOrder(order.id)}>View</Button>
                                )}
                                {order.status === "DRAFT" && (
                                  <Button size="sm" onClick={() => void handleOrderStatusChange(order.id, "PLACED")}>Place</Button>
                                )}
                                {order.status === "PLACED" && (
                                  <Button size="sm" onClick={() => void handleOrderStatusChange(order.id, "IN_PREPARATION")}>Prep</Button>
                                )}
                                {order.status === "IN_PREPARATION" && (
                                  <Button size="sm" onClick={() => void handleOrderStatusChange(order.id, "READY")}>Ready</Button>
                                )}
                                {/* Complete is table-level for table orders; walk-ins keep per-order Complete */}
                                {!isTable && order.status === "READY" && (
                                  <Button size="sm" onClick={() => void handleOrderStatusChange(order.id, "COMPLETED")}>Complete</Button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Completed orders */}
        {doneOrders.length > 0 && (
          <div className="data-card">
            <div className="dc-head">
              <h3 className="dc-head__title">Completed / Canceled</h3>
              <span className="dc-count">{doneOrders.length}</span>
            </div>
            <div className="dc-body">
              <ul className="dl">
                {doneOrders.slice(0,10).map(order => (
                  <li key={order.id} className="dl-item">
                    <div className="dl-item__main">
                      <div className="dl-item__title">{order.orderNumber}</div>
                      <div className="dl-item__meta">
                        {orderStatusBadge(order.status)}
                        <span>{formatMoney(order.totalAmount)}</span>
                        <span>{new Date(order.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="dl-item__actions">
                      <Button variant="secondary" size="sm" onClick={() => handleOpenOrder(order.id)}>View</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </>
    );
  }

  function renderBilling() {
    const openInvoices = dashboardData.invoices.filter(i => i.status === "OPEN");
    const paidInvoices = dashboardData.invoices.filter(i => i.status === "PAID");

    return (
      <>
        <div className="page-hd">
          <div className="page-hd__text">
            <h2 className="page-hd__title">Billing & Invoices</h2>
            <p className="page-hd__sub">
              {openInvoices.length} open  {paidInvoices.length} paid  {dashboardData.invoices.length} total
            </p>
          </div>
          <div className="page-hd__actions">
            <Button variant="secondary" size="sm" onClick={() => void loadDashboardData()}><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9.7 3.8L12.2 3.8L12.2 1.3"/><path d="M6.5 2.2A6 6 0 1 1 12.2 3.8"/></svg> Refresh</Button>
          </div>
        </div>

        <div className="data-card">
          <div className="dc-head">
            <h3 className="dc-head__title">Open Invoices</h3>
            <span className="dc-count">{openInvoices.length}</span>
          </div>
          <div className="dc-body">
            {openInvoices.length === 0 ? (
              <div className="empty">
                <div className="empty__icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg></div>
                <div className="empty__title">No open invoices</div>
                <div className="empty__sub">All invoices are settled.</div>
              </div>
            ) : (
              <ul className="dl">
                {openInvoices.map(inv => (
                  <li key={inv.id} className="dl-item">
                    <div className="dl-item__main">
                      <div className="dl-item__title">{inv.invoiceNumber}</div>
                      <div className="dl-item__meta">
                        {invoiceBadge(inv.status)}
                        <span>Total: {formatMoney(inv.totalAmount)}</span>
                        <span className="text-danger">Due: {formatMoney(getInvoiceDueAmount(inv))}</span>
                        <span>{new Date(inv.issuedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="dl-item__actions">
                      <Button size="sm" onClick={() => handleOpenOrder(inv.orderId)}>Collect</Button>
                      <Button variant="secondary" size="sm" onClick={() => handlePrintOrderReceipt(inv.orderId)}>Print</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {paidInvoices.length > 0 && (
          <div className="data-card">
            <div className="dc-head">
              <h3 className="dc-head__title">Paid Invoices</h3>
              <span className="dc-count">{paidInvoices.length}</span>
            </div>
            <div className="dc-body">
              <ul className="dl">
                {paidInvoices.slice(0,10).map(inv => (
                  <li key={inv.id} className="dl-item">
                    <div className="dl-item__main">
                      <div className="dl-item__title">{inv.invoiceNumber}</div>
                      <div className="dl-item__meta">
                        {invoiceBadge(inv.status)}
                        <span>{formatMoney(inv.totalAmount)}</span>
                        <span>{new Date(inv.issuedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="dl-item__actions">
                      <Button variant="secondary" size="sm" onClick={() => handleOpenOrder(inv.orderId)}>View</Button>
                      <Button variant="secondary" size="sm" onClick={() => handlePrintOrderReceipt(inv.orderId)}>Print</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </>
    );
  }

  function renderSettings() {
    return (
      <>
        <div className="page-hd">
          <div className="page-hd__text">
            <h2 className="page-hd__title">Settings</h2>
            <p className="page-hd__sub">Customize your POS experience</p>
          </div>
        </div>

        {/* Appearance */}
        <div className="data-card">
          <div className="dc-head">
            <h3 className="dc-head__title">Appearance</h3>
          </div>
          <div className="dc-body" style={{ padding: "20px" }}>
            <div className="settings-section-label">Theme</div>
            <div className="theme-picker">
              <button
                type="button"
                className={`theme-option theme-option--dark${theme === "dark" ? " theme-option--active" : ""}`}
                onClick={() => setTheme("dark")}
              >
                <div className="theme-option__preview theme-preview--dark">
                  <div className="tp-sidebar" />
                  <div className="tp-main">
                    <div className="tp-bar" />
                    <div className="tp-card" />
                  </div>
                </div>
                <div className="theme-option__label">
                  <span className="theme-option__name">Dark</span>
                  <span className="theme-option__desc">Easy on the eyes, great for low-light restaurants</span>
                </div>
                {theme === "dark" && <span className="theme-option__check">✓</span>}
              </button>

              <button
                type="button"
                className={`theme-option theme-option--light${theme === "light" ? " theme-option--active" : ""}`}
                onClick={() => setTheme("light")}
              >
                <div className="theme-option__preview theme-preview--light">
                  <div className="tp-sidebar" />
                  <div className="tp-main">
                    <div className="tp-bar" />
                    <div className="tp-card" />
                  </div>
                </div>
                <div className="theme-option__label">
                  <span className="theme-option__name">Light</span>
                  <span className="theme-option__desc">Clean and bright, great for well-lit environments</span>
                </div>
                {theme === "light" && <span className="theme-option__check">✓</span>}
              </button>
            </div>
          </div>
        </div>

        {/* Account info */}
        <div className="data-card">
          <div className="dc-head">
            <h3 className="dc-head__title">Account</h3>
          </div>
          <div className="dc-body" style={{ padding: "20px" }}>
            <ul className="settings-list">
              <li className="settings-list-item">
                <span className="settings-list-item__label">Email</span>
                <span className="settings-list-item__value">{signedInUser?.email}</span>
              </li>
              <li className="settings-list-item">
                <span className="settings-list-item__label">Role</span>
                <span className="settings-list-item__value">{signedInUser?.role}</span>
              </li>
              <li className="settings-list-item">
                <span className="settings-list-item__label">Restaurant ID</span>
                <span className="settings-list-item__value" style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{signedInUser?.restaurantId ?? " "}</span>
              </li>
              <li className="settings-list-item">
                <span className="settings-list-item__label">Active Branch</span>
                <span className="settings-list-item__value">{activeBranch?.name ?? "None"}</span>
              </li>
            </ul>
            <div style={{ marginTop: 16 }}>
              <Button variant="danger" size="sm" onClick={handleSignOut}>Sign out</Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
     RENDER: Modals
  %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% */

  function renderCategoryModal() {
    return (
      <div className="modal-backdrop" onClick={closeCategoryModal}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-hd">
            <h2 className="modal-hd__title">{editingCategoryId ? "Edit Category" : "New Category"}</h2>
            <button type="button" className="modal-close" onClick={closeCategoryModal}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13"/></svg></button>
          </div>
          <form onSubmit={handleSaveCategory}>
            <div className="modal-body">
              {categoryStatus && <div className="modal-status">{categoryStatus}</div>}
              <div className="form-stack">
                <div className="field">
                  <label className="field-label">Category Name *</label>
                  <input className="field-input" type="text" value={categoryName}
                    onChange={e => setCategoryName(e.target.value)} placeholder="e.g. Starters" required />
                </div>
                <div className="field">
                  <label className="field-label">Slug</label>
                  <input className="field-input" type="text" value={categorySlug}
                    onChange={e => setCategorySlug(e.target.value)} placeholder="e.g. starters (auto-generated if empty)" />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Sort Order</label>
                    <input className="field-input" type="number" min="0" value={categorySortOrder}
                      onChange={e => setCategorySortOrder(e.target.value)} />
                  </div>
                  <div className="field" style={{ justifyContent: "flex-end", paddingTop: 24 }}>
                    <label className="field-check">
                      <input type="checkbox" checked={categoryActive} onChange={e => setCategoryActive(e.target.checked)} />
                      Active
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <Button type="button" variant="secondary" onClick={closeCategoryModal} disabled={categorySubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={categorySubmitting || !categoryName.trim()}>
                {categorySubmitting ? "Saving…" : editingCategoryId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderItemModal() {
    return (
      <div className="modal-backdrop" onClick={closeItemModal}>
        <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
          <div className="modal-hd">
            <h2 className="modal-hd__title">{editingItemId ? "Edit Menu Item" : "New Menu Item"}</h2>
            <button type="button" className="modal-close" onClick={closeItemModal}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13"/></svg></button>
          </div>
          <form onSubmit={handleSaveItem}>
            <div className="modal-body">
              {itemStatus && <div className="modal-status">{itemStatus}</div>}
              <div className="form-stack">
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Category *</label>
                    <select className="field-select" value={itemCategoryId}
                      onChange={e => setItemCategoryId(e.target.value)}
                      disabled={dashboardData.menuCategories.length === 0}>
                      {dashboardData.menuCategories.length === 0
                        ? <option value="">No categories yet</option>
                        : dashboardData.menuCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                      }
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">Type *</label>
                    <select className="field-select" value={itemType}
                      onChange={e => setItemType(e.target.value as MenuItem["type"])}>
                      <option value="FOOD">Food</option>
                      <option value="BEVERAGE">Beverage</option>
                      <option value="ADDON">Addon</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Item Name *</label>
                  <input className="field-input" type="text" value={itemName}
                    onChange={e => setItemName(e.target.value)} placeholder="e.g. Butter Chicken" required />
                </div>
                <div className="field">
                  <label className="field-label">Description</label>
                  <input className="field-input" type="text" value={itemDescription}
                    onChange={e => setItemDescription(e.target.value)} placeholder="Short description (optional)" />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Price (INR) *</label>
                    <input className="field-input" type="number" min="0.01" step="0.01" value={itemPrice}
                      onChange={e => setItemPrice(e.target.value)} placeholder="0.00" required />
                  </div>
                  <div className="field">
                    <label className="field-label">Tax Rate (%)</label>
                    <input className="field-input" type="number" min="0" step="0.01" value={itemTaxRate}
                      onChange={e => setItemTaxRate(e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">SKU</label>
                    <input className="field-input" type="text" value={itemSku}
                      onChange={e => setItemSku(e.target.value)} placeholder="Stock keeping unit (optional)" />
                  </div>
                  <div className="field" style={{ justifyContent: "flex-end", paddingTop: 24 }}>
                    <label className="field-check">
                      <input type="checkbox" checked={itemActive} onChange={e => setItemActive(e.target.checked)} />
                      Active
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <Button type="button" variant="secondary" onClick={closeItemModal} disabled={itemSubmitting}>Cancel</Button>
              <Button type="submit" disabled={itemSubmitting || !itemCategoryId || !itemName.trim() || !itemPrice}>
                {itemSubmitting ? "Saving…" : editingItemId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderTableModal() {
    return (
      <div className="modal-backdrop" onClick={closeTableModal}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-hd">
            <h2 className="modal-hd__title">{editingTableId ? "Edit Table" : "New Table"}</h2>
            <button type="button" className="modal-close" onClick={closeTableModal}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13"/></svg></button>
          </div>
          <form onSubmit={handleSaveTable}>
            <div className="modal-body">
              {tableStatusMessage && <div className="modal-status">{tableStatusMessage}</div>}
              <div className="form-stack">
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Table Name *</label>
                    <input className="field-input" type="text" value={tableName}
                      onChange={e => setTableName(e.target.value)} placeholder="e.g. Table 1" required />
                  </div>
                  <div className="field">
                    <label className="field-label">Code *</label>
                    <input className="field-input" type="text" value={tableCode}
                      onChange={e => setTableCode(e.target.value)} placeholder="e.g. T01" required />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Capacity (seats)</label>
                    <input className="field-input" type="number" min="1" value={tableCapacity}
                      onChange={e => setTableCapacity(e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="field-label">Status</label>
                    <select className="field-select" value={tableStatusValue}
                      onChange={e => setTableStatusValue(e.target.value as RestaurantTable["status"])}>
                      <option value="AVAILABLE">Available</option>
                      <option value="OCCUPIED">Occupied</option>
                      <option value="RESERVED">Reserved</option>
                      <option value="OUT_OF_SERVICE">Out of Service</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">QR Code Value</label>
                  <input className="field-input" type="text" value={tableQrCodeValue}
                    onChange={e => setTableQrCodeValue(e.target.value)} placeholder="Optional QR link or ID" />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Sort Order</label>
                    <input className="field-input" type="number" min="0" value={tableSortOrder}
                      onChange={e => setTableSortOrder(e.target.value)} />
                  </div>
                  <div className="field" style={{ justifyContent: "flex-end", paddingTop: 24 }}>
                    <label className="field-check">
                      <input type="checkbox" checked={tableActive} onChange={e => setTableActive(e.target.checked)} />
                      Active
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <Button type="button" variant="secondary" onClick={closeTableModal} disabled={tableSubmitting}>Cancel</Button>
              <Button type="submit" disabled={tableSubmitting || !tableName.trim() || !tableCode.trim()}>
                {tableSubmitting ? "Saving…" : editingTableId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderNewOrderModal() {
    return (
      <div className="modal-backdrop" onClick={() => setShowOrderForm(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-hd">
            <h2 className="modal-hd__title">New Order</h2>
            <button type="button" className="modal-close" onClick={() => setShowOrderForm(false)}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13"/></svg></button>
          </div>
          <form onSubmit={handleCreateOrder}>
            <div className="modal-body">
              {orderStatus && <div className="modal-status">{orderStatus}</div>}
              <div className="form-stack">
                <div className="field">
                  <label className="field-label">Order Number</label>
                  <input className="field-input" type="text" value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)} placeholder="Auto-generated" required />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Table</label>
                    <select className="field-select" value={orderTableId} onChange={e => setOrderTableId(e.target.value)}>
                      <option value="">No table (walk-in)</option>
                      {dashboardData.tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">Quantity</label>
                    <input className="field-input" type="number" min="1" value={orderQuantity}
                      onChange={e => setOrderQuantity(e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Menu Item *</label>
                  <select className="field-select" value={orderMenuItemId}
                    onChange={e => setOrderMenuItemId(e.target.value)}
                    disabled={dashboardData.menuItems.length === 0}>
                    {dashboardData.menuItems.length === 0
                      ? <option value="">No items   add menu items first</option>
                      : dashboardData.menuItems.map(i => <option key={i.id} value={i.id}>{i.name}   {formatMoney(i.price)}</option>)
                    }
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Notes</label>
                  <input className="field-input" type="text" value={orderNotes}
                    onChange={e => setOrderNotes(e.target.value)} placeholder="Special instructions (optional)" />
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <Button type="button" variant="secondary" onClick={() => setShowOrderForm(false)} disabled={orderSubmitting}>Cancel</Button>
              <Button type="submit" disabled={orderSubmitting || !orderNumber.trim() || !orderMenuItemId}>
                {orderSubmitting ? "Creating…" : "Create Order"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderOrderDetailModal() {
    if (!selectedOrder) return null;
    const table = dashboardData.tables.find(t => t.id === (selectedOrderTableId || selectedOrder.tableId));

    return (
      <div className="modal-backdrop" onClick={() => { setSelectedOrderId(null); setPendingReceiptPrintOrderId(null); }}>
        <div className="modal modal--xl" onClick={e => e.stopPropagation()}>
          <div className="modal-hd">
            <div>
              <h2 className="modal-hd__title">{selectedOrder.orderNumber}</h2>
              {selectedOrderStatus && <div className="modal-hd__sub">{selectedOrderStatus}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {orderStatusBadge(selectedOrder.status)}
              <button type="button" className="modal-close" onClick={() => { setSelectedOrderId(null); setPendingReceiptPrintOrderId(null); }}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13"/></svg></button>
            </div>
          </div>

          <div className="modal-body" style={{ display: "grid", gap: 20, maxHeight: "70vh", overflowY: "auto" }}>
            {selectedOrderLoading ? (
              <div className="empty"><div className="empty__title">Loading order…</div></div>
            ) : (
              <>
                {/* Order details */}
                <div className="detail-grid">
                  <div className="detail-item">
                    <div className="detail-item__lbl">Status</div>
                    <div className="detail-item__val">{selectedOrder.status.replace("_"," ")}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-item__lbl">Total</div>
                    <div className="detail-item__val text-amber">{formatMoney(selectedOrder.totalAmount)}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-item__lbl">Table</div>
                    <div className="detail-item__val">{table?.name ?? "Walk-in"}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-item__lbl">Created</div>
                    <div className="detail-item__val">{new Date(selectedOrder.createdAt).toLocaleString()}</div>
                  </div>
                </div>

                {/* Status actions */}
                <div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Update Status</div>
                  <div className="order-status-actions">
                    <Button variant="secondary" size="sm" onClick={() => void handleOrderStatusChange(selectedOrder.id, "PLACED")}>Place</Button>
                    <Button variant="secondary" size="sm" onClick={() => void handleOrderStatusChange(selectedOrder.id, "IN_PREPARATION")}>In Prep</Button>
                    <Button variant="secondary" size="sm" onClick={() => void handleOrderStatusChange(selectedOrder.id, "READY")}>Ready</Button>
                    <Button variant="secondary" size="sm" onClick={() => void handleOrderStatusChange(selectedOrder.id, "COMPLETED")}>Complete</Button>
                    <Button variant="danger" size="sm" onClick={() => void handleOrderStatusChange(selectedOrder.id, "CANCELED")}>Cancel</Button>
                  </div>
                </div>

                {/* Items */}
                <div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Order Items ({selectedOrder.items.length})
                  </div>
                  <ul className="order-items">
                    {selectedOrder.items.map(item => (
                      <li key={item.id} className="order-item-row">
                        <span>{item.menuItem.name}</span>
                        <span className="order-item-row__qty">{item.quantity} @ {formatMoney(item.unitPrice)}</span>
                        <strong className="order-item-row__total">{formatMoney(item.lineTotal)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Edit notes/table */}
                <form className="form-stack" onSubmit={handleOrderNotesSave}>
                  <div className="field-row">
                    <div className="field">
                      <label className="field-label">Table</label>
                      <select className="field-select" value={selectedOrderTableId}
                        onChange={e => setSelectedOrderTableId(e.target.value)}>
                        <option value="">No table</option>
                        {dashboardData.tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="field-label">Notes</label>
                      <input className="field-input" type="text" value={selectedOrderNotes}
                        onChange={e => setSelectedOrderNotes(e.target.value)} placeholder="Order notes" />
                    </div>
                  </div>
                  <Button type="submit" variant="secondary" size="sm">Save Details</Button>
                </form>

                {/* Billing section */}
                <div className="sep" />
                <div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Invoice & Payment
                  </div>

                  {selectedInvoiceLoading ? (
                    <div className="empty"><div className="empty__title">Loading invoice…</div></div>
                  ) : selectedInvoice ? (
                    <div style={{ display: "grid", gap: 14 }}>
                      {/* Receipt */}
                      <div className="receipt">
                        <div className="receipt-hd">
                          <strong>{selectedInvoice.invoiceNumber}</strong>
                          {invoiceBadge(selectedInvoice.status)}
                        </div>
                        <dl className="receipt-meta-grid">
                          <div><dt>Order</dt><dd>{selectedInvoice.order.orderNumber}</dd></div>
                          <div><dt>Issued</dt><dd>{new Date(selectedInvoice.issuedAt).toLocaleString()}</dd></div>
                          <div><dt>Branch</dt><dd>{activeBranch?.name ?? " "}</dd></div>
                          <div><dt>Table</dt><dd>{table?.name ?? "Walk-in"}</dd></div>
                        </dl>
                        <div className="receipt-items-section">
                          {selectedInvoice.order.items.map(item => (
                            <div key={item.id} className="receipt-line">
                              <span>{item.menuItem.name}</span>
                              <span>{item.quantity} @ {formatMoney(item.unitPrice)}</span>
                              <strong>{formatMoney(item.lineTotal)}</strong>
                            </div>
                          ))}
                        </div>
                        <div className="receipt-totals">
                          <div className="receipt-total-row"><span>Subtotal</span><span>{formatMoney(selectedInvoice.subtotalAmount)}</span></div>
                          <div className="receipt-total-row"><span>Tax</span><span>{formatMoney(selectedInvoice.taxAmount)}</span></div>
                          {Number(selectedInvoice.discountAmount) > 0 && (
                            <div className="receipt-total-row"><span>Discount</span><span>{formatMoney(selectedInvoice.discountAmount)}</span></div>
                          )}
                          <div className="receipt-total-row receipt-total-row--big">
                            <span>Amount Due</span>
                            <span>{formatMoney(getInvoiceDueAmount(selectedInvoice))}</span>
                          </div>
                        </div>
                      </div>

                      {/* Payments */}
                      {selectedInvoice.payments.length > 0 && (
                        <div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginBottom: 6 }}>Payments recorded</div>
                          <ul className="payment-list">
                            {selectedInvoice.payments.map(p => (
                              <li key={p.id} className="payment-row">
                                <div className="payment-row__info">
                                  <span>{p.method}{p.reference ? `  ${p.reference}` : ""}</span>
                                  <span className="text-muted">{p.status}  {new Date(p.paidAt).toLocaleString()}</span>
                                </div>
                                <span className="payment-row__amount">{formatMoney(p.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Record payment form */}
                      {selectedInvoice.status === "OPEN" && (
                        <form className="billing-form-section form-stack" onSubmit={handleRecordPayment}>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginBottom: 2 }}>Record Payment</div>
                          <div className="field-row">
                            <div className="field">
                              <label className="field-label">Amount</label>
                              <input className="field-input" type="number" min="0.01" step="0.01"
                                value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" />
                            </div>
                            <div className="field">
                              <label className="field-label">Method</label>
                              <select className="field-select" value={paymentMethod}
                                onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}>
                                <option value="CASH">Cash</option>
                                <option value="CARD">Card</option>
                                <option value="UPI">UPI</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </div>
                          </div>
                          <input className="field-input" type="text" value={paymentReference}
                            onChange={e => setPaymentReference(e.target.value)} placeholder="Reference / Transaction ID (optional)" />
                          <div className="inline-actions">
                            <Button type="button" variant="secondary" size="sm"
                              onClick={() => void handleCreateInvoice()} disabled={invoiceSubmitting || paymentSubmitting}>
                              {invoiceSubmitting ? "Issuing…" : "Re-issue Invoice"}
                            </Button>
                            <Button type="submit" disabled={paymentSubmitting || Number(paymentAmount) <= 0}>
                              {paymentSubmitting ? "Recording…" : "Record Payment"}
                            </Button>
                          </div>
                          {selectedInvoiceStatus && (
                            <div className="text-muted" style={{ fontSize: "0.8rem" }}>{selectedInvoiceStatus}</div>
                          )}
                        </form>
                      )}

                      <Button variant="secondary" size="sm" onClick={() => window.print()}>
                        = Print Receipt
                      </Button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div className="text-muted">No invoice issued for this order yet.</div>
                      <div className="inline-actions">
                        <Button onClick={() => void handleCreateInvoice()} disabled={invoiceSubmitting}>
                          {invoiceSubmitting ? "Issuing…" : "Issue Invoice"}
                        </Button>
                      </div>
                      {selectedInvoiceStatus && (
                        <div className="text-muted" style={{ fontSize: "0.8rem" }}>{selectedInvoiceStatus}</div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      {renderPrintReceipt()}
      </div>
    );
  }

  /* %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
     RENDER: Table Bill / Payment Modal
  %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% */

  function renderTableBillModal() {
    if (!tableBillModal) return null;
    const { tableName, orders } = tableBillModal;

    const combinedTotal  = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
    const discountNum    = Math.max(0, Number(billDiscount) || 0);
    const discountAmt    = billDiscountType === "pct"
      ? (combinedTotal * discountNum) / 100
      : Math.min(discountNum, combinedTotal);
    const finalTotal     = Math.max(0, combinedTotal - discountAmt);
    const amtReceived    = Number(billAmtReceived) || 0;
    const changeDue      = billPayMethod === "CASH" ? Math.max(0, amtReceived - finalTotal) : 0;

    return (
      <div className="modal-backdrop" onClick={() => { if (!billSubmitting) setTableBillModal(null); }}>
        <div className="modal modal--bill" onClick={e => e.stopPropagation()}>
          <div className="modal-hd">
            <h2 className="modal-hd__title">Bill — {tableName}</h2>
            <button type="button" className="modal-close" disabled={billSubmitting} onClick={() => setTableBillModal(null)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13"/></svg>
            </button>
          </div>

          <div className="modal-body">
            {/* Token list */}
            <table className="bill-tokens-tbl">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Items</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, idx) => (
                  <tr key={o.id}>
                    <td>Token {idx + 1}</td>
                    <td className="text-muted">{o.orderNumber}</td>
                    <td className="text-right">{formatMoney(Number(o.totalAmount))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bill-tokens-tbl__subtotal">
                  <td colSpan={2}>Subtotal</td>
                  <td className="text-right">{formatMoney(combinedTotal)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Discount */}
            <div className="bill-field-row">
              <label className="bill-label">Discount</label>
              <div className="bill-discount-group">
                <input
                  className="form-input bill-discount-input"
                  type="number"
                  min="0"
                  value={billDiscount}
                  onChange={e => setBillDiscount(e.target.value)}
                  disabled={billSubmitting}
                />
                <div className="bill-discount-type">
                  <button
                    type="button"
                    className={`bill-type-btn${billDiscountType === "flat" ? " bill-type-btn--active" : ""}`}
                    onClick={() => setBillDiscountType("flat")}
                    disabled={billSubmitting}
                  >₹</button>
                  <button
                    type="button"
                    className={`bill-type-btn${billDiscountType === "pct" ? " bill-type-btn--active" : ""}`}
                    onClick={() => setBillDiscountType("pct")}
                    disabled={billSubmitting}
                  >%</button>
                </div>
              </div>
            </div>

            {/* Total due */}
            <div className="bill-total-row">
              <span>Total Due</span>
              <span className="bill-total-amt">{formatMoney(finalTotal)}</span>
            </div>

            {/* Payment method */}
            <div className="bill-field-row">
              <label className="bill-label">Payment Method</label>
              <div className="bill-methods">
                {(["CASH", "CARD", "UPI", "OTHER"] as PaymentMethod[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`bill-method-btn${billPayMethod === m ? " bill-method-btn--active" : ""}`}
                    onClick={() => setBillPayMethod(m)}
                    disabled={billSubmitting}
                  >{m}</button>
                ))}
              </div>
            </div>

            {/* Amount received (cash only) */}
            {billPayMethod === "CASH" && (
              <>
                <div className="bill-field-row">
                  <label className="bill-label">Amount Received (₹)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    placeholder={finalTotal.toFixed(2)}
                    value={billAmtReceived}
                    onChange={e => setBillAmtReceived(e.target.value)}
                    disabled={billSubmitting}
                  />
                </div>
                {amtReceived > 0 && (
                  <div className="bill-change-row">
                    <span>Change Due</span>
                    <span className={changeDue > 0 ? "bill-change-pos" : ""}>{formatMoney(changeDue)}</span>
                  </div>
                )}
              </>
            )}

            {billError && <p className="form-error">{billError}</p>}
          </div>

          <div className="modal-ft">
            <Button variant="secondary" onClick={() => setTableBillModal(null)} disabled={billSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmitTableBill()} disabled={billSubmitting}>
              {billSubmitting ? "Processing…" : "Record & Print"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
     RENDER: Admin layout with sidebar
  %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% */

  return (
    <div className="admin-layout">
      <AdminSidebar
        user={signedInUser}
        branches={branches}
        activeBranchId={activeBranchId}
        branchLoading={branchLoading}
        activeSection={adminSection}
        onNavigate={handleAdminSectionNavigate}
        onBranchChange={handleBranchChange}
        onOrdersView={() => handleWorkspaceNavigate("orders")}
        onSignOut={handleSignOut}
      />

      <div className="admin-main">
        <header className="admin-header">
          <h1 className="admin-header__title">{SECTION_TITLES[adminSection]}</h1>
          <div className="admin-header__right">
            {activeBranch && <span className="header-pill">{activeBranch.name}</span>}
            {dashboardLoading && <span className="header-pill header-pill-loading">Loading…</span>}
          </div>
        </header>

        <div className="admin-content">
          {adminSection === "overview"  && renderOverview()}
          {adminSection === "menu"      && renderMenu()}
          {adminSection === "tables"    && renderTables()}
          {adminSection === "orders"    && renderOrders()}
          {adminSection === "billing"   && renderBilling()}
          {adminSection === "settings"  && renderSettings()}
        </div>
      </div>

      {/* Modals */}
      {showCategoryModal  && renderCategoryModal()}
      {showItemModal      && renderItemModal()}
      {showTableModal     && renderTableModal()}
      {showOrderForm      && renderNewOrderModal()}
      {selectedOrderId    && renderOrderDetailModal()}
      {tableBillModal     && renderTableBillModal()}
      {renderPrintReceipt()}
    </div>
  );
}


