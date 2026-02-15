import cors from "cors";
import express from "express";
import { createServer } from "http";
import { customAlphabet, nanoid } from "nanoid";
import { WebSocketServer, WebSocket } from "ws";

import {
  type ClientToServer,
  type GameState,
  type PlayerId,
  type RoomCode,
  parseClientMessage,
  serializeServerMessage
} from "@connect-4/shared";

const PORT = Number(process.env.PORT ?? 8787);

// Avoid ambiguous characters (0/O/1/I) for room codes.
const makeRoomCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

type Client = {
  id: string;
  socket: WebSocket;
  roomCode?: RoomCode;
  playerId?: PlayerId;
};

type Room = {
  code: RoomCode;
  clients: Set<Client>;
  state: GameState;
  createdAt: number;
  lastActiveAt: number;
};

const rooms = new Map<RoomCode, Room>();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * Optional HTTP helper for room creation (kept for convenience).
 * The multiplayer flow should primarily use WebSocket `create_room`.
 */
app.post("/api/rooms", (_req, res) => {
  const roomCode = makeRoomCode() as RoomCode;
  const room = createRoom(roomCode);
  rooms.set(roomCode, room);
  res.status(201).json({ roomCode });
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

function send(socket: WebSocket, payload: unknown) {
  socket.send(typeof payload === "string" ? payload : JSON.stringify(payload));
}

function sendProtocol(socket: WebSocket, msg: Parameters<typeof serializeServerMessage>[0]) {
  send(socket, serializeServerMessage(msg));
}

function broadcast(room: Room, msg: Parameters<typeof serializeServerMessage>[0]) {
  const payload = serializeServerMessage(msg);
  for (const client of room.clients) {
    send(client.socket, payload);
  }
}

function emptyBoard(): number[][] {
  // 6 rows x 7 cols
  return Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => 0));
}

function createRoom(code: RoomCode): Room {
  const now = Date.now();
  const state: GameState = {
    roomCode: code,
    status: "waiting",
    board: emptyBoard() as any,
    nextTurn: "P1",
    players: {
      P1: { connected: false },
      P2: { connected: false }
    }
  };

  return {
    code,
    clients: new Set(),
    state,
    createdAt: now,
    lastActiveAt: now
  };
}

function updatePresence(room: Room) {
  const connected: Record<PlayerId, boolean> = { P1: false, P2: false };
  for (const c of room.clients) {
    if (c.playerId) connected[c.playerId] = true;
  }

  room.state.players.P1 = { connected: connected.P1 };
  room.state.players.P2 = { connected: connected.P2 };

  // If both connected and game hasn't started, start it.
  if (connected.P1 && connected.P2 && room.state.status === "waiting") {
    room.state.status = "playing";
    room.state.nextTurn = "P1";
  }

  // If someone disconnected mid-game, keep state but it's still "playing".
  // (We can refine this later with reconnect windows.)
}

function otherPlayer(p: PlayerId): PlayerId {
  return p === "P1" ? "P2" : "P1";
}

function cellValue(playerId: PlayerId): 1 | 2 {
  return playerId === "P1" ? 1 : 2;
}

function applyMove(state: GameState, by: PlayerId, col: number): { row: number } | { error: string } {
  if (state.status !== "playing") return { error: "Game is not in playing state" };
  if (state.nextTurn !== by) return { error: "Not your turn" };
  if (col < 0 || col > 6) return { error: "Invalid column" };

  const board = state.board as unknown as number[][];

  // find lowest empty row
  for (let row = board.length - 1; row >= 0; row--) {
    if (board[row][col] === 0) {
      board[row][col] = cellValue(by);
      state.lastMove = { col, row, by };

      if (checkWin(board, row, col)) {
        state.status = "won";
        state.winner = by;
      } else if (checkDraw(board)) {
        state.status = "draw";
      } else {
        state.nextTurn = otherPlayer(by);
      }

      return { row };
    }
  }

  return { error: "Column is full" };
}

function checkDraw(board: number[][]): boolean {
  return board[0].every((cell) => cell !== 0);
}

function checkWin(board: number[][], row: number, col: number): boolean {
  const val = board[row][col];
  if (val === 0) return false;

  const directions = [
    { dr: 0, dc: 1 }, // horizontal
    { dr: 1, dc: 0 }, // vertical
    { dr: 1, dc: 1 }, // diag down-right
    { dr: 1, dc: -1 } // diag down-left
  ];

  for (const { dr, dc } of directions) {
    let count = 1;
    count += countDir(board, row, col, dr, dc, val);
    count += countDir(board, row, col, -dr, -dc, val);
    if (count >= 4) return true;
  }

  return false;
}

