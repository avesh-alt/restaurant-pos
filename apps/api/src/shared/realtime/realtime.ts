import type { Server as HttpServer } from "node:http";

import { Server as SocketIOServer, type Socket } from "socket.io";

import { AppError } from "../errors/app-error.js";
import { verifyAccessToken, type VerifiedAccessTokenPayload } from "../../modules/auth/auth.service.js";

export interface DashboardChangeEvent {
  restaurantId: string;
  branchId?: string | null;
  orderId?: string;
  tableId?: string;
  reason: "order_created" | "order_updated" | "order_items_appended" | "table_updated" | "menu_updated";
}

interface RealtimeSocketData {
  user: VerifiedAccessTokenPayload;
  activeBranchId?: string;
}

type RealtimeSocket = Socket<Record<string, never>, {
  authenticated: (payload: { restaurantId: string; branchId?: string }) => void;
  dashboard: (event: DashboardChangeEvent) => void;
}, Record<string, never>, RealtimeSocketData>;

let io: SocketIOServer | null = null;

function buildRoomNames(payload: VerifiedAccessTokenPayload): string[] {
  const rooms = [`restaurant:${payload.restaurantId}`];

  if (payload.branchId) {
    rooms.push(`branch:${payload.branchId}`);
  }

  return rooms;
}

export function initializeRealtime(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const branchId = socket.handshake.auth?.branchId;

      if (typeof token !== "string" || token.length === 0) {
        throw new AppError("Missing access token.", 401, "ACCESS_TOKEN_REQUIRED");
      }

      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      if (typeof branchId === "string" && branchId.length > 0) {
        socket.data.activeBranchId = branchId;
      }
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Socket authentication failed."));
    }
  });

  io.on("connection", (socket: RealtimeSocket) => {
    const user = socket.data.user;
    const activeBranchId = socket.data.activeBranchId ?? user.branchId;

    for (const roomName of buildRoomNames(user)) {
      socket.join(roomName);
    }

    if (activeBranchId) {
      socket.join(`branch:${activeBranchId}`);
    }

    const authenticatedPayload: { restaurantId: string; branchId?: string } = {
      restaurantId: user.restaurantId ?? "",
    };

    if (activeBranchId) {
      authenticatedPayload.branchId = activeBranchId;
    }

    socket.emit("authenticated", authenticatedPayload);
  });

  return io;
}

export function emitDashboardChange(event: DashboardChangeEvent): void {
  if (!io) {
    return;
  }

  io.to(`restaurant:${event.restaurantId}`).emit("dashboard:changed", event);

  if (event.branchId) {
    io.to(`branch:${event.branchId}`).emit("dashboard:changed", event);
  }
}
