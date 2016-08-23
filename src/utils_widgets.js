import { contains, elt, removeChildrenAndAdd } from "./dom_utils";

export function widgetHeight(widget) {
  if (widget.height != null) return widget.height;
  var cm = widget.doc.cm;
  if (!cm) return 0;
  if (!contains(document.body, widget.node)) {
    var parentStyle = "position: relative;";
    if (widget.coverGutter)
      parentStyle += "margin-left: -" + cm.display.gutters.offsetWidth + "px;";
    if (widget.noHScroll)
      parentStyle += "width: " + cm.display.wrapper.clientWidth + "px;";
    removeChildrenAndAdd(cm.display.measure, elt("div", [widget.node], null, parentStyle));
  }
  return widget.height = widget.node.parentNode.offsetHeight;
}
