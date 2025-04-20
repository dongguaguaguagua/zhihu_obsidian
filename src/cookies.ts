import { Vault } from "obsidian";

export function getCookiesFromHeader(response: any): { [key: string]: string } {
	let new_cookies: string[] = [];
	const res_cookies = response.headers["set-cookie"];
	if (Array.isArray(res_cookies)) {
		new_cookies = res_cookies;
	} else if (typeof res_cookies === "string") {
		new_cookies = [res_cookies];
	}

	const result: { [key: string]: string } = {};

	new_cookies.forEach((cookieStr) => {
		const [keyValuePair] = cookieStr.split(";");
		const separatorIndex = keyValuePair.indexOf("=");
		if (separatorIndex !== -1) {
			const key = keyValuePair.substring(0, separatorIndex).trim();
			const value = keyValuePair.substring(separatorIndex + 1).trim();
			result[key] = value;
		}
	});

	return result;
}

export function cookiesHeaderBuilder(data: any, keys: string[]): string {
	// const data = await data.loadData(vault);
	const cookiesHeader = Object.entries(data.cookies)
		.filter(([key]) => keys.includes(key))
		.map(([key, value]) => `${key}=${value}`)
		.join("; ");
	return cookiesHeader;
}
