import { startWorker } from "./display/highlight_worker";
import { regChange } from "./display/view_tracking";
import { getMode } from "./modes";

// Used to get the editor into a consistent state again when options change.

export function loadMode(cm) {
  cm.doc.mode = getMode(cm.options, cm.doc.modeOption);
  resetModeState(cm);
}

export function resetModeState(cm) {
  cm.doc.iter(function(line) {
    if (line.stateAfter) line.stateAfter = null;
    if (line.styles) line.styles = null;
  });
  cm.doc.frontier = cm.doc.first;
  startWorker(cm, 100);
  cm.state.modeGen++;
  if (cm.curOp) regChange(cm);
}
