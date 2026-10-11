/* What this copy of FinDash can do. Each feature that needs a server (advice,
   column matching, photos, the forecasting model, accounts) is only offered
   when the site has it set up: offering a button that always fails is worse
   than not offering it. Asked once per visit. */

import { state } from "./state.js";

export async function loadCapabilities() {
  if (state.capabilities) {
    return state.capabilities;
  }
  try {
    const response = await fetch("/api/capabilities");
    if (response.ok) {
      state.capabilities = await response.json();
    } else {
      state.capabilities = {};
    }
  } catch {
    state.capabilities = {};
  }
  return state.capabilities;
}
