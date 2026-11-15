// Writes the chess lessons (content/lessons/<band>/thinking/*-chess-*.json) and their outcomes in content/knowledge-map.json.
// Run:  cd server && npm run compose:chess-lessons
//
// Every statement about a position (which square a piece can reach, whether a position is checkmate or stalemate, which pieces
// cannot force mate) is CHECKED with chess.js before anything is written; a wrong claim stops the script. Re-running it is safe:
// it overwrites the lesson files and adds each outcome to the knowledge map only once.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { Chess } from "chess.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const wiki = (t: string, slug: string) => ({ title: "Wikipedia: " + t, url: `https://en.wikipedia.org/wiki/${slug}`, license: "CC BY-SA 4.0 (reference; text is original)" });

// ---------------------------------------------------------------- facts checked with chess.js
const legal = (fen: string) => new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to);
// a rook on a1 (with the kings out of the way) can reach a8, not b2 (diagonal) and not h8 (a different line)
const rookFen = "4k3/8/8/8/8/8/8/R3K3 w - - 0 1";
assert.ok(legal(rookFen).includes("a1a8"));
assert.ok(!legal(rookFen).includes("a1b2") && !legal(rookFen).includes("a1h8"));
// a bishop on c1 reaches h6 (diagonal), not c5 (straight) and not d3? c1-d2-e3 is the diagonal; d3 is not on it
const bishopFen = "4k3/8/8/8/8/8/8/2B1K3 w - - 0 1";
assert.ok(legal(bishopFen).includes("c1h6"));
assert.ok(!legal(bishopFen).includes("c1c5") && !legal(bishopFen).includes("c1d3"));
// a knight on g1 reaches f3, not g3 or g2
const knightFen = "4k3/8/8/8/8/8/8/4K1N1 w - - 0 1";
assert.ok(legal(knightFen).includes("g1f3"));
assert.ok(!legal(knightFen).includes("g1g3") && !legal(knightFen).includes("g1g2"));
// a pawn on e2 can go to e4 on its first move, a king cannot
const pawnFen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
assert.ok(legal(pawnFen).includes("e2e4"));
// stalemate and checkmate
const stalemate = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
assert.ok(stalemate.isStalemate() && !stalemate.isCheck() && stalemate.moves().length === 0);
const backRank = new Chess("R5k1/5ppp/8/8/8/8/8/4K3 b - - 0 1");
assert.ok(backRank.isCheckmate());
const notMate = new Chess("R5k1/5ppp/8/8/8/8/8/4K3 b - - 0 1");
assert.equal(notMate.isCheck(), true);
// a check that is NOT mate: the king can capture the unprotected queen
const checkNotMate = new Chess("4k3/8/8/8/8/8/4q3/4K3 w - - 0 1"); // black queen on e2 gives check to Ke1, but the king can take it
assert.ok(checkNotMate.isCheck() && !checkNotMate.isCheckmate());
assert.ok(checkNotMate.moves().includes("Kxe2"));
// en passant: after Black plays d7-d5 next to a white pawn on e5, White may capture on d6
const ep = new Chess("4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1");
ep.move("d5");
assert.ok(ep.moves().includes("exd6"));
// castling needs the king not to have moved and the squares between to be empty
assert.ok(new Chess("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1").moves().includes("O-O"));
assert.ok(!new Chess("4k3/8/8/8/8/8/8/R3K2R w - - 0 1").moves().includes("O-O"));
// castling is not allowed out of check
assert.ok(!new Chess("4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1").moves().includes("O-O"));
// promotion: a pawn reaching the last rank can become a queen, rook, bishop or knight
const promo = new Chess("8/4P3/8/8/8/8/k7/7K w - - 0 1").moves();
assert.deepEqual(promo.filter((m) => m.startsWith("e8")).sort(), ["e8=B", "e8=N", "e8=Q", "e8=R"].sort());
// what cannot force checkmate: a lone knight or a lone bishop, with a king; a queen can
const insufficient = (fen: string) => new Chess(fen).isInsufficientMaterial();
assert.ok(insufficient("4k3/8/8/8/8/8/8/4KN2 w - - 0 1") && insufficient("4k3/8/8/8/8/8/8/4KB2 w - - 0 1"));
assert.ok(!insufficient("4k3/8/8/8/8/8/8/4KQ2 w - - 0 1") && !insufficient("4k3/8/8/8/8/8/8/4KR2 w - - 0 1"));
// the fork from puzzle l2-01: Nf3+ attacks the king on e1 and the queen on h4
const fork = new Chess("8/8/8/8/7q/K7/7N/4k3 w - - 0 1");
fork.move("Nf3+");
assert.ok(fork.attackers("h4", "w").includes("f3") && fork.attackers("e1", "w").includes("f3"));
// the back-rank mate and the smothered mate used in the last lesson
assert.ok(new Chess("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1").move("Ra8").san === "Ra8#");
assert.ok(new Chess("6rk/6pp/7N/8/8/K7/8/8 w - - 0 1").move("Nf7").san === "Nf7#");
// a skewer: the rook check on the 2nd row wins the queen behind the king
const skewerPos = new Chess("8/8/8/2q5/2k5/8/3R3K/8 w - - 0 1");
skewerPos.move("Rc2+");
assert.ok(skewerPos.isCheck());

