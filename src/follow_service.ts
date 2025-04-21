import * as cookies from "./cookies";
import * as dataUtil from "./data";
import { Vault, Notice, requestUrl } from "obsidian";

export interface Follow {
	id: string;
	action_text: string;
	type: string;
	title: string;
	excerpt: string;
	content: string;
}

async function getFollows(vault: Vault) {
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
			url: `https://www.zhihu.com/api/v3/moments?limit=10&desktop=true`,
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0",
				"accept-language":
					"zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
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
		new Notice(`获取关注失败: ${error}`);
	}
}

export async function loadFollows(vault: Vault) {
	try {
		const response = await getFollows(vault);
		const filteredData = response.data.filter(
			(item: any) =>
				item.type !== "feed_advert" &&
				item.target &&
				Object.keys(item.target).length > 0,
		);
		return filteredData.map((item: any) => ({
			id: item.target.id,
			action_text: item.action_text,
			type: item.target.type,
			title:
				item.target.type === "article"
					? item.target.title
					: item.target.question.title,
			excerpt: item.target.excerpt_new || item.target.excerpt,
			content: item.target.content,
		}));
	} catch (error) {
		console.error("Failed to load follows:", error);
		this.follows = [];
	}
}
