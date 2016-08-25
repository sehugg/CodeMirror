import { deleteNearSelection } from "./api_utilities";
import { runInOp } from "./operations";
import Pos from "./Pos";
import { ensureCursorVisible } from "./scrolling";
import { Range } from "./selection";
import { selectAll } from "./selection_updates";
import { countColumn, sel_dontScroll, sel_move, spaceStr } from "./utils";
import { lineEnd, lineStart, lineStartSmart } from "./utils_bidi";
import { getLine } from "./utils_line";
import { clipPos } from "./utils_pos";

// Commands are parameter-less actions that can be performed on an
// editor, mostly used for keybindings.
export var commands = {
  selectAll: selectAll,
  singleSelection: function(cm) {
    cm.setSelection(cm.getCursor("anchor"), cm.getCursor("head"), sel_dontScroll);
  },
  killLine: function(cm) {
    deleteNearSelection(cm, function(range) {
      if (range.empty()) {
        var len = getLine(cm.doc, range.head.line).text.length;
        if (range.head.ch == len && range.head.line < cm.lastLine())
          return {from: range.head, to: Pos(range.head.line + 1, 0)};
        else
          return {from: range.head, to: Pos(range.head.line, len)};
      } else {
        return {from: range.from(), to: range.to()};
      }
    });
  },
  deleteLine: function(cm) {
    deleteNearSelection(cm, function(range) {
      return {from: Pos(range.from().line, 0),
              to: clipPos(cm.doc, Pos(range.to().line + 1, 0))};
    });
  },
  delLineLeft: function(cm) {
    deleteNearSelection(cm, function(range) {
      return {from: Pos(range.from().line, 0), to: range.from()};
    });
  },
  delWrappedLineLeft: function(cm) {
    deleteNearSelection(cm, function(range) {
      var top = cm.charCoords(range.head, "div").top + 5;
      var leftPos = cm.coordsChar({left: 0, top: top}, "div");
      return {from: leftPos, to: range.from()};
    });
  },
  delWrappedLineRight: function(cm) {
    deleteNearSelection(cm, function(range) {
      var top = cm.charCoords(range.head, "div").top + 5;
      var rightPos = cm.coordsChar({left: cm.display.lineDiv.offsetWidth + 100, top: top}, "div");
      return {from: range.from(), to: rightPos };
    });
  },
  undo: function(cm) {cm.undo();},
  redo: function(cm) {cm.redo();},
  undoSelection: function(cm) {cm.undoSelection();},
  redoSelection: function(cm) {cm.redoSelection();},
  goDocStart: function(cm) {cm.extendSelection(Pos(cm.firstLine(), 0));},
  goDocEnd: function(cm) {cm.extendSelection(Pos(cm.lastLine()));},
  goLineStart: function(cm) {
    cm.extendSelectionsBy(function(range) { return lineStart(cm, range.head.line); },
                          {origin: "+move", bias: 1});
  },
  goLineStartSmart: function(cm) {
    cm.extendSelectionsBy(function(range) {
      return lineStartSmart(cm, range.head);
    }, {origin: "+move", bias: 1});
  },
  goLineEnd: function(cm) {
    cm.extendSelectionsBy(function(range) { return lineEnd(cm, range.head.line); },
                          {origin: "+move", bias: -1});
  },
  goLineRight: function(cm) {
    cm.extendSelectionsBy(function(range) {
      var top = cm.charCoords(range.head, "div").top + 5;
      return cm.coordsChar({left: cm.display.lineDiv.offsetWidth + 100, top: top}, "div");
    }, sel_move);
  },
  goLineLeft: function(cm) {
    cm.extendSelectionsBy(function(range) {
      var top = cm.charCoords(range.head, "div").top + 5;
      return cm.coordsChar({left: 0, top: top}, "div");
    }, sel_move);
  },
  goLineLeftSmart: function(cm) {
    cm.extendSelectionsBy(function(range) {
      var top = cm.charCoords(range.head, "div").top + 5;
      var pos = cm.coordsChar({left: 0, top: top}, "div");
      if (pos.ch < cm.getLine(pos.line).search(/\S/)) return lineStartSmart(cm, range.head);
      return pos;
    }, sel_move);
  },
  goLineUp: function(cm) {cm.moveV(-1, "line");},
  goLineDown: function(cm) {cm.moveV(1, "line");},
  goPageUp: function(cm) {cm.moveV(-1, "page");},
  goPageDown: function(cm) {cm.moveV(1, "page");},
  goCharLeft: function(cm) {cm.moveH(-1, "char");},
  goCharRight: function(cm) {cm.moveH(1, "char");},
  goColumnLeft: function(cm) {cm.moveH(-1, "column");},
  goColumnRight: function(cm) {cm.moveH(1, "column");},
  goWordLeft: function(cm) {cm.moveH(-1, "word");},
  goGroupRight: function(cm) {cm.moveH(1, "group");},
  goGroupLeft: function(cm) {cm.moveH(-1, "group");},
  goWordRight: function(cm) {cm.moveH(1, "word");},
  delCharBefore: function(cm) {cm.deleteH(-1, "char");},
  delCharAfter: function(cm) {cm.deleteH(1, "char");},
  delWordBefore: function(cm) {cm.deleteH(-1, "word");},
  delWordAfter: function(cm) {cm.deleteH(1, "word");},
  delGroupBefore: function(cm) {cm.deleteH(-1, "group");},
  delGroupAfter: function(cm) {cm.deleteH(1, "group");},
  indentAuto: function(cm) {cm.indentSelection("smart");},
  indentMore: function(cm) {cm.indentSelection("add");},
  indentLess: function(cm) {cm.indentSelection("subtract");},
  insertTab: function(cm) {cm.replaceSelection("\t");},
  insertSoftTab: function(cm) {
    var spaces = [], ranges = cm.listSelections(), tabSize = cm.options.tabSize;
    for (var i = 0; i < ranges.length; i++) {
      var pos = ranges[i].from();
      var col = countColumn(cm.getLine(pos.line), pos.ch, tabSize);
      spaces.push(spaceStr(tabSize - col % tabSize));
    }
    cm.replaceSelections(spaces);
  },
  defaultTab: function(cm) {
    if (cm.somethingSelected()) cm.indentSelection("add");
    else cm.execCommand("insertTab");
  },
  transposeChars: function(cm) {
    runInOp(cm, function() {
      var ranges = cm.listSelections(), newSel = [];
      for (var i = 0; i < ranges.length; i++) {
        var cur = ranges[i].head, line = getLine(cm.doc, cur.line).text;
        if (line) {
          if (cur.ch == line.length) cur = new Pos(cur.line, cur.ch - 1);
          if (cur.ch > 0) {
            cur = new Pos(cur.line, cur.ch + 1);
            cm.replaceRange(line.charAt(cur.ch - 1) + line.charAt(cur.ch - 2),
                            Pos(cur.line, cur.ch - 2), cur, "+transpose");
          } else if (cur.line > cm.doc.first) {
            var prev = getLine(cm.doc, cur.line - 1).text;
            if (prev)
              cm.replaceRange(line.charAt(0) + cm.doc.lineSeparator() +
                              prev.charAt(prev.length - 1),
                              Pos(cur.line - 1, prev.length - 1), Pos(cur.line, 1), "+transpose");
          }
        }
        newSel.push(new Range(cur, cur));
      }
      cm.setSelections(newSel);
    });
  },
  newlineAndIndent: function(cm) {
    runInOp(cm, function() {
      var len = cm.listSelections().length;
      for (var i = 0; i < len; i++) {
        var range = cm.listSelections()[i];
        cm.replaceRange(cm.doc.lineSeparator(), range.anchor, range.head, "+input");
        cm.indentLine(range.from().line + 1, null, true);
      }
      ensureCursorVisible(cm);
    });
  },
  openLine: function(cm) {cm.replaceSelection("\n", "start")},
  toggleOverwrite: function(cm) {cm.toggleOverwrite();}
};

