import Debug from "debug";
import path from "path";
import { CurrentsRunParameters, DetectedBrowser } from "../types";
import { bootCypress } from "./bootstrap";
import { getRandomPort } from "./utils";
const debug = Debug("currents:config");

export type CurrentsConfig = { projectId?: string; recordKey?: string };

export async function getCurrentsConfig(): Promise<CurrentsConfig> {
  const configFilePath = await getConfigFilePath();
  debug("loading currents config file from '%s'", configFilePath);

  let config: CurrentsConfig = {};
  try {
    config = require(configFilePath);
    return config;
  } catch (e) {
    return {};
  }
}

export async function getConfig(params: CurrentsRunParameters) {
  debug("resolving cypress config");
  const cypressResolvedConfig:
    | (Cypress.ResolvedConfigOptions & {
        projectRoot: string;
        rawJson: Record<string, unknown>;
        browsers: DetectedBrowser[];
      })
    | undefined = await bootCypress(getRandomPort(), params);

  debug("cypressResolvedConfig: %o", cypressResolvedConfig);

  // @ts-ignore
  const rawE2EPattern = cypressResolvedConfig.rawJson?.e2e?.specPattern;
  let additionalIgnorePattern: string[] = [];
  if (params.testingType === "component" && rawE2EPattern) {
    // @ts-ignore
    additionalIgnorePattern = rawE2EPattern;
  }

  const result = {
    projectRoot: cypressResolvedConfig?.projectRoot || process.cwd(),
    projectId: params.projectId,
    specPattern: cypressResolvedConfig?.specPattern || "**/*.*",
    excludeSpecPattern:
      // @ts-ignore
      cypressResolvedConfig?.resolved.excludeSpecPattern.value ?? [],
    additionalIgnorePattern,
    resolved: cypressResolvedConfig,
  };
  debug("merged config: %o", result);
  return result;

  // see https://github.com/cypress-io/cypress/blob/ed0668e24c2ee6753bbd25ae467ce94ae5857741/packages/config/src/options.ts#L457
  // and https://github.com/cypress-io/cypress/blob/develop/packages/config/src/project/utils.ts#L412
}

function getConfigFilePath(explicitLocation = null) {
  return path.resolve(explicitLocation ?? process.cwd(), "currents.config.js");
}
