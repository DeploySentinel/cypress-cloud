import "./init";

import crypto from "crypto";
import Debug from "debug";
import { CurrentsRunParameters } from "../types";
import { createRun } from "./api";
import { cutInitialOutput } from "./capture";
import { getCI } from "./ciProvider";
import {
  getMergedConfig,
  isOffline,
  preprocessParams,
  validateParams,
} from "./config";
import { runBareCypress } from "./cypress";
import { getGitInfo } from "./git";
import { setAPIBaseUrl, setRunId } from "./httpClient";
import { bold, divider, info, spacer, title } from "./log";
import { getPlatform } from "./platform";
import { summarizeTestResults, summaryTable } from "./results";
import { runTillDoneOrCancelled, summary, uploadTasks } from "./runner";
import { getSpecFiles } from "./specMatcher";

const debug = Debug("currents:run");

// DeploySentinel helpers
export const setDSMachineId = (machineId?: string) => {
  process.env.CYPRESS_DEPLOYSENTINEL_MACHINE_ID =
    process.env.CYPRESS_DEPLOYSENTINEL_MACHINE_ID ??
    machineId ??
    crypto.randomUUID();
  debug(
    "setting DS machine id to %s",
    process.env.CYPRESS_DEPLOYSENTINEL_MACHINE_ID
  );
};
const setDSCustomEnvs = () => {
  // Set up ELECTRON_EXTRA_LAUNCH_ARGS if not present
  if (!process.env.ELECTRON_EXTRA_LAUNCH_ARGS) {
    console.log(
      'Setting ELECTRON_EXTRA_LAUNCH_ARGS = "--remote-debugging-port=40500"'
    );
    process.env.ELECTRON_EXTRA_LAUNCH_ARGS = "--remote-debugging-port=40500";
  } else if (
    !process.env.ELECTRON_EXTRA_LAUNCH_ARGS.includes("--remote-debugging-port")
  ) {
    console.log(
      'Adding "--remote-debugging-port=40500" to ELECTRON_EXTRA_LAUNCH_ARGS'
    );
    process.env.ELECTRON_EXTRA_LAUNCH_ARGS += " --remote-debugging-port=40500";
  }
};

export async function run(params: CurrentsRunParameters = {}) {
  debug("run params %o", params);
  params = preprocessParams(params);
  debug("params after preprocess %o", params);

  if (isOffline(params)) {
    info(`Skipping cloud orchestration because --record is set to false`);
    return runBareCypress(params);
  }
  const validatedParams = validateParams(params);
  setAPIBaseUrl(validatedParams.cloudServiceUrl);

  setDSCustomEnvs();

  const {
    recordKey,
    projectId,
    group,
    parallel,
    ciBuildId,
    tag,
    testingType,
    batchSize,
    autoCancelAfterFailures,
  } = validatedParams;

  const config = await getMergedConfig(validatedParams);
  const { specs, specPattern } = await getSpecFiles({
    config,
    params: validatedParams,
  });

  if (specs.length === 0) {
    return;
  }

  const platform = await getPlatform({
    config,
    browser: validatedParams.browser,
  });

  divider();

  info("Discovered %d spec files", specs.length);
  info(
    `Tags: ${tag.length > 0 ? tag.join(",") : false}; Group: ${
      group ?? false
    }; Parallel: ${parallel ?? false}; Batch Size: ${batchSize}`
  );
  info("Connecting to cloud orchestration service...");

  const run = await createRun({
    ci: getCI(ciBuildId),
    specs: specs.map((spec) => spec.relative),
    commit: await getGitInfo(config.projectRoot),
    group,
    platform,
    parallel: parallel ?? false,
    ciBuildId,
    projectId,
    recordKey,
    specPattern: [specPattern].flat(2),
    tags: tag,
    testingType,
    batchSize,
    autoCancelAfterFailures,
  });

  info("🎥 Run URL:", bold(run.runUrl));

  setRunId(run.runId);

  setDSMachineId(run.machineId);

  cutInitialOutput();

  await runTillDoneOrCancelled(
    {
      runId: run.runId,
      groupId: run.groupId,
      machineId: run.machineId,
      platform,
      config,
      specs,
    },
    validatedParams
  );

  divider();

  await Promise.allSettled(uploadTasks);
  const _summary = summarizeTestResults(Object.values(summary), config);

  title("white", "Cloud Run Finished");
  console.log(summaryTable(_summary));
  info("🏁 Recorded Run:", bold(run.runUrl));

  spacer();
  if (_summary.status === "finished") {
    return {
      ..._summary,
      runUrl: run.runUrl,
    };
  }
  return _summary;
}
