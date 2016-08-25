import { cleanUpLine, Line, updateLine } from "./line_data";
import { signalLater } from "./operations";
import { estimateLineHeights } from "./position_measurement";
import { findMaxLine } from "./spans";
import { loadMode } from "./state";
import { getLine } from "./utils_line";
import { regChange } from "./view_tracking";

import { indexOf, lst } from "./utils";

// DOCUMENT DATA STRUCTURE

// By default, updates that start and end at the beginning of a line
// are treated specially, in order to make the association of line
// widgets and marker elements with the text behave more intuitive.
export function isWholeLineUpdate(doc, change) {
  return change.from.ch == 0 && change.to.ch == 0 && lst(change.text) == "" &&
    (!doc.cm || doc.cm.options.wholeLineUpdateBefore);
}

// Perform a change on the document data structure.
export function updateDoc(doc, change, markedSpans, estimateHeight) {
  function spansFor(n) {return markedSpans ? markedSpans[n] : null;}
  function update(line, text, spans) {
    updateLine(line, text, spans, estimateHeight);
    signalLater(line, "change", line, change);
  }
  function linesFor(start, end) {
    for (var i = start, result = []; i < end; ++i)
      result.push(new Line(text[i], spansFor(i), estimateHeight));
    return result;
  }

  var from = change.from, to = change.to, text = change.text;
  var firstLine = getLine(doc, from.line), lastLine = getLine(doc, to.line);
  var lastText = lst(text), lastSpans = spansFor(text.length - 1), nlines = to.line - from.line;

  // Adjust the line structure
  if (change.full) {
    doc.insert(0, linesFor(0, text.length));
    doc.remove(text.length, doc.size - text.length);
  } else if (isWholeLineUpdate(doc, change)) {
    // This is a whole-line replace. Treated specially to make
    // sure line objects move the way they are supposed to.
    var added = linesFor(0, text.length - 1);
    update(lastLine, lastLine.text, lastSpans);
    if (nlines) doc.remove(from.line, nlines);
    if (added.length) doc.insert(from.line, added);
  } else if (firstLine == lastLine) {
    if (text.length == 1) {
      update(firstLine, firstLine.text.slice(0, from.ch) + lastText + firstLine.text.slice(to.ch), lastSpans);
    } else {
      var added = linesFor(1, text.length - 1);
      added.push(new Line(lastText + firstLine.text.slice(to.ch), lastSpans, estimateHeight));
      update(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0));
      doc.insert(from.line + 1, added);
    }
  } else if (text.length == 1) {
    update(firstLine, firstLine.text.slice(0, from.ch) + text[0] + lastLine.text.slice(to.ch), spansFor(0));
    doc.remove(from.line + 1, nlines);
  } else {
    update(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0));
    update(lastLine, lastText + lastLine.text.slice(to.ch), lastSpans);
    var added = linesFor(1, text.length - 1);
    if (nlines > 1) doc.remove(from.line + 1, nlines - 1);
    doc.insert(from.line + 1, added);
  }

  signalLater(doc, "change", doc, change);
}

// The document is represented as a BTree consisting of leaves, with
// chunk of lines in them, and branches, with up to ten leaves or
// other branch nodes below them. The top node is always a branch
// node, and is the document object itself (meaning it has
// additional methods and properties).
//
// All nodes have parent links. The tree is used both to go from
// line numbers to line objects, and to go from objects to numbers.
// It also indexes by height, and is used to convert between height
// and line object, and to find the total height of the document.
//
// See also http://marijnhaverbeke.nl/blog/codemirror-line-tree.html

export function LeafChunk(lines) {
  this.lines = lines;
  this.parent = null;
  for (var i = 0, height = 0; i < lines.length; ++i) {
    lines[i].parent = this;
    height += lines[i].height;
  }
  this.height = height;
}

LeafChunk.prototype = {
  chunkSize: function() { return this.lines.length; },
  // Remove the n lines at offset 'at'.
  removeInner: function(at, n) {
    for (var i = at, e = at + n; i < e; ++i) {
      var line = this.lines[i];
      this.height -= line.height;
      cleanUpLine(line);
      signalLater(line, "delete");
    }
    this.lines.splice(at, n);
  },
  // Helper used to collapse a small branch into a single leaf.
  collapse: function(lines) {
    lines.push.apply(lines, this.lines);
  },
  // Insert the given array of lines at offset 'at', count them as
  // having the given height.
  insertInner: function(at, lines, height) {
    this.height += height;
    this.lines = this.lines.slice(0, at).concat(lines).concat(this.lines.slice(at));
    for (var i = 0; i < lines.length; ++i) lines[i].parent = this;
  },
  // Used to iterate over a part of the tree.
  iterN: function(at, n, op) {
    for (var e = at + n; at < e; ++at)
      if (op(this.lines[at])) return true;
  }
};

