export {};

// export interface Recommendation {
// 	id: string;
// 	type: string;
// 	title: string;
// 	excerpt: string;
// 	content: string;
// }

// async function getAnswerFromQuestion(vault: Vault) {
// 	try {
// 		const data = await dataUtil.loadData(vault);
// 		const cookiesHeader = cookies.cookiesHeaderBuilder(data, [
// 			"_zap",
// 			"_xsrf",
// 			"BEC",
// 			"d_c0",
// 			"captcha_session_v2",
// 			"z_c0",
// 			"q_c1",
// 		]);
// 		const response = await requestUrl({
// 			url: `https://www.zhihu.com/api/v3/feed/topstory/recommend?action=down&ad_interval=-10&desktop=true&page_number=7`,
// 			headers: {
// 				"User-Agent":
// 					settings.user_agent,
// 				"accept-language":
// 					"zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
// 				referer: "https://www.zhihu.com/question/1897565739235398916",
// 				"x-requested-with": "fetch",
// 				Cookie: cookiesHeader,
// 			},
// 			method: "GET",
// 		});
// 		return response.json;
// 	} catch (error) {
// 		console.log(error);
// 		new Notice(`获取推荐失败: ${error}`);
// 	}
// }

// export async function loadRecommendations(vault: Vault) {
// 	try {
// 		const response = await getRecommend(vault);
// 		const filteredData = response.data.filter(
// 			(item: any) =>
// 				item.type !== "feed_advert" &&
// 				item.target &&
// 				Object.keys(item.target).length > 0,
// 		);
// 		return filteredData.map((item: any) => ({
// 			id: item.target.id,
// 			type: item.target.type,
// 			title:
// 				item.target.type === "article"
// 					? item.target.title
// 					: item.target.question.title,
// 			excerpt: item.target.excerpt_new || item.target.excerpt,
// 			content: item.target.content,
// 		}));
// 	} catch (error) {
// 		console.error("Failed to load recommendations:", error);
// 		this.recommendations = [];
// 	}
// }
