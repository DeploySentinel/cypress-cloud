/// <reference types="Cypress" />

import fs from "fs";
import { format } from "util";

export function cloudPlugin(
  _on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions
) {
  function debug(...args: unknown[]) {
    if (config.env.currents_debug_enabled) {
      console.debug("[currents:plugin]", format(...args));
    }
  }

  debug("currents plugin loaded");

  if (config.env.currents_temp_file) {
    debug("dumping config to '%s'", config.env.currents_temp_file);
    fs.writeFileSync(config.env.currents_temp_file, JSON.stringify(config));
    debug("config is availabe at '%s'", config.env.currents_temp_file);
  }

  return config;
}

export default cloudPlugin;
