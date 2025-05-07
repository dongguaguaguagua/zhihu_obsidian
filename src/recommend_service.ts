import * as cookies from "./cookies";
import * as dataUtil from "./data";
import { Vault, Notice, requestUrl } from "obsidian";
import { loadSettings } from "./settings";

export interface Recommendation {
	id: string;
	type: string;
	title: string;
	excerpt: string;
	authorName: string;
	url: string;
	content: string;
}

export async function getRecommend(vault: Vault, url: string) {
	try {
		const data = await dataUtil.loadData(vault);
		const settings = await loadSettings(vault);
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
			url: url,
			headers: {
				"User-Agent": settings.user_agent,
				"Accept-Encoding": "gzip, deflate, br, zstd",
				"accept-language":
					"zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
				referer: "https://www.zhihu.com/",
				"x-api-version": "3.0.53",
				"x-requested-with": "fetch",
				Cookie: cookiesHeader,
			},
			method: "GET",
		});
		return response.json;
	} catch (error) {
		new Notice(`获取推荐失败: ${error}`);
	}
}

export function loadRecommendations(response: any) {
	try {
		const filteredData = response.data.filter(
			(item: any) =>
				item.type !== "feed_advert" &&
				item.target &&
				Object.keys(item.target).length > 0,
		);
		return filteredData.map((item: any) => ({
			id: item.target.id,
			type: item.target.type,
			title:
				item.target.type === "article"
					? item.target.title
					: item.target.question.title,
			excerpt: item.target.excerpt_new || item.target.excerpt,
			authorName: item.target.author.name,
			url:
				item.target.type === "article"
					? `https://zhuanlan.zhihu.com/p/${item.target.id}`
					: `https://www.zhihu.com/question/${item.target.question.id}/answer/${item.target.id}`,
			content: item.target.content,
		})) as [Recommendation];
	} catch (error) {
		console.error("Failed to load recommendations:", error);
		return [];
	}
}
