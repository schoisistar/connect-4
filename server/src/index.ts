import cors from "cors";
import express from "express";
import { createServer } from "http";
import { nanoid } from "nanoid";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 8787);

type Client = {
  id: string;
  socket: WebSocket;
  roomId?: string;
  playerSlot?: 1 | 2;
};

type Room = {
  id: string;
  clients: Set<Client>;
};

const rooms = new Map<string, Room>();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/rooms", (_req, res) => {
  const id = nanoid(6).toUpperCase();
  const room: Room = { id, clients: new Set() };
  rooms.set(id, room);
  res.status(201).json({ roomId: id });
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

const send = (socket: WebSocket, payload: unknown) => {
  socket.send(JSON.stringify(payload));
};

const broadcast = (room: Room, payload: unknown) => {
  for (const client of room.clients) {
    send(client.socket, payload);
  }
};

wss.on("connection", (socket) => {
  const client: Client = {
    id: nanoid(8),
    socket
  };

  send(socket, { type: "connected", clientId: client.id });

  socket.on("message", (raw) => {
    let message: { type: string; roomId?: string } | null = null;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "error", message: "Invalid JSON payload" });
      return;
    }

    if (!message) return;

    if (message.type === "join" && message.roomId) {
      const roomId = message.roomId.toUpperCase();
      const room = rooms.get(roomId);
      if (!room) {
        send(socket, { type: "error", message: "Room not found" });
        return;
      }

      if (client.roomId) {
        send(socket, { type: "error", message: "Already in a room" });
        return;
      }

      const slots = Array.from(room.clients).map((c) => c.playerSlot);
      const nextSlot = slots.includes(1) ? 2 : 1;
      if (slots.includes(1) && slots.includes(2)) {
        send(socket, { type: "error", message: "Room is full" });
        return;
      }

      client.roomId = roomId;
      client.playerSlot = nextSlot;
      room.clients.add(client);

      send(socket, { type: "joined", roomId, playerSlot: nextSlot });
      broadcast(room, {
        type: "presence",
        players: Array.from(room.clients).map((c) => ({
          id: c.id,
          slot: c.playerSlot
        }))
      });
    }
  });

  socket.on("close", () => {
    if (!client.roomId) return;
    const room = rooms.get(client.roomId);
    if (!room) return;

    room.clients.delete(client);
    if (room.clients.size === 0) {
      rooms.delete(client.roomId);
      return;
    }

    broadcast(room, {
      type: "presence",
      players: Array.from(room.clients).map((c) => ({
        id: c.id,
        slot: c.playerSlot
      }))
    });
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
