import { writeFile, readFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

export async function saveData(data: string, path: string, name: string) {
    const filePath = await join(path, "../" + name);
    const endcoded = new TextEncoder().encode(data);
    await writeFile(filePath, endcoded);
}

export async function loadData(filePath: string) {
    const data = await readFile(filePath);
    return data;
}
