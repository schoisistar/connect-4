# Connect 4 (Web)

Local Connect 4 with a scaffolded WebSocket server for invite-key multiplayer.

## Stack
- Client: React + Vite + TypeScript
- Server: Express + WebSocket (ws) + TypeScript

## Quick start

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:8787

## Scripts

```bash
npm run dev       # client + server
npm run build     # client build
npm run typecheck # client + server
```

## Notes
- Local play is fully functional.
- Online play UI is stubbed; server provides room creation + join scaffolding.
