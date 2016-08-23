import { startWorker } from "./highlight";
import { getMode } from "./modes";
import { regChange } from "./view_tracking";

export function copyState(mode, state) {
  if (state === true) return state;
  if (mode.copyState) return mode.copyState(state);
  var nstate = {};
  for (var n in state) {
    var val = state[n];
    if (val instanceof Array) val = val.concat([]);
    nstate[n] = val;
  }
  return nstate;
}

// Given a mode and a state (for that mode), find the inner mode and
// state at the position that the state refers to.
export function innerMode(mode, state) {
  while (mode.innerMode) {
    var info = mode.innerMode(state);
    if (!info || info.mode == mode) break;
    state = info.state;
    mode = info.mode;
  }
  return info || {mode: mode, state: state};
}

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

export function startState(mode, a1, a2) {
  return mode.startState ? mode.startState(a1, a2) : true;
}
