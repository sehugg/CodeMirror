import { callBlankLine, readToken, runMode } from "./line_data";
import { runInOp } from "./operations";
import { findStartLine } from "./selection_draw";
import { copyState, startState } from "./state";
import StringStream from "./StringStream";
import { bind } from "./utils";
import { getLine, lineNo } from "./utils_line";
import { regLineChange } from "./view_tracking";

// HIGHLIGHT WORKER

export function startWorker(cm, time) {
  if (cm.doc.mode.startState && cm.doc.frontier < cm.display.viewTo)
    cm.state.highlight.set(time, bind(highlightWorker, cm));
}

function highlightWorker(cm) {
  var doc = cm.doc;
  if (doc.frontier < doc.first) doc.frontier = doc.first;
  if (doc.frontier >= cm.display.viewTo) return;
  var end = +new Date + cm.options.workTime;
  var state = copyState(doc.mode, getStateBefore(cm, doc.frontier));
  var changedLines = [];

  doc.iter(doc.frontier, Math.min(doc.first + doc.size, cm.display.viewTo + 500), function(line) {
    if (doc.frontier >= cm.display.viewFrom) { // Visible
      var oldStyles = line.styles, tooLong = line.text.length > cm.options.maxHighlightLength;
      var highlighted = highlightLine(cm, line, tooLong ? copyState(doc.mode, state) : state, true);
      line.styles = highlighted.styles;
      var oldCls = line.styleClasses, newCls = highlighted.classes;
      if (newCls) line.styleClasses = newCls;
      else if (oldCls) line.styleClasses = null;
      var ischange = !oldStyles || oldStyles.length != line.styles.length ||
        oldCls != newCls && (!oldCls || !newCls || oldCls.bgClass != newCls.bgClass || oldCls.textClass != newCls.textClass);
      for (var i = 0; !ischange && i < oldStyles.length; ++i) ischange = oldStyles[i] != line.styles[i];
      if (ischange) changedLines.push(doc.frontier);
      line.stateAfter = tooLong ? state : copyState(doc.mode, state);
    } else {
      if (line.text.length <= cm.options.maxHighlightLength)
        processLine(cm, line.text, state);
      line.stateAfter = doc.frontier % 5 == 0 ? copyState(doc.mode, state) : null;
    }
    ++doc.frontier;
    if (+new Date > end) {
      startWorker(cm, cm.options.workDelay);
      return true;
    }
  });
  if (changedLines.length) runInOp(cm, function() {
    for (var i = 0; i < changedLines.length; i++)
      regLineChange(cm, changedLines[i], "text");
  });
}

// Compute a style array (an array starting with a mode generation
// -- for invalidation -- followed by pairs of end positions and
// style strings), which is used to highlight the tokens on the
// line.
function highlightLine(cm, line, state, forceToEnd) {
  // A styles array always starts with a number identifying the
  // mode/overlays that it is based on (for easy invalidation).
  var st = [cm.state.modeGen], lineClasses = {};
  // Compute the base array of styles
  runMode(cm, line.text, cm.doc.mode, state, function(end, style) {
    st.push(end, style);
  }, lineClasses, forceToEnd);

  // Run overlays, adjust style array.
  for (var o = 0; o < cm.state.overlays.length; ++o) {
    var overlay = cm.state.overlays[o], i = 1, at = 0;
    runMode(cm, line.text, overlay.mode, true, function(end, style) {
      var start = i;
      // Ensure there's a token end at the current position, and that i points at it
      while (at < end) {
        var i_end = st[i];
        if (i_end > end)
          st.splice(i, 1, end, st[i+1], i_end);
        i += 2;
        at = Math.min(end, i_end);
      }
      if (!style) return;
      if (overlay.opaque) {
        st.splice(start, i - start, end, "cm-overlay " + style);
        i = start + 2;
      } else {
        for (; start < i; start += 2) {
          var cur = st[start+1];
          st[start+1] = (cur ? cur + " " : "") + "cm-overlay " + style;
        }
      }
    }, lineClasses);
  }

  return {styles: st, classes: lineClasses.bgClass || lineClasses.textClass ? lineClasses : null};
}

export function getLineStyles(cm, line, updateFrontier) {
  if (!line.styles || line.styles[0] != cm.state.modeGen) {
    var state = getStateBefore(cm, lineNo(line));
    var result = highlightLine(cm, line, line.text.length > cm.options.maxHighlightLength ? copyState(cm.doc.mode, state) : state);
    line.stateAfter = state;
    line.styles = result.styles;
    if (result.classes) line.styleClasses = result.classes;
    else if (line.styleClasses) line.styleClasses = null;
    if (updateFrontier === cm.doc.frontier) cm.doc.frontier++;
  }
  return line.styles;
}

export function getStateBefore(cm, n, precise) {
  var doc = cm.doc, display = cm.display;
  if (!doc.mode.startState) return true;
  var pos = findStartLine(cm, n, precise), state = pos > doc.first && getLine(doc, pos-1).stateAfter;
  if (!state) state = startState(doc.mode);
  else state = copyState(doc.mode, state);
  doc.iter(pos, n, function(line) {
    processLine(cm, line.text, state);
    var save = pos == n - 1 || pos % 5 == 0 || pos >= display.viewFrom && pos < display.viewTo;
    line.stateAfter = save ? copyState(doc.mode, state) : null;
    ++pos;
  });
  if (precise) doc.frontier = pos;
  return state;
}

// Lightweight form of highlight -- proceed over this line and
// update state, but don't save a style array. Used for lines that
// aren't currently visible.
export function processLine(cm, text, state, startAt) {
  var mode = cm.doc.mode;
  var stream = new StringStream(text, cm.options.tabSize);
  stream.start = stream.pos = startAt || 0;
  if (text == "") callBlankLine(mode, state);
  while (!stream.eol()) {
    readToken(mode, stream, state);
    stream.start = stream.pos;
  }
}
