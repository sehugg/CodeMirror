import { replaceRange } from "../model/changes";
import { contains, range, removeChildrenAndAdd, selectInput } from "../util/dom";
import { on, signalDOMEvent } from "../util/event";
import { applyTextInput, copyableRanges, disableBrowserMagic, handlePaste, hiddenTextarea, lastCopied, setLastCopied } from "./input";
import { operation, runInOp } from "../display/operations";
import { cmp, maxPos, minPos, Pos } from "../line/pos";
import { findViewIndex } from "../measurement/position_measurement";
import { domTextBetween, domToPos, posToDOM } from "../measurement/ContentEditableInput";
import { simpleSelection } from "../model/selection";
import { prepareSelection } from "../display/selection";
import { setSelection } from "../model/selection_updates";
import { gecko, ie_version } from "../util/browser";
import { copyObj, Delayed, lst, nothing, sel_dontScroll } from "../util/misc";
import { getBetween, getLine, lineNo } from "../line/utils_line";
import { regChange } from "../display/view_tracking";

// CONTENTEDITABLE INPUT STYLE

export default function ContentEditableInput(cm) {
  this.cm = cm;
  this.lastAnchorNode = this.lastAnchorOffset = this.lastFocusNode = this.lastFocusOffset = null;
  this.polling = new Delayed();
  this.gracePeriod = false;
}

