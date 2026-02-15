import { useEffect, useMemo, useRef, useState } from "react";

import {
  type GameState,
  type PlayerId,
  type RoomCode,
  type ServerToClient,
  RoomCodeSchema,
  serializeServerMessage
} from "@connect-4/shared";

type Player = 1 | 2;

type Winner = {
  player: Player;
  cells: Array<[number, number]>;
};

type Move = {
  player: Player;
  row: number;
  col: number;
};

const ROWS = 6;
const COLS = 7;

const createBoard = () =>
  Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0));

const getAvailableRow = (board: number[][], col: number) => {
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (board[row][col] === 0) {
      return row;
    }
  }
  return -1;
};

const checkWinner = (board: number[][]): Winner | null => {
  const directions: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const player = board[row][col];
      if (player === 0) continue;

      for (const [dr, dc] of directions) {
        const cells: Array<[number, number]> = [[row, col]];
        for (let k = 1; k < 4; k += 1) {
          const r = row + dr * k;
          const c = col + dc * k;
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;
          if (board[r][c] !== player) break;
          cells.push([r, c]);
        }
        if (cells.length === 4) {
          return { player: player as Player, cells };
        }
      }
    }
  }

  return null;
};

const isBoardFull = (board: number[][]) =>
  board.every((row) => row.every((cell) => cell !== 0));

const playerLabel = (player: Player) => (player === 1 ? "Red" : "Yellow");

type GameMode = "local" | "computer" | "online";
type Difficulty = "easy" | "medium" | "hard";
type ColorChoice = "red" | "yellow";

const getValidColumns = (board: number[][]) =>
  Array.from({ length: COLS }, (_, col) => col).filter(
    (col) => getAvailableRow(board, col) !== -1
  );

const applyMove = (board: number[][], col: number, player: Player) => {
  const row = getAvailableRow(board, col);
  if (row < 0) return null;
  const nextBoard = board.map((r) => [...r]);
  nextBoard[row][col] = player;
  return nextBoard;
};

const pickRandom = (choices: number[]) =>
  choices[Math.floor(Math.random() * choices.length)];

const findWinningMove = (board: number[][], player: Player) => {
  const valid = getValidColumns(board);
  for (const col of valid) {
    const nextBoard = applyMove(board, col, player);
    if (!nextBoard) continue;
    if (checkWinner(nextBoard)?.player === player) {
      return col;
    }
  }
  return null;
};

const scorePosition = (board: number[][], player: Player) => {
  const opponent: Player = player === 1 ? 2 : 1;
  let score = 0;

  const centerCol = Math.floor(COLS / 2);
  let centerCount = 0;
  for (let row = 0; row < ROWS; row += 1) {
    if (board[row][centerCol] === player) centerCount += 1;
  }
  score += centerCount * 3;

  const evaluateWindow = (window: number[]) => {
    const playerCount = window.filter((cell) => cell === player).length;
    const oppCount = window.filter((cell) => cell === opponent).length;
    const emptyCount = window.filter((cell) => cell === 0).length;

    if (playerCount === 4) score += 100;
    else if (playerCount === 3 && emptyCount === 1) score += 5;
    else if (playerCount === 2 && emptyCount === 2) score += 2;

    if (oppCount === 3 && emptyCount === 1) score -= 4;
  };

  // Horizontal
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS - 3; col += 1) {
      const window = [
        board[row][col],
        board[row][col + 1],
        board[row][col + 2],
        board[row][col + 3]
      ];
      evaluateWindow(window);
    }
  }

  // Vertical
  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row < ROWS - 3; row += 1) {
      const window = [
        board[row][col],
        board[row + 1][col],
        board[row + 2][col],
        board[row + 3][col]
      ];
      evaluateWindow(window);
    }
  }

  // Diagonal down-right
  for (let row = 0; row < ROWS - 3; row += 1) {
    for (let col = 0; col < COLS - 3; col += 1) {
      const window = [
        board[row][col],
        board[row + 1][col + 1],
        board[row + 2][col + 2],
        board[row + 3][col + 3]
      ];
      evaluateWindow(window);
    }
  }

  // Diagonal up-right
  for (let row = 3; row < ROWS; row += 1) {
    for (let col = 0; col < COLS - 3; col += 1) {
      const window = [
        board[row][col],
        board[row - 1][col + 1],
        board[row - 2][col + 2],
        board[row - 3][col + 3]
      ];
      evaluateWindow(window);
    }
  }

  return score;
};

