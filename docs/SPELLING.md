# Spelling: British and American

Daily spelling practice (task T3) asks a child to spell words. Most words are spelled the same everywhere, but some are not: *colour* and *color*, *centre* and *center*. A family chooses which spelling its children learn.

## How it works

- **The setting** is per family, in the parent area under **Spelling**: *Automatic*, *British spelling (colour, favourite)* or *American spelling (color, favorite)*. It is stored on the parent (`parents.spelling_variant`, `uk` or `us`, empty = automatic) and is changed with `PATCH /parent/settings { spellingVariant }`.
- **Automatic** follows the family's country (`defaultSpellingVariant` in `server/src/content.ts`): the USA and the Philippines suggest American; Britain, Ireland, Australia, New Zealand, India, South Africa, Singapore, Malaysia, Pakistan, Bangladesh, Sri Lanka, Kenya, Nigeria and Ghana suggest British. Any other country, a mixed one such as Canada, or no country suggests **nothing**. The parent can always choose. These defaults are a starting point, not a claim about any country's rules.
- **With no spelling known, the words that differ are simply not asked.** The child gets only the words that are spelled the same, so nobody is taught a spelling their family did not choose.
- **In the word lists** (`content/spelling/<band>.json`) a word that differs has `word` (the American spelling, which is also its key) and `uk` (the British one). The sentence is written with the American spelling and the server swaps it for the family's (`sentenceFor`). Progress is stored under the American spelling, so a word a child has learned stays learned if the family changes its setting.
- **The child sees, hears and is checked against the family's spelling.** The other country's spelling typed by mistake is marked wrong, with a plain explanation ("That is how Americans spell it. Your family uses British spelling."). It is never offered as a wrong answer in a multiple-choice question, and a word whose two spellings use the same letters (*centre*, *center*) is never given as an unscramble exercise.
- **Count of words** in the parent view of "Words learned" only counts words that can be asked.

## Rules the validator enforces (`npm run validate`)

A word with `uk`: the British spelling must differ, must not also be a word of its own, must not appear in the word's own sentence or meaning, and the word has no `tip` (a tip is shown whichever spelling is used). **Neither spelling of any such word may appear in the text of any other word in any list**, so a British family never meets "color" in someone's sentence. (This found and fixed existing sentences that used "Mum", "maths" and "practise", and a few words of UK vocabulary: "tea", "trousers", "sweets".)

## Adding a word that differs

Append an entry with `word` (American), `uk` (British), a level, a meaning and a sentence containing the American spelling. Run `npm run validate`. Keep it `draft`: a reviewer must confirm the spelling and the age fit.

## Not covered

- **Vocabulary, not spelling:** *queue* (British; Americans say *line*), *tap* (faucet), *truck* (lorry) and similar words stay in the lists as they are. A reviewer in your region may want to swap them.
- **Lessons and quizzes** are written in one spelling and are not translated by this setting.
- **Text-to-speech** reads the family's spelling with the phone's own voice; accents are the phone's, not ours.
- **Canadian, Indian and other mixed usage:** the setting offers two spellings only.
