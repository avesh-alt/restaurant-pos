import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { LoadingState } from "../components/LoadingState";
import { useSession } from "../context/session-context";
import {
  clearStoredOrderDraft,
  loadStoredOrderDraft,
  saveStoredOrderDraft,
  type OrderDraft,
  type OrderDraftLine,
} from "../lib/draft-storage";
import type {
  CreateOrderInput,
  DashboardData,
  MenuItem,
  OrderDetail,
  OrderSummary,
  RestaurantTable,
} from "../lib/api";

// ─── Layout ────────────────────────────────────────────────────────────────
const SW = Dimensions.get("window").width;
// 3-col table grid: 12px side padding × 2, 8px column gap × 2
const TABLE_TILE_SIZE = Math.floor((SW - 24 - 16) / 3);
// 2-col menu grid: 12px side padding × 2, 8px column gap × 1
const MENU_TILE_W = Math.floor((SW - 24 - 8) / 2);

// ─── Domain constants ──────────────────────────────────────────────────────
const ACTIVE_STATUSES: OrderSummary["status"][] = [
  "DRAFT",
  "PLACED",
  "IN_PREPARATION",
  "READY",
  "SERVED",
];

const TABLE_SORT: Record<RestaurantTable["status"], number> = {
  OCCUPIED: 0,
  RESERVED: 1,
  AVAILABLE: 2,
  OUT_OF_SERVICE: 3,
};

type CartByTableId = Record<string, OrderDraftLine[]>;
type TableTone = "available" | "occupied" | "ready" | "reserved" | "offline";

const TONE: Record<
  TableTone,
  { bg: string; border: string; color: string; label: string }