// ---------------------------------------------------------------- lessons
type Q = { q: string; options: string[]; hints: [string, string, string]; explain: string };
const lesson = (id: string, band: string, title: string, outcome: string, minutes: number, sources: unknown[], sections: { type: string; body: string }[], quiz: Q[]) => {
  assert.equal(quiz.length, 3);
  for (const q of quiz) {
    assert.equal(new Set(q.options).size, q.options.length);
    if (q.options[0]!.length > 3) for (const h of q.hints.slice(0, 2)) assert.ok(!h.toLowerCase().includes(q.options[0]!.toLowerCase()), `${id}: a hint contains the answer: ${h}`);
  }
  return {
    id, title, band, subject: "thinking", outcomes: [outcome], sensitive: null, minutes, status: "draft", reviewers: [], sources, sections,
    quiz: quiz.map((q) => ({ q: q.q, options: q.options, answer: 0, hints: q.hints, explain: q.explain })),
  };
};
const T = (body: string) => ({ type: "text", body });
const TRY = (body: string) => ({ type: "tryit", body });
const PAR = (body: string) => ({ type: "parent", body });
const CHESS = wiki("Chess", "Chess");
const RULES = wiki("Rules of chess", "Rules_of_chess");

const lessons = [
  lesson("b2-think-chess-pieces", "b2", "Chess: The Board and How the Pieces Move", "b2-think-7", 12, [CHESS, RULES], [
    T("Chess is a game for two players. One plays White and one plays Black. The board has 64 squares, 8 rows by 8 columns, in two colours. Each player starts with 16 pieces and takes turns to move one piece."),
    T("The rook moves in straight lines, forwards, backwards and sideways, as far as it likes. The bishop moves along diagonals. The queen moves like a rook and a bishop together. The king moves one square in any direction."),
    T("The knight jumps in an L shape: two squares one way and one square to the side. It is the only piece that can jump over others. A pawn moves forward one square (two squares on its very first move) and captures one square diagonally forward."),
    T("The aim of the game is checkmate: attacking the other player's king so that it cannot escape."),
    TRY("Put a coin on any square of a chessboard. Which squares could a rook reach? A bishop? A knight? Try each in turn."),
    PAR("Play with a real board if you can, and let your child say each move out loud, for example 'knight from g1 to f3'. The chess puzzles in the app only check moves one at a time, so they pair well with a board at the table."),
  ], [
    { q: "How many squares are on a chessboard?", options: ["64", "32", "100"], hints: ["The board is a square of rows and columns.", "There are 8 rows and 8 columns. Multiply them.", "Example: a grid of 3 rows and 4 columns has 3 times 4 = 12 squares. Use 8 and 8."], explain: "8 rows times 8 columns is 64 squares." },
    { q: "A rook stands on a1 with nothing in its way. Which move can it make?", options: ["To a8, straight up", "To b2, one step on the diagonal", "To h8, across to the far corner"], hints: ["Remember how a rook moves: only in straight lines.", "A rook goes along a row or along a column. It never goes diagonally.", "Example: a bishop on c1 can go to h6 because that is a diagonal. A rook cannot, because it must stay on its own row or column. Check which option stays on the same column as a1."], explain: "The rook moves in straight lines. From a1 it can go up the a-column to a8. Going to b2 or h8 would need a diagonal move or a turn." },
    { q: "A knight stands on g1. Which square can it jump to?", options: ["f3", "g3", "g2"], hints: ["A knight moves in an L shape.", "The L is two squares in one direction and one square to the side.", "Example: a knight on b1 can jump to c3, which is two up and one across. Use the same L shape from g1."], explain: "From g1 the L shape reaches f3 (two up, one left). g3 and g2 are straight up the board, which a knight cannot do." },
  ]),

  lesson("b3-think-chess-check-mate", "b3", "Chess: Check, Checkmate and Stalemate", "b3-think-6", 12, [CHESS, wiki("Checkmate", "Checkmate"), wiki("Stalemate", "Stalemate")], [
    T("When a piece attacks the enemy king, the king is in CHECK. A player in check must get out of it at once. There are three ways: move the king to a safe square, block the attack with another piece, or capture the piece that is giving check."),
    T("If the king is in check and none of those three ways works, it is CHECKMATE. The game is over and the player who gave checkmate wins."),
    T("STALEMATE is different. It happens when the player to move is NOT in check but has no legal move at all. A stalemate is a draw, not a win. Beware of it when you are winning: if you take away every square from the lone enemy king without giving check, you may draw by accident."),
    T("A back-rank checkmate is a common one: a king stuck on its first row behind its own pawns is attacked by a rook along that row, and has nowhere to go."),
    TRY("Set up a white king, a white queen and a black king. Can you checkmate? Then move the queen so that the black king has no move but is not in check. What happened?"),
    PAR("Stalemate surprises many beginners. Practise with a king and queen against a lone king: try to give checkmate without stalemating. The chess puzzles in the app have only checkmates and winning tactics, so they never end in a stalemate."),
  ], [
    { q: "Black's king is in check from a white queen, but the king can safely capture the queen. Is it checkmate?", options: ["No, the king can escape by capturing", "Yes, any check is always checkmate", "Yes, because a queen is a very strong piece"], hints: ["Checkmate means the king has NO way out.", "Capturing the piece that gives check is one of the three ways out of check.", "Example: a king in check that can step to a safe square is not mated. Decide if capturing the queen is a way out here."], explain: "Capturing the checking piece is one of the three ways to answer check. If it is safe to do, it is not checkmate." },
    { q: "It is Black's move. Black's king on h8 is not in check, but every square it could go to is attacked, and Black has no other pieces. What is the result?", options: ["A draw by stalemate", "Black loses by checkmate", "Black wins"], hints: ["Is the king in check?", "No. The king has no legal move, but it is not attacked.", "Example: a player in check with no escape is checkmated. A player NOT in check with no legal move is something else. Decide which case this is."], explain: "The player to move has no legal move and is not in check. That is stalemate, which is a draw." },
    { q: "A white rook gives check along the back row to a king hidden behind its own three pawns, and nothing can block or capture it. What is this called?", options: ["A back-rank checkmate", "A stalemate on the back row", "A fork with the rook and king"], hints: ["Look at where the king is and what traps it.", "The king's own pawns stop it from stepping forward, so the check along the back row cannot be escaped.", "Example: a king surrounded by its own pieces cannot move to those squares. Name the mate that happens on the back row."], explain: "The king is trapped on its back row by its own pawns, and the rook attacks along that row. This is a back-rank mate." },
  ]),

  lesson("b3-think-chess-special-moves", "b3", "Chess: Castling, En Passant and Promotion", "b3-think-7", 12, [CHESS, wiki("Castling", "Castling"), wiki("En passant", "En_passant"), wiki("Promotion (chess)", "Promotion_(chess)")], [
    T("Three special moves are worth knowing. CASTLING moves the king two squares towards a rook, and the rook jumps to the other side of the king. It is the only time two pieces move at once. It helps keep your king safe."),
    T("To castle, the king and that rook must not have moved before, the squares between them must be empty, the king must not be in check, and it must not pass through or land on a square that is attacked."),
    T("PROMOTION: when a pawn reaches the far end of the board, it must become another piece. You can choose a queen, rook, bishop or knight. It cannot stay a pawn and it cannot become a king. Most players choose a queen."),
    T("EN PASSANT (French for 'in passing'): if an enemy pawn moves two squares forward from its start and lands right beside your pawn, you may capture it as if it had moved only one square. You must do it at once, on the very next move, or the chance is gone."),
    TRY("Set up a white pawn on e5 and a black pawn on d7. Move the black pawn to d5. Can your pawn capture it? Which square does your pawn end on?"),
    PAR("Special rules are easy to forget, so check them together on a real board. The chess puzzles in the app never need castling or en passant, but your child will meet them in real games."),
  ], [
    { q: "A white pawn reaches the last row of the board. What can it become?", options: ["A queen, rook, bishop or knight, as you choose", "Only a queen, because it is the strongest piece", "A king, because that is the most important piece"], hints: ["Think about what a pawn can turn into when it is promoted.", "It must change into a piece, and you get to choose which one.", "Example: a player may pick a knight if it gives check at once. That shows there is more than one choice. List which pieces are allowed."], explain: "A promoted pawn becomes a queen, rook, bishop or knight, never a king and never a pawn." },
    { q: "Which one stops a player from castling?", options: ["The king is in check", "The queen has moved", "A pawn is on the second row"], hints: ["Castling involves the king and one rook.", "A player cannot castle out of check.", "Example: a king that has already moved can never castle, even if it comes back. Look for the option about the king's safety."], explain: "You cannot castle out of check. The king and the rook must not have moved, but what the queen or the pawns have done does not matter." },
    { q: "Black plays a pawn two squares from d7 to d5, landing next to a white pawn on e5. What can White do?", options: ["Capture it en passant, moving the pawn to d6", "Nothing at all, because it is already too late to do anything", "Capture it on d5 with a rook straight away"], hints: ["Look at where the white pawn stands compared to the black pawn.", "En passant lets you capture a pawn that jumped two squares, as if it had stepped only one.", "Example: if a pawn moves from b7 to b5 beside a white pawn on a5, White may capture on b6. Decide which square is passed over here."], explain: "The black pawn jumped over d6 and landed next to White's pawn. White can capture it en passant, moving to d6, but only on the very next move." },
  ]),

  lesson("b3-think-chess-values", "b3", "Chess: What Are the Pieces Worth?", "b3-think-8", 10, [CHESS, wiki("Chess piece relative value", "Chess_piece_relative_value")], [
    T("Players give each piece a number to help them decide whether a trade is good. These are guides, not rules. A pawn is worth 1, a knight 3, a bishop 3, a rook 5 and a queen 9. The king cannot be traded, because losing it ends the game."),
    T("Count the points when you trade. If you capture a rook (5) and lose a knight (3), you gain 2 points. That is a good trade. If you give up a queen (9) for a rook (5), you lose 4 points."),
    T("The numbers are only a guide. Checkmate beats everything: a player who can give checkmate does not mind losing a queen. Sometimes position matters more than points."),
    TRY("Write down the point value of everything you captured and everything you lost in your last game. Who was ahead?"),
    PAR("Point values help beginners avoid giving away pieces. Ask your child to count before every capture: 'what do I win, and what might I lose?'."),
  ], [
    { q: "Which piece is worth more, a rook or a bishop?", options: ["A rook (about 5 points)", "A bishop (about 5 points)", "They are worth the same"], hints: ["Think about how many points each piece is worth.", "A bishop is worth about 3. What is a rook worth?", "Example: a knight is worth 3 and a queen is worth 9, so the queen is worth more. Compare the rook and the bishop in the same way."], explain: "A rook is worth about 5 points and a bishop about 3." },
    { q: "About how many pawns is a queen worth?", options: ["9", "5", "3"], hints: ["A pawn is worth 1 point.", "Look at the queen's point value in the lesson.", "Example: a rook is worth 5 points, so it is worth 5 pawns. Use the queen's value instead."], explain: "A queen is worth about 9 points, which is about 9 pawns." },
    { q: "You capture a rook (5) and then lose your knight (3) in return. What is the result in points?", options: ["You gain 2 points", "You lose 2 points", "It is equal"], hints: ["Add up what you won, then take away what you lost.", "5 won, 3 lost. Subtract.", "Example: winning a bishop (3) and losing a pawn (1) gives 3 - 1 = 2 points gained. Do the same with 5 and 3."], explain: "You won 5 points and lost 3, so you are 2 points ahead." },
  ]),

  lesson("b4-think-chess-openings", "b4", "Chess: How to Start a Game", "b4-think-11", 12, [CHESS, wiki("Chess opening theory", "Chess_opening_theory")], [
    T("The first moves of a game are called the opening. You do not need to memorise lots of moves. A few ideas will take you a long way."),
    T("1. Control the centre. The four squares in the middle (d4, e4, d5, e5) give your pieces room. Moving a centre pawn forward on your first move, such as e4 or d4, is a common start."),
    T("2. Develop your pieces. 'Develop' means moving knights and bishops off the back row to squares where they do something. Knights usually come out before bishops. Try not to move the same piece twice in the opening without a good reason."),
    T("3. Castle early. Castling puts your king in a safer corner and brings a rook into play."),
    T("4. Do not bring your queen out too soon. A queen that attacks early can be chased by smaller pieces, which gives your opponent free moves. Before each move, check what your opponent's last move threatens."),
    TRY("Play a short practice game and write down your first eight moves. Count how many knights and bishops you developed and whether you castled."),
    PAR("These ideas are guidelines. There are exceptions, and strong players break them for good reasons, but beginners do well to follow them. Replaying a game and asking 'what was my plan here?' is better than learning memorised lines."),
  ], [
    { q: "Which is a good idea in the opening?", options: ["Control the centre and develop knights and bishops", "Move the queen out as early as possible to start attacking", "Move the same piece many times in a row"], hints: ["Think about the four opening ideas in the lesson.", "Look for the option that gets your pieces working together.", "Example: bringing a knight from the back row to a central square is developing it. Spot the option that matches the lesson's advice."], explain: "Controlling the centre and developing knights and bishops helps all your pieces work. The other two waste time or expose your queen." },
    { q: "Why is it usually a good idea to castle early?", options: ["It makes the king safer and brings a rook into play", "It wins a pawn from your opponent and stops them castling", "It stops the other player from ever castling later"], hints: ["Think about what castling does for the king and the rook.", "Castling moves the king towards a corner and the rook next to it.", "Example: a king in the middle of the board is easier to attack than one tucked behind pawns. Pick the option about safety."], explain: "Castling tucks the king away and moves a rook towards the centre." },
    { q: "Why is it risky to bring your queen out on move one or two?", options: ["Smaller pieces can chase it, giving your opponent free moves", "A queen is not allowed to move early in the game, by the rules", "It makes your pawns weaker in the middle"], hints: ["The queen is your most valuable piece. What can attack it?", "Knights and pawns are worth less, so they can attack it safely.", "Example: if a pawn attacks your queen, you must move her again, and your opponent develops a piece for free. Find the option about being chased."], explain: "Cheaper pieces can attack your queen. Each time she moves, your opponent gets a free development move." },
  ]),

  lesson("b4-think-chess-tactics", "b4", "Chess Tactics: Forks, Pins, Skewers and Discovered Attacks", "b4-think-12", 14, [CHESS, wiki("Fork (chess)", "Fork_(chess)"), wiki("Pin (chess)", "Pin_(chess)"), wiki("Skewer (chess)", "Skewer_(chess)"), wiki("Discovered attack", "Discovered_attack")], [
    T("A TACTIC is a short combination of moves that wins material or checkmate by force. Here are four of the most common."),
    T("A FORK is a move that attacks two pieces at once. A knight is especially good at forking because it attacks in an L shape. The opponent can save only one piece, so you win the other. A fork that includes the king is the strongest: the king must answer the check and the other piece is lost."),
    T("A PIN is an attack on a piece that cannot move without exposing a more valuable piece behind it. If the piece behind is the king, the pinned piece may not move at all, because that would be illegal."),
    T("A SKEWER is like a pin the other way round. You attack a valuable piece, often the king, and when it moves out of the way you capture the piece behind it."),
    T("A DISCOVERED ATTACK happens when you move one piece out of the way so that another piece behind it attacks. The piece you moved can make a threat of its own at the same time."),
    T("Example fork: White's knight on h2 jumps to f3 with check. It attacks the black king on e1 and also the black queen on h4. Black must deal with the check and White captures the queen."),
    TRY("Set up a white knight and a black king and queen so the knight can fork them. Where must the knight land?"),
    PAR("Tactics are the most fun part of chess to learn. The Winning tactics puzzles in the app have forks and skewers. Encourage your child to ask 'what does this move attack?' and 'what does it leave undefended?' on every move."),
  ], [
    { q: "A move that attacks two enemy pieces at the same time is called a...", options: ["Fork", "Stalemate", "Promotion"], hints: ["Think of the tool with two prongs.", "The opponent can only save one of the two pieces.", "Example: a pin attacks one piece that is stuck in front of another. This question is about a move that attacks two pieces at once. Name it."], explain: "A fork attacks two pieces at once. The opponent can save only one." },
    { q: "How is a skewer different from a pin?", options: ["The valuable piece is in front and must move, so you capture the one behind it", "The cheaper piece is in front and cannot move, because moving it would expose the king", "A skewer only works with pawns, and only on the second row of the board"], hints: ["Both attacks use a line with two pieces on it.", "Look at which of the two pieces is in front in each tactic.", "Example: in a pin the cheaper piece is in front and cannot safely move. A skewer is the reverse. Find the option that says so."], explain: "In a skewer, the valuable piece in front has to move, and then you capture the piece behind it. In a pin it is the other way round." },
    { q: "White's knight jumps from h2 to f3, giving check to the black king on e1. What else does that knight attack?", options: ["The black queen on h4", "A pawn on the f2 square next to the white king", "Nothing, it only gives check"], hints: ["A knight attacks squares an L shape away.", "From f3, one L-shaped jump reaches h4. Look at what is standing there.", "Example: a knight on c3 attacks e4, e2, d5, b5, a4 and a2. Work out the L-shaped squares from f3."], explain: "From f3 a knight attacks h4 as well as e1, so it forks the king and the queen." },
  ]),

  lesson("b4-think-chess-endgames", "b4", "Chess Endgames: Checkmating With Few Pieces", "b4-think-13", 14, [CHESS, wiki("Chess endgame", "Chess_endgame"), wiki("Draw (chess)", "Draw_(chess)")], [
    T("An endgame is the last part of a game when few pieces are left. Knowing basic endgames helps you turn an advantage into a win."),
    T("Which pieces can force checkmate against a lone king? A king and queen can. A king and rook can. A king and a single knight cannot, and neither can a king and a single bishop. With so little material, the game is a draw."),
    T("The method is to push the enemy king to the edge of the board, because a king in the middle has too many squares. Use your king to help: it must come close to take squares away from the enemy king."),
    T("The great danger is stalemate. If you give the lone king no moves while not giving check, the game is drawn. A good habit before each move: 'Does the enemy king still have a legal move, or is it in check?'"),
    TRY("Set up a king and queen against a king and practise driving the enemy king to the edge. After each move, check that you have not stalemated."),
    PAR("Drawn endgames and stalemate tricks are very common in beginners' games. If your child keeps drawing won positions, practise king and queen against king over and over."),
  ], [
    { q: "Which of these can force checkmate against a lone king?", options: ["A king and a queen", "A king and a single knight", "A king and a single bishop"], hints: ["Think about which pieces control a lot of squares.", "A lone knight or a lone bishop is not enough, on its own.", "Example: with a king and rook against a king you can force mate by driving the king to the edge. Decide which option is that strong."], explain: "A king and queen can force checkmate. A king and one knight, or a king and one bishop, cannot." },
    { q: "You have a king and queen against a lone king. Black's king on h8 has no legal move, but is not in check. What is the result of the game?", options: ["A draw by stalemate", "A win for White by checkmate", "A win for Black"], hints: ["Is Black's king being attacked?", "It is not in check, and it has no legal move.", "Example: a king that is attacked and cannot escape is checkmated. Is that this case, or the other case where the king is simply stuck?"], explain: "Black is not in check and has no legal moves. That is stalemate, a draw, even though White has far more pieces." },
    { q: "Why is it a good idea to drive the lone enemy king to the edge of the board?", options: ["On the edge it has fewer squares to run to, so it is easier to trap", "The edge squares are worth more points than the squares in the middle of the board", "Kings are not allowed to stay in the middle of the board"], hints: ["Count how many squares a king can reach in the middle, then at the edge.", "A king in the middle can step to 8 squares. On the edge it has fewer.", "Example: a king in a corner can step to only 3 squares. Think about why that helps you."], explain: "A king on the edge has fewer squares, so it is easier to take them all away and give checkmate." },
  ]),

  lesson("b5-think-chess-patterns", "b5", "Chess Patterns and Planning: Common Checkmates", "b5-think-9", 14, [CHESS, wiki("Back-rank checkmate", "Back-rank_checkmate"), wiki("Smothered mate", "Smothered_mate")], [
    T("Strong players recognise patterns. When you have seen a checkmate pattern a few times, you spot it in a game within seconds. Here are some common ones."),
    T("BACK-RANK MATE: the enemy king is stuck on its first row behind its own pawns. A rook or queen that reaches that row gives check, and the king cannot escape. The fix, if you are the one in danger, is to make a little escape square for your king with a pawn move such as h3."),
    T("SMOTHERED MATE: the king is surrounded by its own pieces, so it has no squares. A knight gives check, and because a knight's check cannot be blocked, it is mate. It often ends with the king in a corner."),
    T("QUEEN AND KING MATE: with the queen protected by your king, she can give check right next to the enemy king, which cannot capture her."),
    T("Planning matters as much as patterns. Before every move ask three questions: What did my opponent's last move threaten? What are my pieces and my opponent's king doing? Which move improves my position or makes a threat without leaving a piece undefended?"),
    TRY("Look at the three checkmate puzzles in the app. For each, write down the pattern name and what trapped the king."),
    PAR("Naming the pattern is a lasting skill: it turns puzzles into recognition. The mate-in-one puzzles in the app use these patterns, and the explanation after each one names it."),
  ], [
    { q: "A black king on g8 sits behind pawns on f7, g7 and h7. A white rook gives check on the back row and cannot be blocked. What is this pattern?", options: ["Back-rank mate", "Smothered mate", "Stalemate"], hints: ["Where is the king, and what is stopping it from stepping forward?", "Its own pawns trap it on its back row.", "Example: a king trapped in a corner by its own rook and pawns, and mated by a knight, is a different pattern. Name the pattern that uses a rook on the back row."], explain: "The king's own pawns shut it in on the back rank, and the rook gives check along that rank: a back-rank mate." },
    { q: "A king in the corner is surrounded by its own rook and pawns. A white knight gives check, and no piece can capture it. Which pattern is this?", options: ["Smothered mate", "Back-rank mate", "A fork"], hints: ["Look at what stops the king moving.", "The king is smothered by its own pieces.", "Example: with pawns in front and a rook beside it, the king has no free squares. Name the mate where a knight delivers the check."], explain: "The king cannot move because its own pieces fill the squares around it, and the knight's check cannot be blocked. This is a smothered mate." },
    { q: "Before you move, which question is the most useful habit?", options: ["What did my opponent's last move threaten?", "Which piece have I not moved yet in this game so far?", "Can I move my queen to the centre of the board?"], hints: ["Good players check for danger first.", "A move that ignores your opponent's threat can lose a piece.", "Example: if your opponent moved a knight next to your queen, the first thing to notice is that the queen may be attacked. Pick the question that looks for that kind of danger."], explain: "Checking what your opponent just threatened stops you walking into tactics. It is the best habit in chess." },
  ]),
];

