/** Workspace URL that starts the recorded run. Carries no visitor input. */
export const REPLAY_WORKSPACE_HREF = "/?replay=run";

export function shouldAutoStartReplay(param: string | string[] | undefined): boolean {
  return param === "run";
}
