import * as cookies from "./cookies";
import * as dataUtil from "./data";
import { Vault, Notice, requestUrl } from "obsidian";
import { loadSettings } from "./settings";

export interface Follow {
	id: string;
	type: string;
	title: string;
	excerpt: string;
	authorName: string;
	url: string;
	content: string;
	action_text: string;
}

export async function getFollows(vault: Vault, url: string) {
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
		new Notice(`获取关注失败: ${error}`);
	}
}

export function loadFollows(response: any) {
	try {
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
			title: fromItemGetTitle(item),
			excerpt:
				item.target.excerpt_new ||
				item.target.excerpt ||
				item.target.excerpt_title,
			authorName: item.target.author.name,
			url: fromItemGetUrl(item),
			content: fromItemGetContent(item),
		}));
	} catch (error) {
		console.error("Failed to load follows:", error);
		return [];
	}
}

function fromItemGetTitle(item: any) {
	switch (item.target.type) {
		case "article":
			return item.target.title;
		case "question":
			return item.target.title;
		case "answer":
			return item.target.question.title;
		case "pin":
			return truncateString(
				stripHtmlTags(item.target.content[0].content),
			);
		default:
			return "Unknown Item Type";
	}
}

function fromItemGetUrl(item: any) {
	switch (item.target.type) {
		case "article":
			return `https://zhuanlan.zhihu.com/p/${item.target.id}`;
		case "question":
			return `https://www.zhihu.com/question/${item.target.id}`;
		case "answer":
			return `https://www.zhihu.com/question/${item.target.question.id}/answer/${item.target.id}`;
		case "pin":
			return `https://www.zhihu.com/pin/${item.target.id}`;
		default:
			return "Unknown Item Type";
	}
}

function fromItemGetContent(item: any) {
	switch (item.target.type) {
		case "article":
			return item.target.content;
		case "question":
			return item.target.detail;
		case "answer":
			return item.target.content;
		case "pin":
			return item.target.content_html;
		default:
			return "Unknown Item Type";
	}
}

function stripHtmlTags(input: string): string {
	return input.replace(/<[^>]*>/g, "");
}

function truncateString(str: string, maxLength = 200): string {
	if (str.length <= maxLength) {
		return str;
	}
	return str.slice(0, maxLength) + "...";
}