const minimax = (
  board: number[][],
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  player: Player
): { score: number; col: number | null } => {
  const opponent: Player = player === 1 ? 2 : 1;
  const winner = checkWinner(board);
  const valid = getValidColumns(board);

  if (winner?.player === player) return { score: 100000 + depth, col: null };
  if (winner?.player === opponent) return { score: -100000 - depth, col: null };
  if (depth === 0 || valid.length === 0) {
    return { score: scorePosition(board, player), col: null };
  }

  if (maximizing) {
    let bestScore = -Infinity;
    let bestCol: number | null = null;
    for (const col of valid) {
      const nextBoard = applyMove(board, col, player);
      if (!nextBoard) continue;
      const result = minimax(nextBoard, depth - 1, alpha, beta, false, player);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestCol = col;
      }
      alpha = Math.max(alpha, bestScore);
      if (alpha >= beta) break;
    }
    return { score: bestScore, col: bestCol };
  }

  let bestScore = Infinity;
  let bestCol: number | null = null;
  for (const col of valid) {
    const nextBoard = applyMove(board, col, opponent);
    if (!nextBoard) continue;
    const result = minimax(nextBoard, depth - 1, alpha, beta, true, player);
    if (result.score < bestScore) {
      bestScore = result.score;
      bestCol = col;
    }
    beta = Math.min(beta, bestScore);
    if (alpha >= beta) break;
  }
  return { score: bestScore, col: bestCol };
};

const chooseComputerMove = (
  board: number[][],
  difficulty: Difficulty,
  computerPlayer: Player
) => {
  const valid = getValidColumns(board);
  if (valid.length === 0) return null;

  if (difficulty === "easy") {
    return pickRandom(valid);
  }

  const winningMove = findWinningMove(board, computerPlayer);
  if (winningMove !== null) return winningMove;

  if (difficulty === "medium") {
    const blockMove = findWinningMove(board, computerPlayer === 1 ? 2 : 1);
    return blockMove ?? pickRandom(valid);
  }

  const blockMove = findWinningMove(board, computerPlayer === 1 ? 2 : 1);
  if (blockMove !== null) return blockMove;

  const { col } = minimax(board, 4, -Infinity, Infinity, true, computerPlayer);
  return col ?? pickRandom(valid);
};

