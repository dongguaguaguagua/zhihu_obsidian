import { TFile, normalizePath, Vault } from "obsidian";

const DATA_PATH = "data.json";

export async function loadData(vault: Vault): Promise<any> {
	const path = normalizePath(DATA_PATH);

	try {
		const file = vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			const content = await vault.read(file);
			return JSON.parse(content);
		} else {
			const defaultData = {};
			await vault.create(path, JSON.stringify(defaultData, null, 2));
			return defaultData;
		}
	} catch (e) {
		console.error("Failed to load data:", e);
		return {};
	}
}

export async function saveData(vault: Vault, data: any): Promise<void> {
	const path = normalizePath(DATA_PATH);

	try {
		const file = vault.getAbstractFileByPath(path);
		const content = JSON.stringify(data, null, 2);

		if (file instanceof TFile) {
			await vault.modify(file, content);
		} else {
			await vault.create(path, content);
		}
	} catch (e) {
		console.error("Failed to save data:", e);
	}
}

export async function updateData(
	vault: Vault,
	patch: Record<string, any>,
): Promise<void> {
	const oldData = (await loadData(vault)) || {};
	const newData = deepMerge(oldData, patch);
	await saveData(vault, newData);
}

function deepMerge(target: any, source: any): any {
	if (typeof target !== "object" || target === null) return source;
	if (typeof source !== "object" || source === null) return source;

	const merged: Record<string, any> = { ...target };

	for (const key of Object.keys(source)) {
		const targetVal = target[key];
		const sourceVal = source[key];

		if (
			typeof targetVal === "object" &&
			targetVal !== null &&
			typeof sourceVal === "object" &&
			sourceVal !== null &&
			!Array.isArray(sourceVal)
		) {
			merged[key] = deepMerge(targetVal, sourceVal);
		} else {
			merged[key] = sourceVal;
		}
	}

	return merged;
}