export function BranchChunk(children) {
  this.children = children;
  var size = 0, height = 0;
  for (var i = 0; i < children.length; ++i) {
    var ch = children[i];
    size += ch.chunkSize(); height += ch.height;
    ch.parent = this;
  }
  this.size = size;
  this.height = height;
  this.parent = null;
}

BranchChunk.prototype = {
  chunkSize: function() { return this.size; },
  removeInner: function(at, n) {
    this.size -= n;
    for (var i = 0; i < this.children.length; ++i) {
      var child = this.children[i], sz = child.chunkSize();
      if (at < sz) {
        var rm = Math.min(n, sz - at), oldHeight = child.height;
        child.removeInner(at, rm);
        this.height -= oldHeight - child.height;
        if (sz == rm) { this.children.splice(i--, 1); child.parent = null; }
        if ((n -= rm) == 0) break;
        at = 0;
      } else at -= sz;
    }
    // If the result is smaller than 25 lines, ensure that it is a
    // single leaf node.
    if (this.size - n < 25 &&
        (this.children.length > 1 || !(this.children[0] instanceof LeafChunk))) {
      var lines = [];
      this.collapse(lines);
      this.children = [new LeafChunk(lines)];
      this.children[0].parent = this;
    }
  },
  collapse: function(lines) {
    for (var i = 0; i < this.children.length; ++i) this.children[i].collapse(lines);
  },
  insertInner: function(at, lines, height) {
    this.size += lines.length;
    this.height += height;
    for (var i = 0; i < this.children.length; ++i) {
      var child = this.children[i], sz = child.chunkSize();
      if (at <= sz) {
        child.insertInner(at, lines, height);
        if (child.lines && child.lines.length > 50) {
          // To avoid memory thrashing when child.lines is huge (e.g. first view of a large file), it's never spliced.
          // Instead, small slices are taken. They're taken in order because sequential memory accesses are fastest.
          var remaining = child.lines.length % 25 + 25
          for (var pos = remaining; pos < child.lines.length;) {
            var leaf = new LeafChunk(child.lines.slice(pos, pos += 25));
            child.height -= leaf.height;
            this.children.splice(++i, 0, leaf);
            leaf.parent = this;
          }
          child.lines = child.lines.slice(0, remaining);
          this.maybeSpill();
        }
        break;
      }
      at -= sz;
    }
  },
  // When a node has grown, check whether it should be split.
  maybeSpill: function() {
    if (this.children.length <= 10) return;
    var me = this;
    do {
      var spilled = me.children.splice(me.children.length - 5, 5);
      var sibling = new BranchChunk(spilled);
      if (!me.parent) { // Become the parent node
        var copy = new BranchChunk(me.children);
        copy.parent = me;
        me.children = [copy, sibling];
        me = copy;
     } else {
        me.size -= sibling.size;
        me.height -= sibling.height;
        var myIndex = indexOf(me.parent.children, me);
        me.parent.children.splice(myIndex + 1, 0, sibling);
      }
      sibling.parent = me.parent;
    } while (me.children.length > 10);
    me.parent.maybeSpill();
  },
  iterN: function(at, n, op) {
    for (var i = 0; i < this.children.length; ++i) {
      var child = this.children[i], sz = child.chunkSize();
      if (at < sz) {
        var used = Math.min(n, sz - at);
        if (child.iterN(at, used, op)) return true;
        if ((n -= used) == 0) break;
        at = 0;
      } else at -= sz;
    }
  }
};

// Call f for all linked documents.
export function linkedDocs(doc, f, sharedHistOnly) {
  function propagate(doc, skip, sharedHist) {
    if (doc.linked) for (var i = 0; i < doc.linked.length; ++i) {
      var rel = doc.linked[i];
      if (rel.doc == skip) continue;
      var shared = sharedHist && rel.sharedHist;
      if (sharedHistOnly && !shared) continue;
      f(rel.doc, shared);
      propagate(rel.doc, doc, shared);
    }
  }
  propagate(doc, null, true);
}

// Attach a document to an editor.
export function attachDoc(cm, doc) {
  if (doc.cm) throw new Error("This document is already in use.");
  cm.doc = doc;
  doc.cm = cm;
  estimateLineHeights(cm);
  loadMode(cm);
  if (!cm.options.lineWrapping) findMaxLine(cm);
  cm.options.mode = doc.modeOption;
  regChange(cm);
}

