import { invoke, isTauri } from "@tauri-apps/api/core";

import type { EngineBootstrap, EngineCommand, EngineView, ProjectCommand } from "../types/show";

type ViewHandler = (view: EngineView) => void;
type ErrorHandler = (message: string) => void;

interface PendingCommand {
  command: EngineCommand;
  timer: number;
  onView: ViewHandler;
  onError: ErrorHandler;
}

const pendingCommands = new Map<string, PendingCommand>();

export function hasNativeEngine(): boolean {
  return isTauri();
}

export async function getEngineBootstrap(): Promise<EngineBootstrap> {
  return invoke<EngineBootstrap>("get_bootstrap");
}

export async function refreshEngine(): Promise<EngineView> {
  return invoke<EngineView>("refresh_engine");
}

export async function sendProjectCommand(command: ProjectCommand): Promise<EngineBootstrap> {
  return invoke<EngineBootstrap>("project_command", { command });
}

export async function openLiveDisplay(): Promise<void> {
  if (hasNativeEngine()) {
    await invoke("open_live_window");
  } else {
    window.open("?display=live", "lighthouse-live-display", "width=1280,height=760");
  }
}

export function dispatchEngineCommand(
  command: EngineCommand,
  onView: ViewHandler,
  onError: ErrorHandler,
  coalescingKey?: string,
): void {
  if (!hasNativeEngine()) return;
  if (!coalescingKey) {
    void send(command, onView, onError);
    return;
  }
  const pending = pendingCommands.get(coalescingKey);
  if (pending) window.clearTimeout(pending.timer);
  const timer = window.setTimeout(() => {
    pendingCommands.delete(coalescingKey);
    void send(command, onView, onError);
  }, 28);
  pendingCommands.set(coalescingKey, { command, timer, onView, onError });
}

async function send(
  command: EngineCommand,
  onView: ViewHandler,
  onError: ErrorHandler,
): Promise<void> {
  try {
    onView(await invoke<EngineView>("engine_command", { command }));
  } catch (error) {
    onError(errorMessage(error));
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
