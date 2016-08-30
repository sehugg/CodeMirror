import { Pos } from "../line/pos";
import { getBetween, getLine, lineNo } from "../line/utils_line";
import { getBidiPartAt, getOrder } from "../util/bidi";
import { contains } from "../util/dom";
import { lst } from "../util/misc";

import { findViewForLine, mapFromLineView, nodeAndOffsetInLineMap } from "./position_measurement";

export function posToDOM(cm, pos) {
  var view = findViewForLine(cm, pos.line);
  if (!view || view.hidden) return null;
  var line = getLine(cm.doc, pos.line);
  var info = mapFromLineView(view, line, pos.line);

  var order = getOrder(line), side = "left";
  if (order) {
    var partPos = getBidiPartAt(order, pos.ch);
    side = partPos % 2 ? "right" : "left";
  }
  var result = nodeAndOffsetInLineMap(info.map, pos.ch, side);
  result.offset = result.collapse == "right" ? result.end : result.start;
  return result;
}

function badPos(pos, bad) { if (bad) pos.bad = true; return pos; }

export function domTextBetween(cm, from, to, fromLine, toLine) {
  var text = "", closing = false, lineSep = cm.doc.lineSeparator();
  function recognizeMarker(id) { return function(marker) { return marker.id == id; }; }
  function walk(node) {
    if (node.nodeType == 1) {
      var cmText = node.getAttribute("cm-text");
      if (cmText != null) {
        if (cmText == "") cmText = node.textContent.replace(/\u200b/g, "");
        text += cmText;
        return;
      }
      var markerID = node.getAttribute("cm-marker"), range;
      if (markerID) {
        var found = cm.findMarks(Pos(fromLine, 0), Pos(toLine + 1, 0), recognizeMarker(+markerID));
        if (found.length && (range = found[0].find()))
          text += getBetween(cm.doc, range.from, range.to).join(lineSep);
        return;
      }
      if (node.getAttribute("contenteditable") == "false") return;
      for (var i = 0; i < node.childNodes.length; i++)
        walk(node.childNodes[i]);
      if (/^(pre|div|p)$/i.test(node.nodeName))
        closing = true;
    } else if (node.nodeType == 3) {
      var val = node.nodeValue;
      if (!val) return;
      if (closing) {
        text += lineSep;
        closing = false;
      }
      text += val;
    }
  }
  for (;;) {
    walk(from);
    if (from == to) break;
    from = from.nextSibling;
  }
  return text;
}

export function domToPos(cm, node, offset) {
  var lineNode;
  if (node == cm.display.lineDiv) {
    lineNode = cm.display.lineDiv.childNodes[offset];
    if (!lineNode) return badPos(cm.clipPos(Pos(cm.display.viewTo - 1)), true);
    node = null; offset = 0;
  } else {
    for (lineNode = node;; lineNode = lineNode.parentNode) {
      if (!lineNode || lineNode == cm.display.lineDiv) return null;
      if (lineNode.parentNode && lineNode.parentNode == cm.display.lineDiv) break;
    }
  }
  for (var i = 0; i < cm.display.view.length; i++) {
    var lineView = cm.display.view[i];
    if (lineView.node == lineNode)
      return locateNodeInLineView(lineView, node, offset);
  }
}

function locateNodeInLineView(lineView, node, offset) {
  var wrapper = lineView.text.firstChild, bad = false;
  if (!node || !contains(wrapper, node)) return badPos(Pos(lineNo(lineView.line), 0), true);
  if (node == wrapper) {
    bad = true;
    node = wrapper.childNodes[offset];
    offset = 0;
    if (!node) {
      var line = lineView.rest ? lst(lineView.rest) : lineView.line;
      return badPos(Pos(lineNo(line), line.text.length), bad);
    }
  }

  var textNode = node.nodeType == 3 ? node : null, topNode = node;
  if (!textNode && node.childNodes.length == 1 && node.firstChild.nodeType == 3) {
    textNode = node.firstChild;
    if (offset) offset = textNode.nodeValue.length;
  }
  while (topNode.parentNode != wrapper) topNode = topNode.parentNode;
  var measure = lineView.measure, maps = measure.maps;

  function find(textNode, topNode, offset) {
    for (var i = -1; i < (maps ? maps.length : 0); i++) {
      var map = i < 0 ? measure.map : maps[i];
      for (var j = 0; j < map.length; j += 3) {
        var curNode = map[j + 2];
        if (curNode == textNode || curNode == topNode) {
          var line = lineNo(i < 0 ? lineView.line : lineView.rest[i]);
          var ch = map[j] + offset;
          if (offset < 0 || curNode != textNode) ch = map[j + (offset ? 1 : 0)];
          return Pos(line, ch);
        }
      }
    }
  }
  var found = find(textNode, topNode, offset);
  if (found) return badPos(found, bad);

  // FIXME this is all really shaky. might handle the few cases it needs to handle, but likely to cause problems
  for (var after = topNode.nextSibling, dist = textNode ? textNode.nodeValue.length - offset : 0; after; after = after.nextSibling) {
    found = find(after, after.firstChild, 0);
    if (found)
      return badPos(Pos(found.line, found.ch - dist), bad);
    else
      dist += after.textContent.length;
  }
  for (var before = topNode.previousSibling, dist = offset; before; before = before.previousSibling) {
    found = find(before, before.firstChild, -1);
    if (found)
      return badPos(Pos(found.line, found.ch + dist), bad);
    else
      dist += before.textContent.length;
  }
}
