// POSITION OBJECT

// A Pos instance represents a position within the text.
export function Pos (line, ch) {
  if (!(this instanceof Pos)) return new Pos(line, ch);
  this.line = line; this.ch = ch;
}

// Compare two positions, return 0 if they are the same, a negative
// number when a is less, and a positive number otherwise.
export function cmp(a, b) { return a.line - b.line || a.ch - b.ch; }

export function copyPos(x) {return Pos(x.line, x.ch);}
export function maxPos(a, b) { return cmp(a, b) < 0 ? b : a; }
export function minPos(a, b) { return cmp(a, b) < 0 ? a : b; }
