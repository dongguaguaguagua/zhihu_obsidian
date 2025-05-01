import * as cookies from "./cookies";
import * as dataUtil from "./data";
import { Vault, Notice, requestUrl } from "obsidian";

export interface HotList {
	link: string;
	title: string;
	detail_text: string;
	excerpt: string;
	answer_count: number;
}

async function getHotLists(vault: Vault) {
	try {
		const data = await dataUtil.loadData(vault);
		const cookiesHeader = cookies.cookiesHeaderBuilder(data, [
			"_zap",
			"_xsrf",
			"BEC",
			"d_c0",
			"captcha_session_v2",
			"z_c0",
			"q_c1",
		]);
		const response = await requestUrl({
			url: `https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&desktop=true`,
			headers: {
				"User-Agent": data.settings.user_agent,
				"accept-language":
					"zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
				"accept-encoding": "gzip, deflate, br, zstd",
				referer: "https://www.zhihu.com/follow",
				"x-api-version": "3.0.53",
				"x-requested-with": "fetch",
				Cookie: cookiesHeader,
			},
			method: "GET",
		});
		return response.json;
	} catch (error) {
		console.log(error);
		new Notice(`获取热榜失败: ${error}`);
	}
}

export async function loadHotList(vault: Vault) {
	try {
		const response = await getHotLists(vault);
		const filteredData = response.data.filter(
			(item: any) =>
				item.type === "hot_list_feed" &&
				item.target &&
				Object.keys(item.target).length > 0,
		);
		new Notice(response.fresh_text);
		return filteredData.map((item: any) => ({
			id: item.target.id,
			title: item.target.title,
			excerpt: item.target.excerpt,
			detail_text: item.detail_text,
			link: item.target.url,
		}));
	} catch (error) {
		console.error("Failed to load hot lists:", error);
		return [];
	}
}
