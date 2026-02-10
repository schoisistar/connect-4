import { useEffect, useMemo, useState } from "react";

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

type GameMode = "local" | "computer";
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
    const blockMove = findWinningMove(
      board,
      computerPlayer === 1 ? 2 : 1
    );
    return blockMove ?? pickRandom(valid);
  }

  const blockMove = findWinningMove(board, computerPlayer === 1 ? 2 : 1);
  if (blockMove !== null) return blockMove;

  const { col } = minimax(board, 4, -Infinity, Infinity, true, computerPlayer);
  return col ?? pickRandom(valid);
};

export default function App() {
  const [board, setBoard] = useState<number[][]>(createBoard);
  const [currentPlayer, setCurrentPlayer] = useState<Player>(1);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [isDraw, setIsDraw] = useState(false);
  const [mode, setMode] = useState<GameMode>("local");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [colorChoice, setColorChoice] = useState<ColorChoice>("red");
  const [isComputerThinking, setIsComputerThinking] = useState(false);
  const [history, setHistory] = useState<Move[]>([]);
  const [showEvaluation, setShowEvaluation] = useState(false);
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

  const handleDrop = (col: number) => {
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

  const resetGame = () => {
    setBoard(createBoard());
    setCurrentPlayer(1);
    setWinner(null);
    setIsDraw(false);
    setIsComputerThinking(false);
    setHistory([]);
  };

  useEffect(() => {
    if (mode !== "computer") return;
    if (winner || isDraw) return;
    if (currentPlayer !== computerPlayer) return;

    const move = chooseComputerMove(board, difficulty, computerPlayer);
    if (move === null) return;
    const row = getAvailableRow(board, move);
    if (row < 0) return;

    setIsComputerThinking(true);
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
      setIsComputerThinking(false);
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

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Connect 4</p>
          <h1>Local Play</h1>
          <p className="subtext">
            Drop tokens into columns and connect four in a row, column, or diagonal.
          </p>
        </div>
        <div className="status">
          {winner ? (
            <span className="status-pill winner">
              {playerLabel(winner.player)} wins
            </span>
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

      <div className="layout">
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
                  const winnerClass = winningCells.has(`${rowIndex}-${colIndex}`)
                    ? "winner-cell"
                    : "";
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
                      className={`cell ${winnerClass} ${lastMoveClass}`}
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
                  resetGame();
                }}
              >
                <option value="local">Local 2P</option>
                <option value="computer">Vs Computer</option>
              </select>
              <label className="select-label" htmlFor="difficulty-select">
                Difficulty
              </label>
              <select
                id="difficulty-select"
                value={difficulty}
                onChange={(event) =>
                  setDifficulty(event.target.value as Difficulty)
                }
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
                  resetGame();
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
            <button type="button" className="reset" onClick={resetGame}>
              Reset board
            </button>
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
                  {index + 1}. {playerLabel(move.player)} to column{" "}
                  {move.col + 1}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>

      <section className="online">
        <div>
          <h2>Online Play (Coming Soon)</h2>
          <p>
            You will be able to share an invite key to play over the internet. The
            server scaffolding is ready for WebSocket rooms.
          </p>
        </div>
        <div className="online-form">
          <input
            type="text"
            placeholder="Invite key"
            disabled
            aria-disabled="true"
          />
          <button type="button" disabled>
            Join
          </button>
          <button type="button" disabled>
            Create room
          </button>
        </div>
      </section>
    </div>
  );
}
