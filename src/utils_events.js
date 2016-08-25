import { mac } from "./sniffs";

// Due to the fact that we still support jurassic IE versions, some
// compatibility wrappers are needed.

export function e_preventDefault(e) {
  if (e.preventDefault) e.preventDefault();
  else e.returnValue = false;
}
export function e_stopPropagation(e) {
  if (e.stopPropagation) e.stopPropagation();
  else e.cancelBubble = true;
}
export function e_defaultPrevented(e) {
  return e.defaultPrevented != null ? e.defaultPrevented : e.returnValue == false;
}
export function e_stop(e) {e_preventDefault(e); e_stopPropagation(e);}

export function e_target(e) {return e.target || e.srcElement;}
export function e_button(e) {
  var b = e.which;
  if (b == null) {
    if (e.button & 1) b = 1;
    else if (e.button & 2) b = 3;
    else if (e.button & 4) b = 2;
  }
  if (mac && e.ctrlKey && b == 1) b = 3;
  return b;
}

// Return true when the given mouse event happened in a widget
export function eventInWidget(display, e) {
  for (var n = e_target(e); n != display.wrapper; n = n.parentNode) {
    if (!n || (n.nodeType == 1 && n.getAttribute("cm-ignore-events") == "true") ||
        (n.parentNode == display.sizer && n != display.mover))
      return true;
  }
}
