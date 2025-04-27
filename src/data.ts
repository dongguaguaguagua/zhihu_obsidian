import { Vault } from "obsidian";
const DATA_FILE = "zhihu-data.json";

export async function loadData(vault: Vault): Promise<any> {
	const filePath = `${vault.configDir}/${DATA_FILE}`;

	try {
		const exists = await vault.adapter.exists(filePath);

		if (exists) {
			const fileContent = await vault.adapter.read(filePath);
			try {
				return JSON.parse(fileContent);
			} catch (e) {
				console.error(`Error parsing ${DATA_FILE}:`, e);
				return {};
			}
		} else {
			const defaultData = {};
			await vault.adapter.write(
				filePath,
				JSON.stringify(defaultData, null, 2),
			);
			return defaultData;
		}
	} catch (e) {
		console.error(`Error accessing ${DATA_FILE}:`, e);
		return {};
	}
}

export async function saveData(vault: Vault, data: any): Promise<void> {
	const filePath = `${vault.configDir}/${DATA_FILE}`;

	try {
		const content = JSON.stringify(data, null, 2);
		await vault.adapter.write(filePath, content);
	} catch (e) {
		console.error("Failed to save data:", e);
		throw e; // 可根据需求决定是否抛出错误
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

export async function deleteData(vault: Vault, key: string): Promise<void> {
	const data = (await loadData(vault)) || {};
	if (key in data) {
		delete data[key];
		await saveData(vault, data);
	} else {
		console.warn(`Key "${key}" not found in ${DATA_FILE}`);
	}
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
