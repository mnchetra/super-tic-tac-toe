# Super Tic Tac Toe

A local two-player (hot-seat) Super Tic Tac Toe game. Nine boards, nine colors, depth-styled cells, sound, and score tracking. No build step, no dependencies.

## Play

**Live demo:** https://mnchetra.github.io/super-tic-tac-toe/

Or open `index.html` in any modern browser. That's it.

If you prefer to serve it:

```sh
npx serve .
```

## Rules

- The grid is nine small tic-tac-toe boards arranged in a 3×3 macro grid.
- X moves first. Claim a small board with three in a row.
- The square you pick sends your opponent to the **matching board** on the macro grid.
- If that board is already won or full, your opponent may play on any open board.
- Claim three small boards in a row (horizontal, vertical, or diagonal) to win the round.
- A full small board with no line becomes a draw and is closed for the rest of the round.
- If every board closes without a three-board line, the round is a draw.

## Controls

| Input | Action |
| --- | --- |
| Click / tap | Place a mark on a glowing square |
| Arrow keys + Enter | Move focus and place a mark |
| `U` | Undo |
| `N` | New round |
| `M` | Mute / unmute |
| `Esc` | Close the result card |

Rounds alternate who starts. Wins, draws, round number, and the mute preference are saved in `localStorage`.

## Files

- `index.html` — markup and inline SVG gradients
- `style.css` — layout, nine board palettes, depth styling, animations
- `game.js` — rules, turn flow, undo, scoring, sound
