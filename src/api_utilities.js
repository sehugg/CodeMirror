import { replaceRange } from "./changes";
import { getStateBefore } from "./line/highlight";
import { runInOp } from "./operations";
import Pos from "./Pos";
import { cmp } from "./Pos";
import { ensureCursorVisible } from "./scrolling";
import { Range } from "./selection";
import { replaceOneSelection } from "./selection_updates";
import { countColumn, lst, Pass, spaceStr } from "./util/misc";
import { getLine } from "./utils_line";

// Indent the given line. The how parameter can be "smart",
// "add"/null, "subtract", or "prev". When aggressive is false
// (typically set to true for forced single-line indents), empty
// lines are not indented, and places where the mode returns Pass
// are left alone.
export function indentLine(cm, n, how, aggressive) {
  var doc = cm.doc, state;
  if (how == null) how = "add";
  if (how == "smart") {
    // Fall back to "prev" when the mode doesn't have an indentation
    // method.
    if (!doc.mode.indent) how = "prev";
    else state = getStateBefore(cm, n);
  }

  var tabSize = cm.options.tabSize;
  var line = getLine(doc, n), curSpace = countColumn(line.text, null, tabSize);
  if (line.stateAfter) line.stateAfter = null;
  var curSpaceString = line.text.match(/^\s*/)[0], indentation;
  if (!aggressive && !/\S/.test(line.text)) {
    indentation = 0;
    how = "not";
  } else if (how == "smart") {
    indentation = doc.mode.indent(state, line.text.slice(curSpaceString.length), line.text);
    if (indentation == Pass || indentation > 150) {
      if (!aggressive) return;
      how = "prev";
    }
  }
  if (how == "prev") {
    if (n > doc.first) indentation = countColumn(getLine(doc, n-1).text, null, tabSize);
    else indentation = 0;
  } else if (how == "add") {
    indentation = curSpace + cm.options.indentUnit;
  } else if (how == "subtract") {
    indentation = curSpace - cm.options.indentUnit;
  } else if (typeof how == "number") {
    indentation = curSpace + how;
  }
  indentation = Math.max(0, indentation);

  var indentString = "", pos = 0;
  if (cm.options.indentWithTabs)
    for (var i = Math.floor(indentation / tabSize); i; --i) {pos += tabSize; indentString += "\t";}
  if (pos < indentation) indentString += spaceStr(indentation - pos);

  if (indentString != curSpaceString) {
    replaceRange(doc, indentString, Pos(n, 0), Pos(n, curSpaceString.length), "+input");
    line.stateAfter = null;
    return true;
  } else {
    // Ensure that, if the cursor was in the whitespace at the start
    // of the line, it is moved to the end of that space.
    for (var i = 0; i < doc.sel.ranges.length; i++) {
      var range = doc.sel.ranges[i];
      if (range.head.line == n && range.head.ch < curSpaceString.length) {
        var pos = Pos(n, curSpaceString.length);
        replaceOneSelection(doc, i, new Range(pos, pos));
        break;
      }
    }
  }
}

// Helper for deleting text near the selection(s), used to implement
// backspace, delete, and similar functionality.
export function deleteNearSelection(cm, compute) {
  var ranges = cm.doc.sel.ranges, kill = [];
  // Build up a set of ranges to kill first, merging overlapping
  // ranges.
  for (var i = 0; i < ranges.length; i++) {
    var toKill = compute(ranges[i]);
    while (kill.length && cmp(toKill.from, lst(kill).to) <= 0) {
      var replaced = kill.pop();
      if (cmp(replaced.from, toKill.from) < 0) {
        toKill.from = replaced.from;
        break;
      }
    }
    kill.push(toKill);
  }
  // Next, remove those actual ranges.
  runInOp(cm, function() {
    for (var i = kill.length - 1; i >= 0; i--)
      replaceRange(cm.doc, "", kill[i].from, kill[i].to, "+delete");
    ensureCursorVisible(cm);
  });
}
