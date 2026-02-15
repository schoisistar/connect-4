import { z } from "zod";

/**
 * Room code shown in invite links, e.g. https://example.com/?room=ABC123
 */
export const RoomCodeSchema = z
  .string()
  .min(4)
  .max(12)
  .regex(/^[A-Z2-9]+$/, "roomCode must be uppercase base32-ish (A-Z,2-9)");
export type RoomCode = z.infer<typeof RoomCodeSchema>;

export type PlayerId = "P1" | "P2";

export type Cell = 0 | 1 | 2; // 0 empty, 1 P1, 2 P2
export type Board = Cell[][]; // [row][col]

export type GameStatus = "waiting" | "playing" | "won" | "draw";

export type GameState = {
  roomCode: RoomCode;
  status: GameStatus;
  board: Board;
  nextTurn: PlayerId;
  winner?: PlayerId;
  lastMove?: { col: number; row: number; by: PlayerId };
  players: {
    P1?: { connected: boolean };
    P2?: { connected: boolean };
  };
};

// --------- WebSocket protocol (v1) ---------

export const ClientToServerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_room") }),
  z.object({
    type: z.literal("join_room"),
    roomCode: RoomCodeSchema,
  }),
  z.object({
    type: z.literal("make_move"),
    roomCode: RoomCodeSchema,
    col: z.number().int().min(0).max(6),
  }),
  z.object({
    type: z.literal("leave"),
    roomCode: RoomCodeSchema,
  }),
]);
export type ClientToServer = z.infer<typeof ClientToServerSchema>;

export const ServerToClientSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("room_created"),
    roomCode: RoomCodeSchema,
    you: z.object({ playerId: z.union([z.literal("P1"), z.literal("P2")]) }),
  }),
  z.object({
    type: z.literal("room_joined"),
    roomCode: RoomCodeSchema,
    you: z.object({ playerId: z.union([z.literal("P1"), z.literal("P2")]) }),
    state: z.any(), // keep loose to avoid circular typing w/ runtime zod; server sends GameState
  }),
  z.object({
    type: z.literal("state"),
    roomCode: RoomCodeSchema,
    state: z.any(),
  }),
  z.object({
    type: z.literal("error"),
    roomCode: RoomCodeSchema.optional(),
    code: z.string(),
    message: z.string(),
  }),
]);
export type ServerToClient = z.infer<typeof ServerToClientSchema>;

export function parseClientMessage(raw: string): ClientToServer {
  return ClientToServerSchema.parse(JSON.parse(raw));
}

export function serializeServerMessage(msg: ServerToClient): string {
  return JSON.stringify(msg);
}
