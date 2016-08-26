import { addClass, elt, removeChildren, rmClass } from "./util/dom";
import { on } from "./util/event";
import { clearCaches } from "./measurement/position_measurement";
import { setScrollLeft, setScrollTop } from "./scroll_events";
import { scrollbarModel } from "./display/scrollbars";
import { updateGutterSpace } from "./display/update_display";
import { indexOf } from "./util/misc";

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

// Make sure the gutters options contains the element
// "CodeMirror-linenumbers" when the lineNumbers option is true.
export function setGuttersForLineNumbers(options) {
  var found = indexOf(options.gutters, "CodeMirror-linenumbers");
  if (found == -1 && options.lineNumbers) {
    options.gutters = options.gutters.concat(["CodeMirror-linenumbers"]);
  } else if (found > -1 && !options.lineNumbers) {
    options.gutters = options.gutters.slice(0);
    options.gutters.splice(found, 1);
  }
}
