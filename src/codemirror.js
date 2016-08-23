// EDITOR CONSTRUCTOR

import CodeMirror from "./CodeMirror";

import { eventMixin, off, on } from "./events";

CodeMirror.off = off;
CodeMirror.on = on;

import { wheelEventPixels } from "./scroll_events";

CodeMirror.wheelEventPixels = wheelEventPixels;

import { indexOf } from "./utils";

import { setDefaultOptions } from "./default_options";

setDefaultOptions(CodeMirror);

import addEditorMethods from './editor_methods';

addEditorMethods(CodeMirror);
import Doc from "./Doc";

// Set up methods on CodeMirror's prototype to redirect to the editor's document.
var dontDelegate = "iter insert remove copy getEditor constructor".split(" ");
for (var prop in Doc.prototype) if (Doc.prototype.hasOwnProperty(prop) && indexOf(dontDelegate, prop) < 0)
  CodeMirror.prototype[prop] = (function(method) {
    return function() {return method.apply(this.doc, arguments);};
  })(Doc.prototype[prop]);

eventMixin(Doc);

CodeMirror.Doc = Doc;

import { splitLinesAuto } from "./feature_detection";

CodeMirror.splitLines = splitLinesAuto;

import { countColumn, findColumn, isWordCharBasic, Pass } from "./utils";

CodeMirror.countColumn = countColumn;
CodeMirror.findColumn = findColumn;
CodeMirror.isWordChar = isWordCharBasic;
CodeMirror.Pass = Pass;

import { signal } from "./events";

CodeMirror.signal = signal;

import { Line } from "./line_data";

CodeMirror.Line = Line;

import { changeEnd } from "./changes";

CodeMirror.changeEnd = changeEnd;

// SCROLLBARS

import { NativeScrollbars, NullScrollbars } from "./scrollbars";

CodeMirror.scrollbarModel = {"native": NativeScrollbars, "null": NullScrollbars};

// POSITION OBJECT

import Pos from "./Pos";
import { cmp } from "./Pos";

CodeMirror.Pos = Pos;
CodeMirror.cmpPos = cmp;

// INPUT HANDLING

import ContentEditableInput from "./ContentEditableInput";
import TextareaInput from "./TextareaInput";
CodeMirror.inputStyles = {"textarea": TextareaInput, "contenteditable": ContentEditableInput};

// MODE DEFINITION AND QUERYING

import { defineMIME, defineMode, extendMode, getMode, mimeModes, modeExtensions, modes, resolveMode } from "./modes";

CodeMirror.modes = modes;
CodeMirror.mimeModes = mimeModes;

// Extra arguments are stored as the mode's dependencies, which is
// used by (legacy) mechanisms like loadmode.js to automatically
// load a mode. (Preferred mechanism is the require/define calls.)
CodeMirror.defineMode = function(name/*, mode, …*/) {
  if (!CodeMirror.defaults.mode && name != "null") CodeMirror.defaults.mode = name;
  defineMode.apply(this, arguments);
};

CodeMirror.defineMIME = defineMIME;

CodeMirror.resolveMode = resolveMode;
CodeMirror.getMode = getMode;

CodeMirror.modeExtensions = modeExtensions;
CodeMirror.extendMode = extendMode;

// Minimal default mode.
CodeMirror.defineMode("null", function() {
  return {token: function(stream) {stream.skipToEnd();}};
});
CodeMirror.defineMIME("text/plain", "null");

// EXTENSIONS

CodeMirror.defineExtension = function(name, func) {
  CodeMirror.prototype[name] = func;
};
CodeMirror.defineDocExtension = function(name, func) {
  Doc.prototype[name] = func;
};

// MODE STATE HANDLING

import { copyState, innerMode, startState } from "./state";

// Utility functions for working with state. Exported because nested
// modes need to do this for their inner modes.

CodeMirror.copyState = copyState;
CodeMirror.startState = startState;
CodeMirror.innerMode = innerMode;

import { commands } from "./commands";

CodeMirror.commands = commands;

// STANDARD KEYMAPS

import { keyMap, keyName, isModifierKey, lookupKey, normalizeKeyMap } from "./keymap";

CodeMirror.keyMap = keyMap;
CodeMirror.keyName = keyName;
CodeMirror.isModifierKey = isModifierKey;
CodeMirror.lookupKey = lookupKey;
CodeMirror.normalizeKeyMap = normalizeKeyMap;

// FROMTEXTAREA

import { activeElt } from "./dom_utils";
import { copyObj } from "./utils";

CodeMirror.fromTextArea = function(textarea, options) {
  options = options ? copyObj(options) : {};
  options.value = textarea.value;
  if (!options.tabindex && textarea.tabIndex)
    options.tabindex = textarea.tabIndex;
  if (!options.placeholder && textarea.placeholder)
    options.placeholder = textarea.placeholder;
  // Set autofocus to true if this textarea is focused, or if it has
  // autofocus and no other element is focused.
  if (options.autofocus == null) {
    var hasFocus = activeElt();
    options.autofocus = hasFocus == textarea ||
      textarea.getAttribute("autofocus") != null && hasFocus == document.body;
  }

  function save() {textarea.value = cm.getValue();}
  if (textarea.form) {
    on(textarea.form, "submit", save);
    // Deplorable hack to make the submit method do the right thing.
    if (!options.leaveSubmitMethodAlone) {
      var form = textarea.form, realSubmit = form.submit;
      try {
        var wrappedSubmit = form.submit = function() {
          save();
          form.submit = realSubmit;
          form.submit();
          form.submit = wrappedSubmit;
        };
      } catch(e) {}
    }
  }

  options.finishInit = function(cm) {
    cm.save = save;
    cm.getTextArea = function() { return textarea; };
    cm.toTextArea = function() {
      cm.toTextArea = isNaN; // Prevent this from being ran twice
      save();
      textarea.parentNode.removeChild(cm.getWrapperElement());
      textarea.style.display = "";
      if (textarea.form) {
        off(textarea.form, "submit", save);
        if (typeof textarea.form.submit == "function")
          textarea.form.submit = realSubmit;
      }
    };
  };

  textarea.style.display = "none";
  var cm = CodeMirror(function(node) {
    textarea.parentNode.insertBefore(node, textarea.nextSibling);
  }, options);
  return cm;
};

import StringStream from "./StringStream";

CodeMirror.StringStream = StringStream;

import { SharedTextMarker, TextMarker } from "./mark_text";

CodeMirror.SharedTextMarker = SharedTextMarker;
CodeMirror.TextMarker = TextMarker;

import { LineWidget } from "./line_widget";

CodeMirror.LineWidget = LineWidget;

// EVENT UTILITIES

import { e_preventDefault, e_stop, e_stopPropagation } from "./utils_events";

CodeMirror.e_preventDefault = e_preventDefault;
CodeMirror.e_stopPropagation = e_stopPropagation;
CodeMirror.e_stop = e_stop;

// DOM UTILITIES

import { addClass, contains, rmClass } from "./dom_utils";

CodeMirror.addClass = addClass;
CodeMirror.contains = contains;
CodeMirror.rmClass = rmClass;

import { keyNames } from "./keynames";

CodeMirror.keyNames = keyNames;

// THE END

CodeMirror.version = "5.18.3";

export default CodeMirror;
