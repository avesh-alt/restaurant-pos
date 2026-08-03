import AsyncStorage from "@react-native-async-storage/async-storage";

export interface OrderDraftLine {
  menuItemId: string;
  quantity: number;
  notes: string;
}

export interface OrderDraft {
  activeBranchId: string | null;
  selectedTableId: string;
  selectedMenuItemId: string;
  quantity: string;
  notes: string;
  cartLines: OrderDraftLine[];
  cartByTableId?: Record<string, OrderDraftLine[]>;
}

function draftKey(userId: string): string {
  return `restaurant-pos.mobile.order-draft.${userId}`;
}

export async function loadStoredOrderDraft(userId: string): Promise<OrderDraft | null> {
  const rawDraft = await AsyncStorage.getItem(draftKey(userId));

  if (!rawDraft) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawDraft) as Partial<OrderDraft>;
    const cartByTableId =
      parsed.cartByTableId && typeof parsed.cartByTableId === "object"
        ? Object.entries(parsed.cartByTableId).reduce<Record<string, OrderDraftLine[]>>((accumulator, [tableId, lines]) => {
            if (!Array.isArray(lines)) {
              return accumulator;
            }

            accumulator[tableId] = lines.filter((line): line is OrderDraftLine => {
              return (
                typeof line === "object" &&
                line !== null &&
                typeof line.menuItemId === "string" &&
                typeof line.quantity === "number" &&
                typeof line.notes === "string"
              );
            });

            return accumulator;
          }, {})
        : undefined;

    return {
      activeBranchId: parsed.activeBranchId ?? null,
      selectedTableId: parsed.selectedTableId ?? "",
      selectedMenuItemId: parsed.selectedMenuItemId ?? "",
      quantity: parsed.quantity ?? "1",
      notes: parsed.notes ?? "",
      cartLines: Array.isArray(parsed.cartLines)
        ? parsed.cartLines.filter((line): line is OrderDraftLine => {
            return (
              typeof line === "object" &&
              line !== null &&
              typeof line.menuItemId === "string" &&
              typeof line.quantity === "number" &&
              typeof line.notes === "string"
            );
          })
        : [],
      ...(cartByTableId ? { cartByTableId } : {}),
    };
  } catch {
    return null;
  }
}

export async function saveStoredOrderDraft(userId: string, draft: OrderDraft): Promise<void> {
  await AsyncStorage.setItem(draftKey(userId), JSON.stringify(draft));
}

export async function clearStoredOrderDraft(userId: string): Promise<void> {
  await AsyncStorage.removeItem(draftKey(userId));
}
