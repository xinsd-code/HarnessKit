interface PickerOptions {
  title?: string;
  multiple?: boolean;
}

export async function openFilePicker(
  options?: PickerOptions,
): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: options?.multiple ?? false,
      title: options?.title,
    });
    return typeof selected === "string" ? selected : null;
  } catch (e) {
    console.error("Dialog plugin not available:", e);
    return null;
  }
}

export async function openDirectoryPicker(
  options?: PickerOptions,
): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, title: options?.title });
    return typeof selected === "string" ? selected : null;
  } catch (e) {
    console.error("Dialog plugin not available:", e);
    return null;
  }
}