// ---------------------------------------------------------------- write files and outcomes
const outcomes: [string, string, string][] = [
  ["b2-think-6", "b2-think-7", "Knows how each chess piece moves and how the board is laid out"],
  ["b3-think-5", "b3-think-6", "Tells check, checkmate and stalemate apart"],
  ["b3-think-6", "b3-think-7", "Knows castling, en passant and promotion"],
  ["b3-think-7", "b3-think-8", "Uses piece values to judge a trade in chess"],
  ["b4-think-10", "b4-think-11", "Follows the basic opening principles in chess"],
  ["b4-think-11", "b4-think-12", "Recognises forks, pins, skewers and discovered attacks"],
  ["b4-think-12", "b4-think-13", "Knows which pieces can checkmate alone and how to avoid stalemate"],
  ["b5-think-8", "b5-think-9", "Recognises common checkmate patterns and plans before moving"],
];

for (const l of lessons) {
  writeFileSync(join(root, `content/lessons/${l.band}/thinking/${l.id}.json`), JSON.stringify(l, null, 2) + "\n");
  console.log("wrote", l.id);
}
const mapPath = join(root, "content/knowledge-map.json");
let raw = readFileSync(mapPath, "utf8");
const nl = raw.includes("\r\n") ? "\r\n" : "\n";
for (const [after, id, text] of outcomes) {
  if (raw.includes(`"${id}"`)) continue;
  const key = `{ "id": "${after}", "text": `;
  const i = raw.indexOf(key);
  assert.ok(i >= 0, `outcome ${after} not found`);
  const j = raw.indexOf("}", i);
  raw = raw.slice(0, j + 1) + `,${nl}      { "id": "${id}", "text": "${text}" }` + raw.slice(j + 1);
}
writeFileSync(mapPath, raw);
console.log("outcomes ok");
