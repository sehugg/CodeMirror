// EDITOR CONSTRUCTOR

import { CodeMirror } from "./CodeMirror";
export { CodeMirror } from "./CodeMirror";

import { eventMixin, off, on } from "../util/event";
import { indexOf } from "../util/misc";

import { defineOptions } from "./options";

defineOptions(CodeMirror);

import addEditorMethods from "./methods";

addEditorMethods(CodeMirror);

import Doc from "./Doc";

// Set up methods on CodeMirror's prototype to redirect to the editor's document.
var dontDelegate = "iter insert remove copy getEditor constructor".split(" ");
for (var prop in Doc.prototype) if (Doc.prototype.hasOwnProperty(prop) && indexOf(dontDelegate, prop) < 0)
  CodeMirror.prototype[prop] = (function(method) {
    return function() {return method.apply(this.doc, arguments);};
  })(Doc.prototype[prop]);

eventMixin(Doc);

// INPUT HANDLING

import ContentEditableInput from "../input/ContentEditableInput";
import TextareaInput from "../input/TextareaInput";
CodeMirror.inputStyles = {"textarea": TextareaInput, "contenteditable": ContentEditableInput};

// MODE DEFINITION AND QUERYING

import { defineMIME, defineMode } from "../modes";

// Extra arguments are stored as the mode's dependencies, which is
// used by (legacy) mechanisms like loadmode.js to automatically
// load a mode. (Preferred mechanism is the require/define calls.)
CodeMirror.defineMode = function(name/*, mode, …*/) {
  if (!CodeMirror.defaults.mode && name != "null") CodeMirror.defaults.mode = name;
  defineMode.apply(this, arguments);
};

CodeMirror.defineMIME = defineMIME;

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

// FROMTEXTAREA

import { activeElt } from "../util/dom";
import { copyObj } from "../util/misc";

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

// THE END

import { addLegacyProps } from "./legacy";

addLegacyProps(CodeMirror);

CodeMirror.version = "5.18.3";
