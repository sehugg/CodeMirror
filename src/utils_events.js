import { mac } from "./sniffs";
import Pos from "./Pos";
import { charWidth, coordsChar, paddingH } from "./position_measurement";
import { countColumn } from "./utils";
import { getLine } from "./utils_line";

// Due to the fact that we still support jurassic IE versions, some
// compatibility wrappers are needed.

export function e_preventDefault(e) {
  if (e.preventDefault) e.preventDefault();
  else e.returnValue = false;
}
export function e_stopPropagation(e) {
  if (e.stopPropagation) e.stopPropagation();
  else e.cancelBubble = true;
}
export function e_defaultPrevented(e) {
  return e.defaultPrevented != null ? e.defaultPrevented : e.returnValue == false;
}
export function e_stop(e) {e_preventDefault(e); e_stopPropagation(e);}

export function e_target(e) {return e.target || e.srcElement;}
export function e_button(e) {
  var b = e.which;
  if (b == null) {
    if (e.button & 1) b = 1;
    else if (e.button & 2) b = 3;
    else if (e.button & 4) b = 2;
  }
  if (mac && e.ctrlKey && b == 1) b = 3;
  return b;
}

// Return true when the given mouse event happened in a widget
export function eventInWidget(display, e) {
  for (var n = e_target(e); n != display.wrapper; n = n.parentNode) {
    if (!n || (n.nodeType == 1 && n.getAttribute("cm-ignore-events") == "true") ||
        (n.parentNode == display.sizer && n != display.mover))
      return true;
  }
}

// Given a mouse event, find the corresponding position. If liberal
// is false, it checks whether a gutter or scrollbar was clicked,
// and returns null if it was. forRect is used by rectangular
// selections, and tries to estimate a character position even for
// coordinates beyond the right of the text.
export function posFromMouse(cm, e, liberal, forRect) {
  var display = cm.display;
  if (!liberal && e_target(e).getAttribute("cm-not-content") == "true") return null;

  var x, y, space = display.lineSpace.getBoundingClientRect();
  // Fails unpredictably on IE[67] when mouse is dragged around quickly.
  try { x = e.clientX - space.left; y = e.clientY - space.top; }
  catch (e) { return null; }
  var coords = coordsChar(cm, x, y), line;
  if (forRect && coords.xRel == 1 && (line = getLine(cm.doc, coords.line).text).length == coords.ch) {
    var colDiff = countColumn(line, line.length, cm.options.tabSize) - line.length;
    coords = Pos(coords.line, Math.max(0, Math.round((x - paddingH(cm.display).left) / charWidth(cm.display)) - colDiff));
  }
  return coords;
}