> = {
  available: { bg: "#f0fdf4", border: "#86efac", color: "#15803d", label: "OPEN" },
  occupied:  { bg: "#fff7ed", border: "#fb923c", color: "#c2410c", label: "OCCUPIED" },
  ready:     { bg: "#fefce8", border: "#facc15", color: "#92400e", label: "READY" },
  reserved:  { bg: "#eff6ff", border: "#93c5fd", color: "#1d4ed8", label: "RESERVED" },
  offline:   { bg: "#f5f5f5", border: "#d4d4d4", color: "#737373", label: "OFFLINE" },
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function fmt(value: string | number): string {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtStatus(s: string): string {
  return s.replace(/_/g, " ");
}

function genOrderNum(branchCode?: string | null): string {
  const now = new Date();
  const ts =
    String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  const b =
    (branchCode ?? "walkin")
      .replace(/[^a-z0-9]+/gi, "")
      .toUpperCase() || "WALKIN";
  return `ORD-${b}-${ts}`;
}

// SERVED is "active" for display (table still occupied, bill unpaid)
// but NOT appendable — new items for a served table start a fresh order (token/round system)
const APPENDABLE_STATUSES: OrderSummary["status"][] = ["DRAFT", "PLACED", "IN_PREPARATION", "READY"];

function isActive(status: OrderSummary["status"]): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function byRecency<T extends { updatedAt: string; createdAt: string }>(
  a: T,
  b: T,
): number {
  return (
    new Date(b.updatedAt ?? b.createdAt).getTime() -
    new Date(a.updatedAt ?? a.createdAt).getTime()
  );
}

function latestOrder(
  tableId: string,
  orders: OrderSummary[],
): OrderSummary | null {
  return (
    orders
      .filter((o) => o.tableId === tableId && isActive(o.status))
      .sort(byRecency)[0] ?? null
  );
}

function latestAppendableOrder(
  tableId: string,
  orders: OrderSummary[],
): OrderSummary | null {
  return (
    orders
      .filter((o) => o.tableId === tableId && APPENDABLE_STATUSES.includes(o.status))
      .sort(byRecency)[0] ?? null
  );
}

function match(value: string, q: string): boolean {
  return value.toLowerCase().includes(q.toLowerCase());
}

function cartTotal(lines: OrderDraftLine[], items: MenuItem[]): number {
  return lines.reduce((sum, line) => {
    const item = items.find((m) => m.id === line.menuItemId);
    if (!item) return sum;
    const price = Number(item.price);
    const tax = Number(item.taxRate);
    const sub = Number.isNaN(price) ? 0 : price * line.quantity;
    return sum + sub + (Number.isNaN(tax) ? 0 : (sub * tax) / 100);
  }, 0);
}

function tableTone(
  table: RestaurantTable,
  order: OrderSummary | null,
): TableTone {
  if (table.status === "OUT_OF_SERVICE") return "offline";
  if (order?.status === "READY") return "ready";
  if (order && isActive(order.status)) return "occupied";
  if (table.status === "RESERVED") return "reserved";
  if (table.status === "OCCUPIED") return "occupied";
  return "available";
}

// ─── Main component ────────────────────────────────────────────────────────
export function DashboardScreen() {
  const { sessionState, api, signOut, setActiveBranchId } = useSession();

  const [view, setView] = useState<"floor" | "order">("floor");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tableId, setTableId] = useState("");
  const [catId, setCatId] = useState("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartByTableId>({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const [notingKey, setNotingKey] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const prevBranchRef = useRef<string | null>(null);

  const session = sessionState.session;
  const branch =
    data?.branches.find((b) => b.id === session?.activeBranchId) ?? null;

  // ── memos ─────────────────────────────────────────────────────────────────
  const activeItems = useMemo(
    () => (data ? data.menuItems.filter((i) => i.isActive) : []),
    [data],
  );

  const categories = useMemo(() => {
    if (!data) return [];
    return [...data.menuCategories]
      .filter((c) => c.isActive)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
  }, [data]);

  const tables = useMemo(() => {
    if (!data) return [];
    return [...data.tables]
      .filter((t) =>
        session?.activeBranchId
          ? t.branchId === session.activeBranchId || t.branchId === null
          : true,
      )
      .sort((a, b) => {
        if (TABLE_SORT[a.status] !== TABLE_SORT[b.status])
          return TABLE_SORT[a.status] - TABLE_SORT[b.status];
        if (
          a.branchId === session?.activeBranchId &&
          b.branchId !== session?.activeBranchId
        )
          return -1;
        if (
          a.branchId !== session?.activeBranchId &&
          b.branchId === session?.activeBranchId
        )
          return 1;
        return a.sortOrder - b.sortOrder;
      });
  }, [data, session?.activeBranchId]);

  const menuItems = useMemo(() => {
    if (!data) return [];
    const q = query.trim();
    return activeItems
      .filter((item) => {
        if (catId !== "all" && item.menuCategoryId !== catId) return false;
        if (!q) return true;
        return (
          match(item.name, q) ||
          match(item.sku ?? "", q) ||
          match(item.description ?? "", q)
        );
      })
      .sort((a, b) => {
        const ca = data.menuCategories.find((c) => c.id === a.menuCategoryId);
        const cb = data.menuCategories.find((c) => c.id === b.menuCategoryId);
        const co = (ca?.sortOrder ?? 0) - (cb?.sortOrder ?? 0);
        return co !== 0 ? co : a.name.localeCompare(b.name);
      });
  }, [activeItems, data, query, catId]);

  const selectedTable = useMemo(
    () => (data && tableId ? (data.tables.find((t) => t.id === tableId) ?? null) : null),
    [data, tableId],
  );

  const tableOrder = useMemo(
    () => (data && tableId ? latestAppendableOrder(tableId, data.orders) : null),
    [data, tableId],
  );

  const cartLines = useMemo(
    () => (tableId ? (cart[tableId] ?? []) : []),
    [cart, tableId],
  );

  const cartCount = useMemo(
    () => cartLines.reduce((s, l) => s + l.quantity, 0),
    [cartLines],
  );

  const cartAmount = useMemo(
    () => (data ? cartTotal(cartLines, data.menuItems) : 0),
    [cartLines, data],
  );

  const busyCount = useMemo(
    () =>
      data
        ? data.tables.filter(
            (t) => t.status === "OCCUPIED" || t.status === "RESERVED",
          ).length
        : 0,
    [data],
  );

  const readyCount = useMemo(
    () =>
      data ? data.orders.filter((o) => o.status === "READY").length : 0,
    [data],
  );

  const prepCount = useMemo(
    () =>
      data
        ? data.orders.filter(
            (o) => o.status === "PLACED" || o.status === "IN_PREPARATION",
          ).length
        : 0,
    [data],
  );

  // All active orders for the selected table (across all rounds)
  const tableOrders = useMemo(() => {
    if (!data || !tableId) return [];
    return data.orders
      .filter((o) => o.tableId === tableId && isActive(o.status))
      .sort(byRecency);
  }, [data, tableId]);

  // ── effects ───────────────────────────────────────────────────────────────
  const loadData = async (): Promise<void> => {
    if (!session) return;
    setError(null);
    const d = await api.getDashboardData();
    setData(d);
  };

  useEffect(() => {
    if (!session) {
      prevBranchRef.current = null;
      return;
    }
    const prev = prevBranchRef.current;
    const cur = session.activeBranchId ?? null;
    if (prev !== null && prev !== cur) {
      setNotice(cur ? `Switched to ${branch?.name ?? "branch"}` : "All branches");
    }
    prevBranchRef.current = cur;
  }, [branch?.name, session]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        setLoading(true);
        await loadData();
      } catch (e) {
        if (live)
          setError(e instanceof Error ? e.message : "Unable to load workspace.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [session]);

  useEffect(() => {
    if (!data) return;
    setTableId((cur) => {
      if (cur && data.tables.some((t) => t.id === cur)) return cur;
      return tables[0]?.id ?? data.tables[0]?.id ?? "";
    });
  }, [data, tables]);

  useEffect(() => {
    if (!data) return;
    if (catId !== "all" && !data.menuCategories.some((c) => c.id === catId))
      setCatId("all");
  }, [data, catId]);

  useEffect(() => {
    if (!session) {
      setDraftLoaded(false);
      return;
    }
    let live = true;
    void (async () => {
      try {
        const draft = await loadStoredOrderDraft(session.user.id);
        if (!live || !draft) {
          if (live) setDraftLoaded(true);
          return;
        }
        setTableId(draft.selectedTableId);
        setCart(
          draft.cartByTableId ??
            (draft.cartLines.length > 0 && draft.selectedTableId
              ? { [draft.selectedTableId]: draft.cartLines }
              : {}),
        );
        setDraftLoaded(true);
      } catch {
        if (live) setDraftLoaded(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session || !draftLoaded) return;
    const draft: OrderDraft = {
      activeBranchId: session.activeBranchId ?? null,
      selectedTableId: tableId,
      selectedMenuItemId: "",
      quantity: "1",
      notes: "",
      cartLines,
      cartByTableId: cart,
    };
    void saveStoredOrderDraft(session.user.id, draft);
  }, [cartLines, cart, draftLoaded, tableId, session]);

  useEffect(() => {
    if (!session) return;
    let live = true;
    const iv = setInterval(() => {
      if (live) void refreshRef.current();
    }, 15000);
    void refreshRef.current();
    return () => {
      live = false;
      clearInterval(iv);
    };
  }, [session]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  // ── actions ───────────────────────────────────────────────────────────────
  const refresh = async (): Promise<void> => {
    if (!session) return;
    setRefreshing(true);
    try {
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to refresh.");
    } finally {
      setRefreshing(false);
    }
  };

  refreshRef.current = refresh;

  const updateCart = (
    updater: (cur: OrderDraftLine[]) => OrderDraftLine[],
  ): void => {
    if (!tableId) {
      Alert.alert("No table", "Select a table first.");
      return;
    }
    setCart((cur) => ({ ...cur, [tableId]: updater(cur[tableId] ?? []) }));
  };

  const addItem = (item: MenuItem): void => {
    updateCart((cur) => {
      const found = cur.find(
        (l) => l.menuItemId === item.id && l.notes === "",
      );
      if (found)
        return cur.map((l) =>
          l === found ? { ...l, quantity: l.quantity + 1 } : l,
        );
      return [...cur, { menuItemId: item.id, quantity: 1, notes: "" }];
    });
  };

  const inc = (menuItemId: string, notes: string): void => {
    updateCart((cur) =>
      cur.map((l) =>
        l.menuItemId === menuItemId && l.notes === notes
          ? { ...l, quantity: l.quantity + 1 }
          : l,
      ),
    );
  };

  const dec = (menuItemId: string, notes: string): void => {
    updateCart((cur) =>
      cur
        .map((l) =>
          l.menuItemId === menuItemId && l.notes === notes
            ? { ...l, quantity: l.quantity - 1 }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
  };

  const setItemNotes = (menuItemId: string, oldNotes: string, newNotes: string): void => {
    if (newNotes === oldNotes) return;
    updateCart((cur) => {
      const idx = cur.findIndex((l) => l.menuItemId === menuItemId && l.notes === oldNotes);
      if (idx === -1) return cur;
      const target = cur[idx]!;
      const dupIdx = cur.findIndex((l, i) => i !== idx && l.menuItemId === menuItemId && l.notes === newNotes);
      if (dupIdx !== -1) {
        return cur
          .map((l, i) => i === dupIdx ? { ...l, quantity: l.quantity + target.quantity } : l)
          .filter((_l, i) => i !== idx);
      }
      return cur.map((l, i) => i === idx ? { ...l, notes: newNotes } : l);
    });
  };

  const clearDraft = async (): Promise<void> => {
    if (!session || !tableId) return;
    setCart((cur) => {
      const next = { ...cur };
      delete next[tableId];
      return next;
    });
    setOrderNotes("");
    setNotingKey(null);
    await clearStoredOrderDraft(session.user.id);
  };

  const openPanel = async (): Promise<void> => {
    if (showPanel) {
      setShowPanel(false);
      return;
    }
    setShowPanel(true);
    const unfetched = tableOrders.filter((o) => !orderDetails[o.id]);
    if (!unfetched.length) return;
    setLoadingDetail(true);
    try {
      const results = await Promise.all(unfetched.map((o) => api.getOrder(o.id)));
      setOrderDetails((prev) => {
        const next = { ...prev };
        for (const detail of results) {
          next[detail.id] = detail;
        }
        return next;
      });
    } catch (err) {
      console.warn("Failed to load order details:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const sendOrder = async (): Promise<void> => {
    if (!session || !data || !tableId) return;
    if (!cartLines.length) {
      Alert.alert("Cart empty", "Add items before sending to kitchen.");
      return;
    }
    const items = cartLines.map((l) => ({
      menuItemId: l.menuItemId,
      quantity: l.quantity,
      notes: l.notes.trim() || null,
    }));
    setSubmitting(true);
    try {
      if (tableOrder) {
        await api.appendOrderItems(tableOrder.id, { items });
        setNotice(`Added to ${tableOrder.orderNumber} — KDS updated`);
      } else {
        const num = genOrderNum(branch?.code ?? session.user.branchId);
        const payload: CreateOrderInput = {
          branchId: session.activeBranchId ?? session.user.branchId ?? null,
          tableId,
          orderNumber: num,
          status: "PLACED",
          notes: orderNotes.trim() || null,
          items,
        };
        await api.createOrder(payload);
        setNotice(`${num} sent to KDS`);
      }
      await clearDraft();
      await loadData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Order failed.";
      setError(msg);
      Alert.alert("Order failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.fill}>
        <LoadingState title="Loading workspace" description="Fetching tables and menu." />
      </View>
    );
  }

  if (!data || !session) {
    return (
      <View style={s.centered}>
        <Text style={s.errTitle}>Unable to load</Text>
        <Text style={s.errText}>{error ?? "Session not found."}</Text>
        <Chip label="Retry" dark onPress={() => void refresh()} />
        <Chip label="Sign out" onPress={() => void signOut()} />
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FLOOR VIEW
  // ─────────────────────────────────────────────────────────────────────────
  if (view === "floor") {
    return (
      <View style={s.shell}>
        {/* Header */}
        <View style={s.floorHead}>
          <View style={s.floorHeadRow}>
            <Text style={s.floorTitle}>Floor</Text>
            <View style={s.statsRow}>
              {readyCount > 0 && (
                <View style={[s.pill, s.pillReady]}>
                  <Text style={s.pillText}>{readyCount} ready</Text>
                </View>
              )}
              {prepCount > 0 && (
                <View style={[s.pill, s.pillPrep]}>
                  <Text style={s.pillText}>{prepCount} in prep</Text>
                </View>
              )}
              <View style={s.pill}>
                <Text style={s.pillText}>{busyCount} busy</Text>
              </View>
            </View>
          </View>

          {data.branches.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.branchRow}
            >
              <Pressable
                style={({ pressed }) => [
                  s.chip,
                  !session.activeBranchId && s.chipOn,
                  pressed && s.tap,
                ]}
                onPress={() => void setActiveBranchId(null)}
              >
                <Text
                  style={[
                    s.chipTxt,
                    !session.activeBranchId && s.chipTxtOn,
                  ]}
                >
                  All
                </Text>
              </Pressable>
              {data.branches.map((b) => (
                <Pressable
                  key={b.id}
                  style={({ pressed }) => [
                    s.chip,
                    session.activeBranchId === b.id && s.chipOn,
                    pressed && s.tap,
                  ]}
                  onPress={() => void setActiveBranchId(b.id)}
                >
                  <Text
                    style={[
                      s.chipTxt,
                      session.activeBranchId === b.id && s.chipTxtOn,
                    ]}
                  >
                    {b.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {notice ? <NoticeBanner text={notice} /> : null}

        {/* Table grid */}
        <ScrollView
          style={s.flex1}
          contentContainerStyle={s.tableGrid}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
            />
          }
          keyboardShouldPersistTaps="handled"
        >
          {tables.map((t) => {
            const ord = latestOrder(t.id, data.orders);
            const pending =
              cart[t.id]?.reduce((sum, l) => sum + l.quantity, 0) ?? 0;
            return (
              <TableTile
                key={t.id}
                table={t}
                order={ord}
                tone={tableTone(t, ord)}
                pending={pending}
                active={tableId === t.id}
                onPress={() => {
                  setTableId(t.id);
                  setView("order");
                  setQuery("");
                  setCatId("all");
                  setShowPanel(false);
                }}
              />
            );
          })}
        </ScrollView>

        {/* Footer */}
        <View style={s.floorFoot}>
          <Text style={s.floorFootUser} numberOfLines={1}>
            {session.user.email}
          </Text>
          <Pressable
            style={({ pressed }) => [s.signOutBtn, pressed && s.tap]}
            onPress={() => void signOut()}
          >
            <Text style={s.signOutTxt}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ORDER VIEW
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={s.shell}
      behavior="padding"
      enabled={Platform.OS === "ios"}
    >
      {/* Order header */}
      <View style={s.orderHead}>
        <Pressable
          style={({ pressed }) => [s.backBtn, pressed && s.tap]}
          onPress={() => { setView("floor"); setShowPanel(false); }}
        >
          <Text style={s.backTxt}>← Floor</Text>
        </Pressable>
        <View style={s.orderHeadCenter}>
          <Text style={s.orderHeadTable} numberOfLines={1}>
            {selectedTable ? `Table ${selectedTable.name}` : "No table"}
          </Text>
          <Text style={s.orderHeadSub} numberOfLines={1}>
            {tableOrder
              ? `${tableOrder.orderNumber} · ${fmtStatus(tableOrder.status)}`
              : "New order"}
          </Text>
        </View>
        {cartCount > 0 && (
          <View style={s.headBadge}>
            <Text style={s.headBadgeTxt}>{cartCount}</Text>
          </View>
        )}
      </View>

      {notice ? <NoticeBanner text={notice} /> : null}

      {/* Order history panel */}
      {tableOrders.length > 0 && (
        <Pressable
          style={({ pressed }) => [s.orderStrip, pressed && s.tap]}
          onPress={() => void openPanel()}
        >
          <View style={s.orderStripRow}>
            <View style={s.orderStripLeft}>
              <Text style={s.orderStripTitle}>
                {tableOrders.length === 1
                  ? tableOrders[0]?.orderNumber ?? "Order"
                  : `${tableOrders.length} active orders`}
              </Text>
              <View style={s.orderStripMeta}>
                {tableOrders.slice(0, 2).map((o) => (
                  <StatusBadge key={o.id} status={o.status} />
                ))}
                {tableOrders.length > 2 && (
                  <Text style={s.orderStripMore}>+{tableOrders.length - 2} more</Text>
                )}
              </View>
            </View>
            <Text style={s.orderStripChev}>{showPanel ? "▲ Hide" : "▼ View ordered"}</Text>
          </View>
        </Pressable>
      )}

      {showPanel && tableOrders.length > 0 && (
        <ScrollView style={s.panel} keyboardShouldPersistTaps="handled">
          {loadingDetail && (
            <View style={s.panelLoading}>
              <Text style={s.panelLoadingTxt}>Loading item details…</Text>
            </View>
          )}
          {tableOrders.map((order, idx) => {
            const detail = orderDetails[order.id];
            return (
              <View key={order.id} style={[s.panelOrder, idx > 0 && s.panelOrderBorder]}>
                <View style={s.panelOrderHead}>
                  <Text style={s.panelOrderNum}>{order.orderNumber}</Text>
                  <StatusBadge status={order.status} />
                </View>
                {detail?.notes ? (
                  <Text style={s.panelOrderNote}>✎ {detail.notes}</Text>
                ) : null}
                {detail ? (
                  <>
                    {detail.items.map((item) => (
                      <View key={item.id}>
                        <View style={s.panelItem}>
                          <Text style={s.panelItemName} numberOfLines={1}>
                            {item.menuItem?.name ?? "Unknown item"}
                          </Text>
                          <Text style={s.panelItemQty}>×{item.quantity}</Text>
                          <Text style={s.panelItemAmt}>{fmt(item.lineTotal)}</Text>
                        </View>
                        {item.notes ? (
                          <Text style={s.panelItemNote}>✎ {item.notes}</Text>
                        ) : null}
                      </View>
                    ))}
                    <View style={s.panelTotal}>
                      <Text style={s.panelTotalLbl}>Total</Text>
                      <Text style={s.panelTotalAmt}>{fmt(order.totalAmount)}</Text>
                    </View>
                  </>
                ) : (
                  !loadingDetail && (
                    <Text style={s.panelNoItems}>
                      {fmt(order.totalAmount)} · {fmtStatus(order.status)}
                    </Text>
                  )
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Sticky filter bar */}
      <View style={s.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.catRow}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            style={({ pressed }) => [
              s.cat,
              catId === "all" && s.catOn,
              pressed && s.tap,
            ]}
            onPress={() => setCatId("all")}
          >
            <Text style={[s.catTxt, catId === "all" && s.catTxtOn]}>
              All
            </Text>
          </Pressable>
          {categories.map((c) => (
            <Pressable
              key={c.id}
              style={({ pressed }) => [
                s.cat,
                catId === c.id && s.catOn,
                pressed && s.tap,
              ]}
              onPress={() => setCatId(c.id)}
            >
              <Text style={[s.catTxt, catId === c.id && s.catTxtOn]}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={s.searchWrap}>
          <TextInput
            style={s.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search items…"
            placeholderTextColor="#a89080"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Menu grid */}
      <ScrollView
        style={s.flex1}
        contentContainerStyle={s.menuGrid}
        keyboardShouldPersistTaps="handled"
      >
        {menuItems.length > 0 ? (
          menuItems.map((item) => {
            const cat =
              data.menuCategories.find((c) => c.id === item.menuCategoryId)
                ?.name ?? "";
            const qty =
              cartLines.find(
                (l) => l.menuItemId === item.id && l.notes === "",
              )?.quantity ?? 0;
            return (
              <MenuTile
                key={item.id}
                item={item}
                category={cat}
                quantity={qty}
                onPress={() => addItem(item)}
              />
            );
          })
        ) : (
          <View style={s.empty}>
            <Text style={s.emptyTxt}>No items match your search.</Text>
          </View>
        )}
      </ScrollView>

      {/* Order bar */}
      <View style={s.bar}>
        {cartLines.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.cartScroll}
            contentContainerStyle={s.cartScrollInner}
            keyboardShouldPersistTaps="handled"
          >
            {cartLines.map((line) => {
              const item = data.menuItems.find(
                (m) => m.id === line.menuItemId,
              );
              if (!item) return null;
              const cardKey = `${line.menuItemId}-${line.notes}`;
              const isNoting = notingKey === cardKey;
              return (
                <View key={cardKey} style={s.cartCard}>
                  <Text style={s.cartName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={s.cartPrice}>{fmt(item.price)}</Text>
                  <View style={s.cartQtyRow}>
                    <Pressable
                      style={({ pressed }) => [s.qtyBtn, pressed && s.tap]}
                      onPress={() => dec(line.menuItemId, line.notes)}
                    >
                      <Text style={s.qtyBtnTxt}>−</Text>
                    </Pressable>
                    <Text style={s.qtyNum}>{line.quantity}</Text>
                    <Pressable
                      style={({ pressed }) => [s.qtyBtn, pressed && s.tap]}
                      onPress={() => inc(line.menuItemId, line.notes)}
                    >
                      <Text style={s.qtyBtnTxt}>+</Text>
                    </Pressable>
                  </View>
                  {isNoting ? (
                    <TextInput
                      style={s.cartNoteInput}
                      value={noteText}
                      onChangeText={setNoteText}
                      placeholder="e.g. no onions"
                      placeholderTextColor="#7a5a48"
                      returnKeyType="done"
                      autoFocus
                      onSubmitEditing={() => {
                        setItemNotes(line.menuItemId, line.notes, noteText.trim());
                        setNotingKey(null);
                      }}
                      onBlur={() => {
                        setItemNotes(line.menuItemId, line.notes, noteText.trim());
                        setNotingKey(null);
                      }}
                    />
                  ) : (
                    <Pressable
                      onPress={() => {
                        setNoteText(line.notes);
                        setNotingKey(cardKey);
                      }}
                      style={({ pressed }) => [s.cartNoteBtn, pressed && s.tap]}
                    >
                      <Text
                        style={[s.cartNoteBtnTxt, line.notes ? s.cartNoteActive : null]}
                        numberOfLines={1}
                      >
                        {line.notes ? `✎ ${line.notes}` : "✎ Note"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <View style={s.cartHint}>
            <Text style={s.cartHintTxt}>
              Tap menu items to add them here
            </Text>
          </View>
        )}

        {cartLines.length > 0 && (
          <TextInput
            style={s.orderNoteInput}
            value={orderNotes}
            onChangeText={setOrderNotes}
            placeholder="Order note for kitchen…"
            placeholderTextColor="#7a5a48"
            returnKeyType="done"
          />
        )}

        <View style={s.barRow}>
          <View style={s.barTotal}>
            <Text style={s.barTotalLabel}>{cartCount} items</Text>
            <Text style={s.barTotalAmt}>{fmt(cartAmount)}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              s.sendBtn,
              (!cartLines.length || submitting) && s.sendBtnOff,
              pressed && cartLines.length > 0 && !submitting && s.tap,
            ]}
            onPress={() => void sendOrder()}
            disabled={submitting || !cartLines.length}
          >
            <Text style={s.sendTxt}>
              {submitting
                ? "Sending…"
                : tableOrder
                ? "Add to KDS"
                : "Send to KDS"}
            </Text>
          </Pressable>
          {cartLines.length > 0 && (
            <Pressable
              style={({ pressed }) => [s.clearBtn, pressed && s.tap]}
              onPress={() => void clearDraft()}
            >
              <Text style={s.clearTxt}>Clear</Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── TableTile ─────────────────────────────────────────────────────────────
interface TableTileProps {
  table: RestaurantTable;
  order: OrderSummary | null;
  tone: TableTone;
  pending: number;
  active: boolean;
  onPress: () => void;
}

function TableTile({
  table,
  order,
  tone,
  pending,
  active,
  onPress,
}: TableTileProps) {
  const t = TONE[tone];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        s.tile,
        { backgroundColor: t.bg, borderColor: active ? "#2b1d14" : t.border },
        active && s.tileActive,
        pressed && s.tap,
      ]}
    >
      <Text style={s.tileName}>{table.name}</Text>
      <View style={[s.tileDot, { backgroundColor: t.color }]} />
      <Text style={[s.tileStatus, { color: t.color }]}>{t.label}</Text>
      {order ? (
        <Text style={s.tileOrder} numberOfLines={1}>
          {order.orderNumber.slice(-8)}
        </Text>
      ) : null}
      {pending > 0 ? (
        <View style={s.tileBadge}>
          <Text style={s.tileBadgeTxt}>{pending}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ─── MenuTile ──────────────────────────────────────────────────────────────
interface MenuTileProps {
  item: MenuItem;
  category: string;
  quantity: number;
  onPress: () => void;
}

function MenuTile({ item, category, quantity, onPress }: MenuTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        s.mTile,
        quantity > 0 && s.mTileOn,
        pressed && s.tap,
      ]}
    >
      <Text style={s.mName} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={s.mPrice}>{fmt(item.price)}</Text>
      <Text style={s.mCat} numberOfLines={1}>
        {category}
      </Text>
      <View style={s.mBottom}>
        {quantity > 0 ? (
          <View style={s.mQtyBadge}>
            <Text style={s.mQtyTxt}>×{quantity} in cart</Text>
          </View>
        ) : (
          <View style={s.mAdd}>
            <Text style={s.mAddTxt}>+ Add</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── StatusBadge ───────────────────────────────────────────────────────────
const STATUS_COLORS: Record<
  OrderSummary["status"],
  { bg: string; text: string }
> = {
  DRAFT:          { bg: "#f5f5f5", text: "#525252" },
  PLACED:         { bg: "#eff6ff", text: "#1d4ed8" },
  IN_PREPARATION: { bg: "#fff7ed", text: "#c2410c" },
  READY:          { bg: "#fefce8", text: "#854d0e" },
  SERVED:         { bg: "#f0fdf4", text: "#15803d" },
  COMPLETED:      { bg: "#f0fdf4", text: "#15803d" },
  CANCELED:       { bg: "#fef2f2", text: "#b91c1c" },
};

function StatusBadge({ status }: { status: OrderSummary["status"] }) {
  const c = STATUS_COLORS[status] ?? { bg: "#f5f5f5", text: "#525252" };
  return (
    <View style={[s.sBadge, { backgroundColor: c.bg }]}>
      <Text style={[s.sBadgeTxt, { color: c.text }]}>
        {status.replace(/_/g, " ")}
      </Text>
    </View>
  );
}

// ─── Chip (generic pressable chip) ────────────────────────────────────────
function Chip({
  label,
  dark,
  onPress,
}: {
  label: string;
  dark?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        s.genericChip,
        dark && s.genericChipDark,
        pressed && s.tap,
      ]}
      onPress={onPress}
    >
      <Text style={[s.genericChipTxt, dark && s.genericChipTxtDark]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── NoticeBanner ──────────────────────────────────────────────────────────
function NoticeBanner({ text }: { text: string }) {
  return (
    <View style={s.notice}>
      <Text style={s.noticeTxt}>{text}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Base
  shell: { flex: 1, backgroundColor: "#f5ede2" },
  fill:  { flex: 1 },
  flex1: { flex: 1 },
  tap:   { opacity: 0.7 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 28,
    backgroundColor: "#f5ede2",
  },
  errTitle: { color: "#2b1d14", fontSize: 22, fontWeight: "800" },
  errText:  { color: "#6b5c4f", fontSize: 14, textAlign: "center" },
  genericChip: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#f2e6d8",
    borderWidth: 1,
    borderColor: "#d8c4ac",
  },
  genericChipDark: { backgroundColor: "#2b1d14", borderColor: "#2b1d14" },
  genericChipTxt:  { color: "#2b1d14", fontSize: 15, fontWeight: "700" },
  genericChipTxtDark: { color: "#fff" },

  // Notice banner
  notice:    { backgroundColor: "#2b1d14", paddingHorizontal: 14, paddingVertical: 8, alignItems: "center" },
  noticeTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // ── Floor header ──────────────────────────────────────────────────────────
  floorHead: {
    backgroundColor: "#fffaf3",
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ead9c6",
  },
  floorHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  floorTitle: { color: "#2b1d14", fontSize: 24, fontWeight: "900" },
  statsRow:   { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  pill: {
    backgroundColor: "#f2e6d8",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillReady: { backgroundColor: "#fef9c3" },
  pillPrep:  { backgroundColor: "#ffedd5" },
  pillText:  { color: "#2b1d14", fontSize: 12, fontWeight: "700" },
  branchRow: { gap: 6, paddingVertical: 2 },
  chip: {
    backgroundColor: "#f2e6d8",
    borderColor: "#d8c4ac",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  chipOn:    { backgroundColor: "#2b1d14", borderColor: "#2b1d14" },
  chipTxt:   { color: "#5d4a3c", fontSize: 13, fontWeight: "700" },
  chipTxtOn: { color: "#fff" },

  // ── Table grid ────────────────────────────────────────────────────────────
  tableGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
  },
  tile: {
    width: TABLE_TILE_SIZE,
    minHeight: Math.round(TABLE_TILE_SIZE * 1.05),
    borderRadius: 16,
    borderWidth: 2,
    padding: 10,
    gap: 5,
    position: "relative",
  },
  tileActive: { borderWidth: 3, borderColor: "#2b1d14" },
  tileName:   { color: "#2b1d14", fontSize: 20, fontWeight: "900", lineHeight: 24 },
  tileDot:    { width: 8, height: 8, borderRadius: 4 },
  tileStatus: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  tileOrder:  { fontSize: 10, color: "#9a5634", fontWeight: "700" },
  tileBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    backgroundColor: "#2b1d14",
    borderRadius: 999,
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  tileBadgeTxt: { color: "#fff", fontSize: 11, fontWeight: "900" },

  // ── Floor footer ──────────────────────────────────────────────────────────
  floorFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fffaf3",
    borderTopWidth: 1,
    borderTopColor: "#ead9c6",
  },
  floorFootUser: { color: "#9a5634", fontSize: 12, fontWeight: "700", flex: 1 },
  signOutBtn:    { paddingHorizontal: 10, paddingVertical: 6 },
  signOutTxt:    { color: "#c2410c", fontSize: 13, fontWeight: "700" },

  // ── Order header ──────────────────────────────────────────────────────────
  orderHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fffaf3",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ead9c6",
  },
  backBtn:   { paddingHorizontal: 10, paddingVertical: 8 },
  backTxt:   { color: "#9a5634", fontSize: 14, fontWeight: "800" },
  orderHeadCenter: { flex: 1, gap: 2 },
  orderHeadTable:  { color: "#2b1d14", fontSize: 17, fontWeight: "900" },
  orderHeadSub:    { color: "#6b5c4f", fontSize: 12, fontWeight: "600" },
  headBadge: {
    backgroundColor: "#2b1d14",
    borderRadius: 999,
    minWidth: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headBadgeTxt: { color: "#fff", fontSize: 15, fontWeight: "900" },

  // ── Filter bar ────────────────────────────────────────────────────────────
  filterBar: {
    backgroundColor: "#fffaf3",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ead9c6",
  },
  catRow: { gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  cat: {
    backgroundColor: "#f2e6d8",
    borderColor: "#d8c4ac",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
  },
  catOn:    { backgroundColor: "#2b1d14", borderColor: "#2b1d14" },
  catTxt:   { color: "#5d4a3c", fontSize: 13, fontWeight: "700" },
  catTxtOn: { color: "#fff" },
  searchWrap: { paddingHorizontal: 12, paddingTop: 4 },
  search: {
    backgroundColor: "#f2e6d8",
    borderColor: "#d8c4ac",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#2b1d14",
    minHeight: 44,
  },

  // ── Menu grid ─────────────────────────────────────────────────────────────
  menuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 },
  mTile: {
    width: MENU_TILE_W,
    backgroundColor: "#fffaf3",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#ead9c6",
    padding: 12,
    gap: 5,
  },
  mTileOn: { borderColor: "#9a5634", backgroundColor: "#fff7f0" },
  mName:   { color: "#2b1d14", fontSize: 14, fontWeight: "800", lineHeight: 19 },
  mPrice:  { color: "#9a5634", fontSize: 16, fontWeight: "900" },
  mCat:    { color: "#9a8070", fontSize: 11, fontWeight: "600" },
  mBottom: { marginTop: 2 },
  mQtyBadge: {
    backgroundColor: "#2b1d14",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  mQtyTxt:  { color: "#fff", fontSize: 12, fontWeight: "800" },
  mAdd: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#d8c4ac",
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  mAddTxt: { color: "#9a5634", fontSize: 12, fontWeight: "700" },

  // ── Empty state ───────────────────────────────────────────────────────────
  empty:    { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyTxt: { color: "#9a8070", fontSize: 15 },

  // ── Order bar ─────────────────────────────────────────────────────────────
  bar: {
    backgroundColor: "#2b1d14",
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 12,
    gap: 10,
  },
  cartScroll:      { maxHeight: 128 },
  cartScrollInner: { gap: 8, paddingVertical: 2 },
  cartCard: {
    backgroundColor: "#3d2a1e",
    borderRadius: 12,
    padding: 10,
    minWidth: 120,
    maxWidth: 160,
    gap: 4,
  },
  cartName:  { color: "#fffaf3", fontSize: 12, fontWeight: "800" },
  cartPrice: { color: "#c4986e", fontSize: 11, fontWeight: "700" },
  cartQtyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn: {
    width: 30,
    height: 30,
    backgroundColor: "#4f3928",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnTxt: { color: "#fffaf3", fontSize: 18, fontWeight: "700", lineHeight: 20 },
  qtyNum: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    minWidth: 26,
    textAlign: "center",
  },
  cartHint:    { paddingVertical: 4 },
  cartHintTxt: { color: "#9a7a68", fontSize: 13 },
  cartNoteBtn: { marginTop: 2 },
  cartNoteBtnTxt: { color: "#9a7a68", fontSize: 11, fontWeight: "600" },
  cartNoteActive: { color: "#f59e0b" },
  cartNoteInput: {
    backgroundColor: "#4f3928",
    borderRadius: 8,
    color: "#fffaf3",
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 2,
  },
  orderNoteInput: {
    backgroundColor: "#3d2a1e",
    borderRadius: 10,
    color: "#fffaf3",
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  barTotal:      { flex: 1, gap: 1 },
  barTotalLabel: { color: "#9a7a68", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  barTotalAmt:   { color: "#fff", fontSize: 24, fontWeight: "900" },
  sendBtn: {
    backgroundColor: "#f59e0b",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnOff: { backgroundColor: "#5d4a3c", opacity: 0.65 },
  sendTxt:    { color: "#2b1d14", fontSize: 16, fontWeight: "900" },
  clearBtn:   { paddingHorizontal: 8, paddingVertical: 16 },
  clearTxt:   { color: "#9a7a68", fontSize: 13, fontWeight: "700" },

  // ── Order strip (tappable summary above filter bar) ───────────────────────
  orderStrip: {
    backgroundColor: "#fff7f0",
    borderBottomWidth: 1,
    borderBottomColor: "#ead9c6",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  orderStripRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  orderStripLeft: { flex: 1, gap: 5 },
  orderStripTitle: { color: "#2b1d14", fontSize: 13, fontWeight: "800" },
  orderStripMeta:  { flexDirection: "row", gap: 5, flexWrap: "wrap" },
  orderStripMore:  { color: "#9a5634", fontSize: 11, fontWeight: "700" },
  orderStripChev:  { color: "#9a5634", fontSize: 12, fontWeight: "800" },

  // ── Order detail panel ────────────────────────────────────────────────────
  panel: {
    backgroundColor: "#fffaf3",
    borderBottomWidth: 1,
    borderBottomColor: "#ead9c6",
    maxHeight: 260,
  },
  panelLoading: {
    padding: 14,
    alignItems: "center",
  },
  panelLoadingTxt: { color: "#9a8070", fontSize: 13 },
  panelOrder: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  panelOrderBorder: {
    borderTopWidth: 1,
    borderTopColor: "#f0e8e0",
  },
  panelOrderHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  panelOrderNum: { color: "#2b1d14", fontSize: 13, fontWeight: "800" },
  panelItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 8,
  },
  panelItemName: { flex: 1, color: "#2b1d14", fontSize: 13 },
  panelItemQty:  { color: "#6b5c4f", fontSize: 13, fontWeight: "700", width: 32, textAlign: "right" },
  panelItemAmt:  { color: "#9a5634", fontSize: 13, fontWeight: "700", width: 68, textAlign: "right" },
  panelTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#ead9c6",
    marginTop: 6,
    paddingTop: 6,
  },
  panelTotalLbl: { color: "#2b1d14", fontSize: 13, fontWeight: "800" },
  panelTotalAmt: { color: "#9a5634", fontSize: 14, fontWeight: "900" },
  panelNoItems:   { color: "#9a8070", fontSize: 12, paddingVertical: 4 },
  panelOrderNote: { color: "#9a6040", fontSize: 12, fontStyle: "italic", marginBottom: 6 },
  panelItemNote:  { color: "#9a6040", fontSize: 11, fontStyle: "italic", paddingLeft: 2, paddingBottom: 2 },

  // ── Status badge ──────────────────────────────────────────────────────────
  sBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  sBadgeTxt: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});
