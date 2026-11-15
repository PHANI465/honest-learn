import { Chess, type PieceSymbol, type Square } from "chess.js";
import { useMemo, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { colors } from "../lib/theme";

/**
 * A chess board made of 8x8 tappable squares with Unicode pieces (no images). Tap a piece, then a highlighted square to move it.
 * Move rules come from chess.js. The board only lets the side to move play legal moves; whether a move is the RIGHT move is
 * decided by the server (see routes/games.ts), never here.
 */

// The solid glyphs for both colours; white pieces are drawn in white with a dark outline so both read on any square.
// The text-presentation selector (U+FE0E) stops phones from turning the pawn into an emoji.
const GLYPH: Record<PieceSymbol, string> = { k: "♚︎", q: "♛︎", r: "♜︎", b: "♝︎", n: "♞︎", p: "♟︎" };
const NAME: Record<PieceSymbol, string> = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };

const LIGHT = "#F1E6CF";
const DARK = "#8FA67A";

export interface BoardMove {
  from: string;
  to: string;
  promotion?: string;
}

export function ChessBoard({
  fen,
  onMove,
  disabled,
  lastMove,
  accent = colors.brand,
  flipped = false,
}: {
  fen: string;
  onMove: (move: BoardMove) => void;
  disabled?: boolean;
  lastMove?: { from: string; to: string } | null;
  accent?: string;
  /** Show the board from Black's side (Black's pieces at the bottom), for a child playing Black against the computer. */
  flipped?: boolean;
}) {
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<string | null>(null);
  const chess = useMemo(() => new Chess(fen), [fen]);
  const size = Math.max(36, Math.min(60, Math.floor((Math.min(width, 520) - 40) / 8)));
  const turn = chess.turn();

  const targets = useMemo(() => {
    if (!selected) return new Map<string, boolean>();
    const moves = chess.moves({ square: selected as Square, verbose: true });
    return new Map(moves.map((m) => [m.to as string, !!m.captured]));
  }, [chess, selected]);

  function press(sq: string) {
    if (disabled) return;
    if (selected && targets.has(sq)) {
      const piece = chess.get(selected as Square);
      const lastRank = sq[1] === "8" || sq[1] === "1";
      onMove({ from: selected, to: sq, promotion: piece?.type === "p" && lastRank ? "q" : undefined });
      setSelected(null);
      return;
    }
    const here = chess.get(sq as Square);
    setSelected(here && here.color === turn && sq !== selected ? sq : null);
  }

  return (
    <View accessibilityLabel="Chess board" style={{ alignSelf: "center", borderWidth: 3, borderColor: colors.ink }}>
      {(flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]).map((rank) => (
        <View key={rank} style={{ flexDirection: "row" }}>
          {(flipped ? "hgfedcba" : "abcdefgh").split("").map((file) => {
            const sq = `${file}${rank}`;
            const piece = chess.get(sq as Square);
            const dark = (file.charCodeAt(0) - 97 + rank) % 2 === 1;
            const isSel = selected === sq;
            const target = targets.has(sq);
            const capture = targets.get(sq) === true;
            const last = lastMove && (lastMove.from === sq || lastMove.to === sq);
            const label = `${piece ? `${piece.color === "w" ? "White" : "Black"} ${NAME[piece.type]} on ${sq}` : `Empty square ${sq}`}${isSel ? ", selected" : ""}${target ? (capture ? ", you can capture here" : ", you can move here") : ""}`;
            return (
              <Pressable
                key={sq}
                onPress={() => press(sq)}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: isSel, disabled: !!disabled }}
                style={{ width: size, height: size, backgroundColor: last ? "#E8D77A" : dark ? DARK : LIGHT, alignItems: "center", justifyContent: "center" }}
              >
                {isSel ? <View pointerEvents="none" style={{ position: "absolute", inset: 0, borderWidth: 4, borderColor: accent }} /> : null}
                {piece ? (
                  <Text
                    aria-hidden
                    style={{
                      fontSize: size * 0.82,
                      lineHeight: size * 0.95,
                      color: piece.color === "w" ? "#FFFFFF" : "#1F2430",
                      textShadowColor: piece.color === "w" ? "#1F2430" : "transparent",
                      textShadowOffset: { width: 0, height: 0 },
                      textShadowRadius: 3,
                    }}
                  >
                    {GLYPH[piece.type]}
                  </Text>
                ) : null}
                {target && !capture ? <View pointerEvents="none" style={{ position: "absolute", width: size * 0.3, height: size * 0.3, borderRadius: size, backgroundColor: accent, opacity: 0.85 }} /> : null}
                {target && capture ? <View pointerEvents="none" style={{ position: "absolute", inset: 2, borderRadius: size, borderWidth: 4, borderColor: accent, opacity: 0.9 }} /> : null}
                {rank === (flipped ? 8 : 1) ? <Text aria-hidden style={{ position: "absolute", right: 2, bottom: 0, fontSize: 12, fontWeight: "700", color: dark ? "#F1E6CF" : "#5E6573" }}>{file}</Text> : null}
                {file === (flipped ? "h" : "a") ? <Text aria-hidden style={{ position: "absolute", left: 2, top: 0, fontSize: 12, fontWeight: "700", color: dark ? "#F1E6CF" : "#5E6573" }}>{rank}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
