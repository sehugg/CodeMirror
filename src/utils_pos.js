import { Pos } from "./Pos";
import { getLine } from "./utils_line";

// Most of the external API clips given positions to make sure they
// actually exist within the document.
export function clipLine(doc, n) {return Math.max(doc.first, Math.min(n, doc.first + doc.size - 1));}
export function clipPos(doc, pos) {
  if (pos.line < doc.first) return Pos(doc.first, 0);
  var last = doc.first + doc.size - 1;
  if (pos.line > last) return Pos(last, getLine(doc, last).text.length);
  return clipToLen(pos, getLine(doc, pos.line).text.length);
}
function clipToLen(pos, linelen) {
  var ch = pos.ch;
  if (ch == null || ch > linelen) return Pos(pos.line, linelen);
  else if (ch < 0) return Pos(pos.line, 0);
  else return pos;
}
export function clipPosArray(doc, array) {
  for (var out = [], i = 0; i < array.length; i++) out[i] = clipPos(doc, array[i]);
  return out;
}
