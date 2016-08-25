import { addClass, elt, removeChildren, rmClass } from "./dom_utils";
import { on } from "./events";
import Pos from "./Pos";
import { clearCaches, scrollGap } from "./position_measurement";
import { setScrollLeft, setScrollTop } from "./scroll_events";
import { scrollbarModel } from "./scrollbar_model";
import { updateGutterSpace } from "./update_display";
import { sel_dontScroll } from "./utils";

export function initScrollbars(cm) {
  if (cm.display.scrollbars) {
    cm.display.scrollbars.clear();
    if (cm.display.scrollbars.addClass)
      rmClass(cm.display.wrapper, cm.display.scrollbars.addClass);
  }

  cm.display.scrollbars = new scrollbarModel[cm.options.scrollbarStyle](function(node) {
    cm.display.wrapper.insertBefore(node, cm.display.scrollbarFiller);
    // Prevent clicks in the scrollbars from killing focus
    on(node, "mousedown", function() {
      if (cm.state.focused) setTimeout(function() { cm.display.input.focus(); }, 0);
    });
    node.setAttribute("cm-not-content", "true");
  }, function(pos, axis) {
    if (axis == "horizontal") setScrollLeft(cm, pos);
    else setScrollTop(cm, pos);
  }, cm);
  if (cm.display.scrollbars.addClass)
    addClass(cm.display.wrapper, cm.display.scrollbars.addClass);
}

export function themeChanged(cm) {
  cm.display.wrapper.className = cm.display.wrapper.className.replace(/\s*cm-s-\S+/g, "") +
    cm.options.theme.replace(/(^|\s)\s*/g, " cm-s-");
  clearCaches(cm);
}

// Rebuild the gutter elements, ensure the margin to the left of the
// code matches their width.
export function updateGutters(cm) {
  var gutters = cm.display.gutters, specs = cm.options.gutters;
  removeChildren(gutters);
  for (var i = 0; i < specs.length; ++i) {
    var gutterClass = specs[i];
    var gElt = gutters.appendChild(elt("div", null, "CodeMirror-gutter " + gutterClass));
    if (gutterClass == "CodeMirror-linenumbers") {
      cm.display.lineGutter = gElt;
      gElt.style.width = (cm.display.lineNumWidth || 1) + "px";
    }
  }
  gutters.style.display = i ? "" : "none";
  updateGutterSpace(cm);
}

export function setDocumentHeight(cm, measure) {
  cm.display.sizer.style.minHeight = measure.docHeight + "px";
  cm.display.heightForcer.style.top = measure.docHeight + "px";
  cm.display.gutters.style.height = (measure.docHeight + cm.display.barHeight + scrollGap(cm)) + "px";
}

export function selectAll(cm) {
  cm.setSelection(Pos(cm.firstLine(), 0), Pos(cm.lastLine()), sel_dontScroll);
}
