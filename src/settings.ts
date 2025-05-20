import { Vault } from "obsidian";
import { loadData, updateData } from "./data";

// Define the structure of the settings
interface ZhihuSettings {
    user_agent: string;
    restrictToZhihuTag: boolean;
    sendReadToZhihu: boolean;
    recommendCount: number;
}

// Default settings in case none exist in zhihu-data.json
const DEFAULT_SETTINGS: ZhihuSettings = {
    user_agent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    restrictToZhihuTag: false,
    sendReadToZhihu: true,
    recommendCount: 7,
};

/**
 * Load settings from zhihu-data.json
 * @param vault Obsidian Vault instance
 * @returns Promise resolving to ZhihuSettings
 */
export async function loadSettings(vault: Vault): Promise<ZhihuSettings> {
    try {
        const data = await loadData(vault);
        const settings = data?.settings || {};
        return { ...DEFAULT_SETTINGS, ...settings };
    } catch (e) {
        console.error("Error loading settings:", e);
        return { ...DEFAULT_SETTINGS };
    }
}

/**
 * Save settings to zhihu-data.json
 * @param vault Obsidian Vault instance
 * @param settings Partial settings to update
 */
export async function saveSettings(
    vault: Vault,
    settings: Partial<ZhihuSettings>,
): Promise<void> {
    try {
        await updateData(vault, { settings });
    } catch (e) {
        console.error("Error saving settings:", e);
        throw e;
    }
}