function countDir(board: number[][], row: number, col: number, dr: number, dc: number, val: number): number {
  let r = row + dr;
  let c = col + dc;
  let count = 0;
  while (r >= 0 && r < board.length && c >= 0 && c < board[0].length && board[r][c] === val) {
    count++;
    r += dr;
    c += dc;
  }
  return count;
}

function ensureRoom(code: RoomCode): Room {
  const existing = rooms.get(code);
  if (existing) return existing;
  const room = createRoom(code);
  rooms.set(code, room);
  return room;
}

function pickPlayerId(room: Room): PlayerId | null {
  const taken = new Set<PlayerId>();
  for (const c of room.clients) {
    if (c.playerId) taken.add(c.playerId);
  }
  if (!taken.has("P1")) return "P1";
  if (!taken.has("P2")) return "P2";
  return null;
}

wss.on("connection", (socket) => {
  const client: Client = {
    id: nanoid(8),
    socket
  };

  // Backward-compatible hello
  send(socket, JSON.stringify({ type: "connected", clientId: client.id }));

  socket.on("message", (raw) => {
    const rawText = raw.toString();

    let msg: ClientToServer;
    try {
      msg = parseClientMessage(rawText);
    } catch {
      sendProtocol(socket, { type: "error", code: "INVALID_MESSAGE", message: "Invalid message" });
      return;
    }

    if (msg.type === "create_room") {
      const roomCode = makeRoomCode() as RoomCode;
      const room = ensureRoom(roomCode);

      client.roomCode = roomCode;
      client.playerId = "P1";
      room.clients.add(client);
      room.lastActiveAt = Date.now();

      updatePresence(room);

      sendProtocol(socket, {
        type: "room_created",
        roomCode,
        you: { playerId: client.playerId }
      });
      broadcast(room, { type: "state", roomCode, state: room.state });
      return;
    }

    if (msg.type === "join_room") {
      const roomCode = msg.roomCode;
      const room = rooms.get(roomCode);

      if (!room) {
        sendProtocol(socket, { type: "error", roomCode, code: "ROOM_NOT_FOUND", message: "Room not found" });
        return;
      }

      if (client.roomCode) {
        sendProtocol(socket, { type: "error", roomCode, code: "ALREADY_IN_ROOM", message: "Already in a room" });
        return;
      }

      const slot = pickPlayerId(room);
      if (!slot) {
        sendProtocol(socket, { type: "error", roomCode, code: "ROOM_FULL", message: "Room is full" });
        return;
      }

      client.roomCode = roomCode;
      client.playerId = slot;
      room.clients.add(client);
      room.lastActiveAt = Date.now();

      updatePresence(room);

      sendProtocol(socket, {
        type: "room_joined",
        roomCode,
        you: { playerId: slot },
        state: room.state
      });

      broadcast(room, { type: "state", roomCode, state: room.state });
      return;
    }

    if (msg.type === "make_move") {
      const roomCode = msg.roomCode;
      const room = rooms.get(roomCode);
      if (!room) {
        sendProtocol(socket, { type: "error", roomCode, code: "ROOM_NOT_FOUND", message: "Room not found" });
        return;
      }

      if (client.roomCode !== roomCode || !client.playerId) {
        sendProtocol(socket, { type: "error", roomCode, code: "NOT_IN_ROOM", message: "Not in this room" });
        return;
      }

      updatePresence(room);

      const result = applyMove(room.state, client.playerId, msg.col);
      room.lastActiveAt = Date.now();

      if ("error" in result) {
        sendProtocol(socket, { type: "error", roomCode, code: "INVALID_MOVE", message: result.error });
        return;
      }

      broadcast(room, { type: "state", roomCode, state: room.state });
      return;
    }

    if (msg.type === "leave") {
      const roomCode = msg.roomCode;
      const room = rooms.get(roomCode);
      if (!room) return;

      if (client.roomCode === roomCode) {
        room.clients.delete(client);
        client.roomCode = undefined;
        client.playerId = undefined;

        updatePresence(room);
        broadcast(room, { type: "state", roomCode, state: room.state });
      }
      return;
    }
  });

  socket.on("close", () => {
    if (!client.roomCode) return;
    const room = rooms.get(client.roomCode);
    if (!room) return;

    room.clients.delete(client);
    updatePresence(room);

    // If nobody is connected, keep the room around briefly (so links can be re-used),
    // but we'll GC it via cleanup.
    room.lastActiveAt = Date.now();

    broadcast(room, { type: "state", roomCode: room.code, state: room.state });

    client.roomCode = undefined;
    client.playerId = undefined;
  });
});

// Basic garbage collection for demo servers: remove inactive rooms.
const ROOM_TTL_MS = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.clients.size > 0) continue;
    if (now - room.lastActiveAt > ROOM_TTL_MS) rooms.delete(code);
  }
}, 60 * 1000).unref();

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