function wsUrlFromWindow(): string {
  const env = (import.meta as any).env?.VITE_WS_URL as string | undefined;
  if (env) return env;

  // Default: assume WS server on same host, port 8787
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.hostname}:8787`;
}

function roomCodeFromUrl(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get("room");
}

function setRoomCodeInUrl(roomCode: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  window.history.replaceState({}, "", url.toString());
}

function clearRoomCodeFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState({}, "", url.toString());
}

function playerIdToPlayer(p: PlayerId): Player {
  return p === "P1" ? 1 : 2;
}

export default function App() {
  const [board, setBoard] = useState<number[][]>(createBoard);
  const [currentPlayer, setCurrentPlayer] = useState<Player>(1);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [isDraw, setIsDraw] = useState(false);
  const [mode, setMode] = useState<GameMode>("local");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [colorChoice, setColorChoice] = useState<ColorChoice>("red");
  const [history, setHistory] = useState<Move[]>([]);
  const [showEvaluation, setShowEvaluation] = useState(false);

  // Online state
  const socketRef = useRef<WebSocket | null>(null);
  const [onlineRoomCodeInput, setOnlineRoomCodeInput] = useState("");
  const [onlineRoomCode, setOnlineRoomCode] = useState<RoomCode | null>(null);
  const [onlineYou, setOnlineYou] = useState<PlayerId | null>(null);
  const [onlineState, setOnlineState] = useState<GameState | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [onlineError, setOnlineError] = useState<string | null>(null);

  const humanPlayer: Player = colorChoice === "red" ? 1 : 2;
  const computerPlayer: Player = humanPlayer === 1 ? 2 : 1;

  const winningCells = useMemo(() => {
    if (!winner) return new Set<string>();
    return new Set(winner.cells.map(([row, col]) => `${row}-${col}`));
  }, [winner]);

  const evaluation = useMemo(() => {
    if (!showEvaluation) return 0;
    const raw = scorePosition(board, 1) - scorePosition(board, 2);
    const normalized = Math.max(-1, Math.min(1, raw / 50));
    return normalized;
  }, [board, showEvaluation]);

  const onlineInviteLink = useMemo(() => {
    if (!onlineRoomCode) return null;
    const url = new URL(window.location.href);
    url.searchParams.set("room", onlineRoomCode);
    return url.toString();
  }, [onlineRoomCode]);

  const handleDrop = (col: number) => {
    if (mode === "online") {
      if (!onlineRoomCode || !onlineYou || !socketRef.current) return;
      if (!onlineState) return;
      if (onlineState.status !== "playing") return;
      if (onlineState.nextTurn !== onlineYou) return;
      socketRef.current.send(
        JSON.stringify({ type: "make_move", roomCode: onlineRoomCode, col })
      );
      return;
    }

    if (winner || isDraw) return;
    if (mode === "computer" && currentPlayer === computerPlayer) return;

    const row = getAvailableRow(board, col);
    if (row < 0) return;

    const nextBoard = board.map((r) => [...r]);
    nextBoard[row][col] = currentPlayer;

    const nextWinner = checkWinner(nextBoard);
    const nextDraw = !nextWinner && isBoardFull(nextBoard);

    setBoard(nextBoard);
    setWinner(nextWinner);
    setIsDraw(nextDraw);
    setHistory((prev) => [...prev, { player: currentPlayer, row, col }]);

    if (!nextWinner && !nextDraw) {
      setCurrentPlayer(currentPlayer === 1 ? 2 : 1);
    }
  };

  const resetLocalGame = () => {
    setBoard(createBoard());
    setCurrentPlayer(1);
    setWinner(null);
    setIsDraw(false);
    setHistory([]);
  };

  function disconnectOnline() {
    try {
      socketRef.current?.close();
    } catch {
      // ignore
    }
    socketRef.current = null;
    setOnlineStatus("idle");
    setOnlineError(null);
    setOnlineRoomCode(null);
    setOnlineYou(null);
    setOnlineState(null);
    clearRoomCodeFromUrl();
  }

  function ensureSocket(): WebSocket {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return socketRef.current;
    }

    const url = wsUrlFromWindow();
    const ws = new WebSocket(url);
    socketRef.current = ws;
    setOnlineStatus("connecting");
    setOnlineError(null);

    ws.onopen = () => {
      setOnlineStatus("connected");
      setOnlineError(null);
    };

    ws.onclose = () => {
      setOnlineStatus("idle");
    };

    ws.onerror = () => {
      setOnlineStatus("error");
      setOnlineError("WebSocket error");
    };

    ws.onmessage = (ev) => {
      let data: any;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }

      const msg = data as ServerToClient;

      if (msg.type === "room_created") {
        setOnlineRoomCode(msg.roomCode as RoomCode);
        setOnlineYou(msg.you.playerId as PlayerId);
        setOnlineError(null);
        setOnlineState(null);
        setRoomCodeInUrl(msg.roomCode);
      } else if (msg.type === "room_joined") {
        setOnlineRoomCode(msg.roomCode as RoomCode);
        setOnlineYou(msg.you.playerId as PlayerId);
        setOnlineState(msg.state as GameState);
        setOnlineError(null);
        setRoomCodeInUrl(msg.roomCode);
      } else if (msg.type === "state") {
        setOnlineState(msg.state as GameState);
      } else if (msg.type === "error") {
        setOnlineError(msg.message);
      }
    };

    return ws;
  }

  function createOnlineRoom() {
    const ws = ensureSocket();
    const sendCreate = () => ws.send(JSON.stringify({ type: "create_room" }));
    if (ws.readyState === WebSocket.OPEN) sendCreate();
    else ws.addEventListener("open", sendCreate, { once: true });

    setMode("online");
    resetLocalGame();
  }

  function joinOnlineRoom(codeRaw: string) {
    const code = codeRaw.trim().toUpperCase();
    const parsed = RoomCodeSchema.safeParse(code);
    if (!parsed.success) {
      setOnlineError("Invalid room code");
      return;
    }

    const ws = ensureSocket();
    const sendJoin = () =>
      ws.send(JSON.stringify({ type: "join_room", roomCode: parsed.data }));
    if (ws.readyState === WebSocket.OPEN) sendJoin();
    else ws.addEventListener("open", sendJoin, { once: true });

    setMode("online");
    resetLocalGame();
  }

  // Auto-join via invite link (?room=CODE)
  useEffect(() => {
    const code = roomCodeFromUrl();
    if (!code) return;
    joinOnlineRoom(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect server state into UI board/winner/draw/history
  useEffect(() => {
    if (mode !== "online") return;
    if (!onlineState) return;

    const b = (onlineState.board as unknown as number[][]) ?? createBoard();
    setBoard(b);

    if (onlineState.status === "won" && onlineState.winner) {
      setWinner({ player: playerIdToPlayer(onlineState.winner), cells: [] });
      setIsDraw(false);
    } else {
      setWinner(null);
      setIsDraw(onlineState.status === "draw");
    }

    setCurrentPlayer(playerIdToPlayer(onlineState.nextTurn));

    // Keep a lightweight history from lastMove
    if (onlineState.lastMove) {
      setHistory((prev) => {
        const last = prev[prev.length - 1];
        const m = onlineState.lastMove!;
        const next = {
          player: playerIdToPlayer(m.by),
          row: m.row,
          col: m.col
        };
        if (last && last.row === next.row && last.col === next.col) return prev;
        return [...prev, next];
      });
    }
  }, [mode, onlineState]);

  // Computer mode effect (unchanged)
  useEffect(() => {
    if (mode !== "computer") return;
    if (winner || isDraw) return;
    if (currentPlayer !== computerPlayer) return;

    const move = chooseComputerMove(board, difficulty, computerPlayer);
    if (move === null) return;
    const row = getAvailableRow(board, move);
    if (row < 0) return;

    const timer = window.setTimeout(() => {
      const nextBoard = applyMove(board, move, computerPlayer);
      if (!nextBoard) return;

      const nextWinner = checkWinner(nextBoard);
      const nextDraw = !nextWinner && isBoardFull(nextBoard);

      setBoard(nextBoard);
      setWinner(nextWinner);
      setIsDraw(nextDraw);
      setHistory((prev) => [...prev, { player: computerPlayer, row, col: move }]);
      setCurrentPlayer(humanPlayer);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    board,
    computerPlayer,
    currentPlayer,
    difficulty,
    humanPlayer,
    isDraw,
    mode,
    winner
  ]);

  const headerTitle = mode === "online" ? "Online Play" : "Local Play";

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Connect 4</p>
          <h1>{headerTitle}</h1>
          <p className="subtext">
            Drop tokens into columns and connect four in a row, column, or diagonal.
          </p>
        </div>
        <div className="status">
          {mode === "online" ? (
            onlineState?.status === "won" && onlineState.winner ? (
              <span className="status-pill winner">
                {onlineState.winner === "P1" ? "Red" : "Yellow"} wins
              </span>
            ) : onlineState?.status === "draw" ? (
              <span className="status-pill draw">Draw</span>
            ) : onlineState?.status === "waiting" ? (
              <span className="status-pill draw">Waiting for opponent…</span>
            ) : onlineState?.status === "playing" ? (
              <span
                className={`status-pill player-${
                  onlineState.nextTurn === "P1" ? 1 : 2
                }`}
              >
                {onlineState.nextTurn === "P1" ? "Red" : "Yellow"} to move
              </span>
            ) : (
              <span className="status-pill draw">Connecting…</span>
            )
          ) : winner ? (
            <span className="status-pill winner">{playerLabel(winner.player)} wins</span>
          ) : isDraw ? (
            <span className="status-pill draw">Draw</span>
          ) : mode === "computer" && currentPlayer === computerPlayer ? (
            <span className="status-pill draw">Computer thinking...</span>
          ) : (
            <span className={`status-pill player-${currentPlayer}`}>
              {playerLabel(currentPlayer)} to move
            </span>
          )}
        </div>
      </header>

      <div className={`layout ${showEvaluation ? "has-eval" : ""}`}>
        {showEvaluation && (
          <aside className="evaluation">
            <div className="evaluation-bar" aria-label="Position evaluation">
              <div className="evaluation-midline" />
              <div
                className={`evaluation-fill ${
                  evaluation >= 0 ? "red-advantage" : "yellow-advantage"
                }`}
                style={{
                  height: `${Math.abs(evaluation) * 50}%`,
                  top: evaluation < 0 ? 0 : "50%"
                }}
              />
            </div>
            <div className="evaluation-label">
              {evaluation === 0
                ? "Even"
                : evaluation > 0
                  ? "Red ahead"
                  : "Yellow ahead"}
            </div>
          </aside>
        )}

        <div className="main">
          <section className="board" role="grid">
            {board.map((row, rowIndex) => (
              <div className="board-row" role="row" key={`row-${rowIndex}`}>
                {row.map((cell, colIndex) => {
                  const tokenClass =
                    cell === 0 ? "" : cell === 1 ? "token red" : "token yellow";
                  const lastMove = history[history.length - 1];
                  const lastMoveClass =
                    lastMove &&
                    lastMove.row === rowIndex &&
                    lastMove.col === colIndex
                      ? "last-move"
                      : "";

                  return (
                    <button
                      key={`cell-${rowIndex}-${colIndex}`}
                      type="button"
                      className={`cell ${lastMoveClass}`}
                      onClick={() => handleDrop(colIndex)}
                      aria-label={`Drop in column ${colIndex + 1}`}
                    >
                      <span className={`token-shell ${tokenClass}`} />
                    </button>
                  );
                })}
              </div>
            ))}
          </section>

          <div className="controls">
            <div className="mode-controls">
              <label className="select-label" htmlFor="mode-select">
                Mode
              </label>
              <select
                id="mode-select"
                value={mode}
                onChange={(event) => {
                  const nextMode = event.target.value as GameMode;
                  setMode(nextMode);
                  setOnlineError(null);
                  setOnlineState(null);
                  setOnlineRoomCode(null);
                  setOnlineYou(null);
                  if (nextMode !== "online") disconnectOnline();
                  resetLocalGame();
                }}
              >
                <option value="local">Local 2P</option>
                <option value="computer">Vs Computer</option>
                <option value="online">Online (Invite link)</option>
              </select>

              <label className="select-label" htmlFor="difficulty-select">
                Difficulty
              </label>
              <select
                id="difficulty-select"
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as Difficulty)}
                disabled={mode !== "computer"}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>

              <label className="select-label" htmlFor="color-select">
                You play
              </label>
              <select
                id="color-select"
                value={colorChoice}
                onChange={(event) => {
                  setColorChoice(event.target.value as ColorChoice);
                  resetLocalGame();
                }}
                disabled={mode !== "computer"}
              >
                <option value="red">Red</option>
                <option value="yellow">Yellow</option>
              </select>

              <label className="select-label" htmlFor="eval-toggle">
                Eval bar
              </label>
              <button
                id="eval-toggle"
                type="button"
                className={`toggle ${showEvaluation ? "on" : "off"}`}
                onClick={() => setShowEvaluation((prev) => !prev)}
              >
                {showEvaluation ? "On" : "Off"}
              </button>
            </div>

            <button
              type="button"
              className="reset"
              onClick={() => {
                if (mode === "online") {
                  // For now, easiest reset is: disconnect and let users create/join again.
                  disconnectOnline();
                }
                resetLocalGame();
              }}
            >
              Reset board
            </button>

            {mode === "online" && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  WS: {wsUrlFromWindow()} · Status: {onlineStatus}
                </div>
                {onlineYou && (
                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    You are: {onlineYou === "P1" ? "Red" : "Yellow"}
                  </div>
                )}
                {onlineInviteLink && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>Invite link</div>
                    <input
                      type="text"
                      readOnly
                      value={onlineInviteLink}
                      style={{ width: "100%" }}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </div>
                )}
                {onlineError && (
                  <div style={{ marginTop: 8, color: "#ff6b6b", fontSize: 12 }}>
                    {onlineError}
                  </div>
                )}
                <div className="online-form" style={{ marginTop: 10 }}>
                  <input
                    type="text"
                    placeholder="Room code"
                    value={onlineRoomCodeInput}
                    onChange={(e) => setOnlineRoomCodeInput(e.target.value)}
                  />
                  <button type="button" onClick={() => joinOnlineRoom(onlineRoomCodeInput)}>
                    Join
                  </button>
                  <button type="button" onClick={createOnlineRoom}>
                    Create room
                  </button>
                  <button type="button" onClick={disconnectOnline}>
                    Leave
                  </button>
                </div>
              </div>
            )}

            <div className="legend">
              <span className="legend-item">
                <span className="legend-dot red" /> Red
              </span>
              <span className="legend-item">
                <span className="legend-dot yellow" /> Yellow
              </span>
              <span className="legend-item last-move-label">
                <span className="legend-dot last" /> Last move
              </span>
            </div>
          </div>
        </div>

        <aside className="history">
          <h2>Move History</h2>
          {history.length === 0 ? (
            <p className="history-empty">No moves yet.</p>
          ) : (
            <ol className="history-list">
              {history.map((move, index) => (
                <li key={`${move.player}-${index}`}>
                  {playerLabel(move.player)} to column {move.col + 1}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>

      {mode !== "online" && (
        <section className="online">
          <div>
            <h2>Online Play</h2>
            <p>Switch the mode to “Online (Invite link)” to play over the internet.</p>
          </div>
        </section>
      )}
    </div>
  );
}