ContentEditableInput.prototype = copyObj({
  init: function(display) {
    var input = this, cm = input.cm;
    var div = input.div = display.lineDiv;
    disableBrowserMagic(div, cm.options.spellcheck);

    on(div, "paste", function(e) {
      if (signalDOMEvent(cm, e) || handlePaste(e, cm)) return
      // IE doesn't fire input events, so we schedule a read for the pasted content in this way
      if (ie_version <= 11) setTimeout(operation(cm, function() {
        if (!input.pollContent()) regChange(cm);
      }), 20)
    })

    on(div, "compositionstart", function(e) {
      var data = e.data;
      input.composing = {sel: cm.doc.sel, data: data, startData: data};
      if (!data) return;
      var prim = cm.doc.sel.primary();
      var line = cm.getLine(prim.head.line);
      var found = line.indexOf(data, Math.max(0, prim.head.ch - data.length));
      if (found > -1 && found <= prim.head.ch)
        input.composing.sel = simpleSelection(Pos(prim.head.line, found),
                                              Pos(prim.head.line, found + data.length));
    });
    on(div, "compositionupdate", function(e) {
      input.composing.data = e.data;
    });
    on(div, "compositionend", function(e) {
      var ours = input.composing;
      if (!ours) return;
      if (e.data != ours.startData && !/\u200b/.test(e.data))
        ours.data = e.data;
      // Need a small delay to prevent other code (input event,
      // selection polling) from doing damage when fired right after
      // compositionend.
      setTimeout(function() {
        if (!ours.handled)
          input.applyComposition(ours);
        if (input.composing == ours)
          input.composing = null;
      }, 50);
    });

    on(div, "touchstart", function() {
      input.forceCompositionEnd();
    });

    on(div, "input", function() {
      if (input.composing) return;
      if (cm.isReadOnly() || !input.pollContent())
        runInOp(input.cm, function() {regChange(cm);});
    });

    function onCopyCut(e) {
      if (signalDOMEvent(cm, e)) return
      if (cm.somethingSelected()) {
        setLastCopied({lineWise: false, text: cm.getSelections()});
        if (e.type == "cut") cm.replaceSelection("", null, "cut");
      } else if (!cm.options.lineWiseCopyCut) {
        return;
      } else {
        var ranges = copyableRanges(cm);
        setLastCopied({lineWise: true, text: ranges.text});
        if (e.type == "cut") {
          cm.operation(function() {
            cm.setSelections(ranges.ranges, 0, sel_dontScroll);
            cm.replaceSelection("", null, "cut");
          });
        }
      }
      if (e.clipboardData) {
        e.clipboardData.clearData();
        var content = lastCopied.text.join("\n")
        // iOS exposes the clipboard API, but seems to discard content inserted into it
        e.clipboardData.setData("Text", content);
        if (e.clipboardData.getData("Text") == content) {
          e.preventDefault();
          return
        }
      }
      // Old-fashioned briefly-focus-a-textarea hack
      var kludge = hiddenTextarea(), te = kludge.firstChild;
      cm.display.lineSpace.insertBefore(kludge, cm.display.lineSpace.firstChild);
      te.value = lastCopied.text.join("\n");
      var hadFocus = document.activeElement;
      selectInput(te);
      setTimeout(function() {
        cm.display.lineSpace.removeChild(kludge);
        hadFocus.focus();
        if (hadFocus == div) input.showPrimarySelection()
      }, 50);
    }
    on(div, "copy", onCopyCut);
    on(div, "cut", onCopyCut);
  },

  prepareSelection: function() {
    var result = prepareSelection(this.cm, false);
    result.focus = this.cm.state.focused;
    return result;
  },

  showSelection: function(info, takeFocus) {
    if (!info || !this.cm.display.view.length) return;
    if (info.focus || takeFocus) this.showPrimarySelection();
    this.showMultipleSelections(info);
  },

  showPrimarySelection: function() {
    var sel = window.getSelection(), prim = this.cm.doc.sel.primary();
    var curAnchor = domToPos(this.cm, sel.anchorNode, sel.anchorOffset);
    var curFocus = domToPos(this.cm, sel.focusNode, sel.focusOffset);
    if (curAnchor && !curAnchor.bad && curFocus && !curFocus.bad &&
        cmp(minPos(curAnchor, curFocus), prim.from()) == 0 &&
        cmp(maxPos(curAnchor, curFocus), prim.to()) == 0)
      return;

    var start = posToDOM(this.cm, prim.from());
    var end = posToDOM(this.cm, prim.to());
    if (!start && !end) return;

    var view = this.cm.display.view;
    var old = sel.rangeCount && sel.getRangeAt(0);
    if (!start) {
      start = {node: view[0].measure.map[2], offset: 0};
    } else if (!end) { // FIXME dangerously hacky
      var measure = view[view.length - 1].measure;
      var map = measure.maps ? measure.maps[measure.maps.length - 1] : measure.map;
      end = {node: map[map.length - 1], offset: map[map.length - 2] - map[map.length - 3]};
    }

    try { var rng = range(start.node, start.offset, end.offset, end.node); }
    catch(e) {} // Our model of the DOM might be outdated, in which case the range we try to set can be impossible
    if (rng) {
      if (!gecko && this.cm.state.focused) {
        sel.collapse(start.node, start.offset);
        if (!rng.collapsed) sel.addRange(rng);
      } else {
        sel.removeAllRanges();
        sel.addRange(rng);
      }
      if (old && sel.anchorNode == null) sel.addRange(old);
      else if (gecko) this.startGracePeriod();
    }
    this.rememberSelection();
  },

  startGracePeriod: function() {
    var input = this;
    clearTimeout(this.gracePeriod);
    this.gracePeriod = setTimeout(function() {
      input.gracePeriod = false;
      if (input.selectionChanged())
        input.cm.operation(function() { input.cm.curOp.selectionChanged = true; });
    }, 20);
  },

  showMultipleSelections: function(info) {
    removeChildrenAndAdd(this.cm.display.cursorDiv, info.cursors);
    removeChildrenAndAdd(this.cm.display.selectionDiv, info.selection);
  },

  rememberSelection: function() {
    var sel = window.getSelection();
    this.lastAnchorNode = sel.anchorNode; this.lastAnchorOffset = sel.anchorOffset;
    this.lastFocusNode = sel.focusNode; this.lastFocusOffset = sel.focusOffset;
  },

  selectionInEditor: function() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return false;
    var node = sel.getRangeAt(0).commonAncestorContainer;
    return contains(this.div, node);
  },

  focus: function() {
    if (this.cm.options.readOnly != "nocursor") this.div.focus();
  },
  blur: function() { this.div.blur(); },
  getField: function() { return this.div; },

  supportsTouch: function() { return true; },

  receivedFocus: function() {
    var input = this;
    if (this.selectionInEditor())
      this.pollSelection();
    else
      runInOp(this.cm, function() { input.cm.curOp.selectionChanged = true; });

    function poll() {
      if (input.cm.state.focused) {
        input.pollSelection();
        input.polling.set(input.cm.options.pollInterval, poll);
      }
    }
    this.polling.set(this.cm.options.pollInterval, poll);
  },

  selectionChanged: function() {
    var sel = window.getSelection();
    return sel.anchorNode != this.lastAnchorNode || sel.anchorOffset != this.lastAnchorOffset ||
      sel.focusNode != this.lastFocusNode || sel.focusOffset != this.lastFocusOffset;
  },

  pollSelection: function() {
    if (!this.composing && !this.gracePeriod && this.selectionChanged()) {
      var sel = window.getSelection(), cm = this.cm;
      this.rememberSelection();
      var anchor = domToPos(cm, sel.anchorNode, sel.anchorOffset);
      var head = domToPos(cm, sel.focusNode, sel.focusOffset);
      if (anchor && head) runInOp(cm, function() {
        setSelection(cm.doc, simpleSelection(anchor, head), sel_dontScroll);
        if (anchor.bad || head.bad) cm.curOp.selectionChanged = true;
      });
    }
  },

  pollContent: function() {
    var cm = this.cm, display = cm.display, sel = cm.doc.sel.primary();
    var from = sel.from(), to = sel.to();
    if (from.line < display.viewFrom || to.line > display.viewTo - 1) return false;

    var fromIndex;
    if (from.line == display.viewFrom || (fromIndex = findViewIndex(cm, from.line)) == 0) {
      var fromLine = lineNo(display.view[0].line);
      var fromNode = display.view[0].node;
    } else {
      var fromLine = lineNo(display.view[fromIndex].line);
      var fromNode = display.view[fromIndex - 1].node.nextSibling;
    }
    var toIndex = findViewIndex(cm, to.line);
    if (toIndex == display.view.length - 1) {
      var toLine = display.viewTo - 1;
      var toNode = display.lineDiv.lastChild;
    } else {
      var toLine = lineNo(display.view[toIndex + 1].line) - 1;
      var toNode = display.view[toIndex + 1].node.previousSibling;
    }

    var newText = cm.doc.splitLines(domTextBetween(cm, fromNode, toNode, fromLine, toLine));
    var oldText = getBetween(cm.doc, Pos(fromLine, 0), Pos(toLine, getLine(cm.doc, toLine).text.length));
    while (newText.length > 1 && oldText.length > 1) {
      if (lst(newText) == lst(oldText)) { newText.pop(); oldText.pop(); toLine--; }
      else if (newText[0] == oldText[0]) { newText.shift(); oldText.shift(); fromLine++; }
      else break;
    }

    var cutFront = 0, cutEnd = 0;
    var newTop = newText[0], oldTop = oldText[0], maxCutFront = Math.min(newTop.length, oldTop.length);
    while (cutFront < maxCutFront && newTop.charCodeAt(cutFront) == oldTop.charCodeAt(cutFront))
      ++cutFront;
    var newBot = lst(newText), oldBot = lst(oldText);
    var maxCutEnd = Math.min(newBot.length - (newText.length == 1 ? cutFront : 0),
                             oldBot.length - (oldText.length == 1 ? cutFront : 0));
    while (cutEnd < maxCutEnd &&
           newBot.charCodeAt(newBot.length - cutEnd - 1) == oldBot.charCodeAt(oldBot.length - cutEnd - 1))
      ++cutEnd;

    newText[newText.length - 1] = newBot.slice(0, newBot.length - cutEnd);
    newText[0] = newText[0].slice(cutFront);

    var chFrom = Pos(fromLine, cutFront);
    var chTo = Pos(toLine, oldText.length ? lst(oldText).length - cutEnd : 0);
    if (newText.length > 1 || newText[0] || cmp(chFrom, chTo)) {
      replaceRange(cm.doc, newText, chFrom, chTo, "+input");
      return true;
    }
  },

  ensurePolled: function() {
    this.forceCompositionEnd();
  },
  reset: function() {
    this.forceCompositionEnd();
  },
  forceCompositionEnd: function() {
    if (!this.composing || this.composing.handled) return;
    this.applyComposition(this.composing);
    this.composing.handled = true;
    this.div.blur();
    this.div.focus();
  },
  applyComposition: function(composing) {
    if (this.cm.isReadOnly())
      operation(this.cm, regChange)(this.cm)
    else if (composing.data && composing.data != composing.startData)
      operation(this.cm, applyTextInput)(this.cm, composing.data, 0, composing.sel);
  },

  setUneditable: function(node) {
    node.contentEditable = "false"
  },

  onKeyPress: function(e) {
    e.preventDefault();
    if (!this.cm.isReadOnly())
      operation(this.cm, applyTextInput)(this.cm, String.fromCharCode(e.charCode == null ? e.keyCode : e.charCode), 0);
  },

  readOnlyChanged: function(val) {
    this.div.contentEditable = String(val != "nocursor")
  },

  onContextMenu: nothing,
  resetPosition: nothing,

  needsContentAttribute: true
  }, ContentEditableInput.prototype);
