import { invoke, isTauri } from "@tauri-apps/api/core";

import type { EngineBootstrap, EngineCommand, EngineView, ProjectCommand } from "../types/show";

export interface UsbDmxDevice {
  path: string;
  name: string;
  driver: string;
}

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

export async function createProject(): Promise<EngineBootstrap | null> {
  return invoke<EngineBootstrap | null>("new_project");
}

export async function openProject(): Promise<EngineBootstrap | null> {
  return invoke<EngineBootstrap | null>("open_project");
}

export async function openRecentProject(path: string): Promise<EngineBootstrap> {
  return invoke<EngineBootstrap>("open_recent_project", { path });
}

export async function saveProjectAs(): Promise<EngineBootstrap | null> {
  return invoke<EngineBootstrap | null>("save_project_as");
}

export async function openLiveDisplay(): Promise<void> {
  if (hasNativeEngine()) {
    await invoke("open_live_window");
  } else {
    window.open("?display=live", "lighthouse-live-display", "width=1280,height=760");
  }
}

export async function listUsbDmxDevices(): Promise<UsbDmxDevice[]> {
  if (!hasNativeEngine()) return [];
  return invoke<UsbDmxDevice[]>("list_usb_dmx_devices");
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
