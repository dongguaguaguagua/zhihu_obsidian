import { App, Vault, Notice, requestUrl } from "obsidian";
import * as dataUtil from "./data";
import * as topicsUtil from "./topics";
import * as fm from "./frontmatter";
import * as render from "./custom_render";
import { v4 as uuidv4 } from "uuid";
import * as cookies from "./cookies";
import * as imageService from "./image_service";
import { normalizeStr } from "./utilities";
import { addPopularizeStr } from "./popularize";
import { loadSettings } from "./settings";

export async function publishCurrentFile(app: App) {
	const activeFile = app.workspace.getActiveFile();
	const vault = app.vault;
	if (!activeFile) {
		console.warn("No active file found");
		return;
	}
	const fileCache = app.metadataCache.getFileCache(activeFile);
	const frontmatter = fileCache?.frontmatter;
	if (!frontmatter) {
		new Notice("Zhihu on obsidian要求要添加文章属性");
		return;
	}
	const tags = normalizeStr(frontmatter.tags);
	const topics = normalizeStr(frontmatter.topics);
	const hasZhihuTag = tags.includes("zhihu");
	if (!hasZhihuTag) {
		new Notice("Zhihu on obsidian要求标签包含zhihu");
		return;
	}
	if (topics.length === 0) {
		new Notice("Zhihu on obsidian要求必须添加话题");
		return;
	}
	// 这里链接属性缺失或者为空，都表明未发表文章
	const status = publishStatus(frontmatter.link);
	const title = frontmatter.title || "untitled";
	const toc = false;
	const rawContent = await app.vault.read(activeFile);
	const rmFmContent = fm.removeFrontmatter(rawContent);
	// 获取文章的ID，如果未发表则新建一个。
	let articleId = "";
	switch (status) {
		case 0: // 未发表
			articleId = await newDraft(vault, title);
			break;
		case 1: // 已发表
			articleId = frontmatter.link.replace(
				"https://zhuanlan.zhihu.com/p/",
				"",
			);
			break;
		case 2: // 未发表但已生成草稿
			articleId = frontmatter.link.match(
				/^https:\/\/zhuanlan\.zhihu\.com\/p\/(\d+)(\/edit)?$/,
			)[1];
			break;
		case 3: // 无效链接
			new Notice("无效链接！");
			return;
		default:
			new Notice("未知错误");
			break;
	}
	// 处理文章封面上传
	const cover = frontmatter.cover;
	if (!(typeof cover === "undefined" || cover === null)) {
		const coverURL = await imageService.uploadCover(vault, cover);
		const patchBody = {
			titleImage: coverURL,
			isTitleImageFullScreen: false,
			delta_time: 30,
		};
		await patchDraft(vault, articleId, patchBody);
		new Notice("封面上传成功！");
	}
	const transedImgContent = await imageService.transImgToZhihuLink(
		vault,
		articleId,
		rmFmContent,
	);
	let zhihuHTML = await render.mdToZhihuHTML(transedImgContent);
	zhihuHTML = addPopularizeStr(zhihuHTML); // 加上推广文字
	const patchBody = {
		title: title,
		content: zhihuHTML,
		table_of_contents: toc,
		delta_time: 30,
		can_reward: false,
	};
	await patchDraft(vault, articleId, patchBody);
	// 文章加入话题，否则通常无法发表。话题是自动选取匹配的。
	for (const topic of topics) {
		try {
			const res = await topicsUtil.autoCompleteTopic(
				vault,
				articleId,
				topic,
			);
			if (Array.isArray(res) && res.length > 0) {
				await topicsUtil.topics2Draft(vault, articleId, res[0]);
			}
		} catch (err) {
			console.error(
				`Error auto-completing topic for tag "${topic}":`,
				err,
			);
		}
	}
	// 把文章投稿至问题
	const toAnswer = frontmatter.answer;
	if (toAnswer) {
		const questionId = extractQuestionId(toAnswer);
		if (questionId) {
			await checkQuestion(vault, articleId, questionId);
		}
	}
	const publishResult = await publishDraft(
		vault,
		articleId,
		toc,
		status === 1,
	);
	const url = publishResult.publish.url;
	switch (status) {
		case 0:
		case 2:
			await app.fileManager.processFrontMatter(
				activeFile,
				(frontmatter) => {
					frontmatter.link = url;
				},
			);
			new Notice("发布文章成功！");
			break;
		case 1:
			new Notice("更新文章成功！");
			break;
		default:
			new Notice("未知错误");
			break;
	}
}

export async function createNewZhihuArticle(app: App) {
	const vault = app.vault;
	const workspace = app.workspace;
	let fileName = "untitled";
	let filePath = `${fileName}.md`;
	let counter = 1;

	// 检查文件是否存在，如果存在则递增数字
	while (await vault.adapter.exists(filePath)) {
		fileName = `untitled ${counter}`;
		filePath = `${fileName}.md`;
		counter++;
	}

	try {
		const newFile = await vault.create(filePath, "");
		const defaultTitle = "untitled";
		const articleId = await newDraft(vault, defaultTitle);
		await app.fileManager.processFrontMatter(newFile, (frontmatter) => {
			frontmatter.tags = "zhihu";
			frontmatter.title = defaultTitle;
			frontmatter.topics = "";
			frontmatter.link = `https://zhuanlan.zhihu.com/p/${articleId}/edit`;
		});
		const leaf = workspace.getLeaf(false);
		await leaf.openFile(newFile);
		return filePath;
	} catch (error) {
		console.error(`Error creating or modifying file: ${error}`);
		throw error;
	}
}

async function newDraft(vault: Vault, title: string) {
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
		]);
		const xsrftoken = data.cookies._xsrf;
		const response = await requestUrl({
			url: `https://zhuanlan.zhihu.com/api/articles/drafts`,
			headers: {
				"User-Agent": settings.user_agent,
				"Accept-Encoding": "gzip, deflate, br, zstd",
				"Content-Type": "application/json",
				"accept-language":
					"zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
				referer: "https://zhuanlan.zhihu.com/write",
				"x-requested-with": "fetch",
				"x-xsrftoken": xsrftoken,
				// 'x-zst-81': '3_2.0aR_sn77yn6O92wOB8hPZniUZo02x-7om0CNMDrxTrR2xQRY01T2Z-we8gGHPDRFZG0Y0jQgM7A2pr6P0mRPO7HoY70SfquPmz93mhDQyiqV9ebO1hwOYiiR0ELYuUrxmtDomqU7ynXtOnAoTh_PhRDSTFRC_EqXMywpykbOfrJHMoC2B8XxMSeVO6LosB9OGYUXYJUHq3UwprcxL7UeTvTrf9CCBicS8hggKgCeY68XsagpMBXLKwhO1xJO96LpGADwmDJSfVgcYbLeVmU3MJbO03qtLPD3M2CtKb4omVBS8ave87ggfu9eq1wtVpCYytCL_8vxmCqkw3BYL6gpKJULLhgpK2cfyJhXC6CHMogp1oH39RJSMSqH_QJN_CBFCQqHYwrrCih3__rx1K0tKbCLYIg3XhgcCZuFKzUH9hgHKarLO8MF0ST9ZQXLKeXYC',
				origin: "https://zhuanlan.zhihu.com",
				// 'dnt': '1',
				// 'sec-gpc': '1',
				// 'sec-fetch-dest': 'empty',
				// 'sec-fetch-mode': 'cors',
				// 'sec-fetch-site': 'same-origin',
				// 'priority': 'u=4',
				// 'te': 'trailers',
				Cookie: cookiesHeader,
			},
			method: "POST",
			body: JSON.stringify({
				title: title,
				delta_time: 0,
				can_reward: false,
			}),
		});
		const articleId = response.json.id;
		new Notice(`获取文章ID成功`);
		return articleId;
	} catch (error) {
		new Notice(`生成新的草稿失败: ${error}`);
	}
}

async function patchDraft(vault: Vault, id: string, patchBody: any) {
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
		]);
		const xsrftoken = data.cookies._xsrf;
		const url = `https://zhuanlan.zhihu.com/api/articles/${id}/draft`;
		await requestUrl({
			url: url,
			headers: {
				"User-Agent": settings.user_agent,
				"Accept-Encoding": "gzip, deflate, br, zstd",
				"Content-Type": "application/json",
				"accept-language":
					"zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
				referer: `https://zhuanlan.zhihu.com/p/${id}/edit`,
				"x-requested-with": "fetch",
				"x-xsrftoken": xsrftoken,
				// 'x-zst-81': '3_2.0aR_sn77yn6O92wOB8hPZniUZo02x-7om0CNMDrxTrR2xQRY01T2Z-we8gGHPDRFZG0Y0jQgM7A2pr6P0mRPO7HoY70SfquPmz93mhDQyiqV9ebO1hwOYiiR0ELYuUrxmtDomqU7ynXtOnAoTh_PhRDSTFRC_EqXMywpykbOfrJHMoC2B8XxMSeVO6LosB9OGYUXYJUHq3UwprcxL7UeTvTrf9CCBicS8hggKgCeY68XsagpMBXLKwhO1xJO96LpGADwmDJSfVgcYbLeVmU3MJbO03qtLPD3M2CtKb4omVBS8ave87ggfu9eq1wtVpCYytCL_8vxmCqkw3BYL6gpKJULLhgpK2cfyJhXC6CHMogp1oH39RJSMSqH_QJN_CBFCQqHYwrrCih3__rx1K0tKbCLYIg3XhgcCZuFKzUH9hgHKarLO8MF0ST9ZQXLKeXYC',
				origin: "https://zhuanlan.zhihu.com",
				// 'dnt': '1',
				// 'sec-gpc': '1',
				// 'sec-fetch-dest': 'empty',
				// 'sec-fetch-mode': 'cors',
				// 'sec-fetch-site': 'same-origin',
				// 'priority': 'u=4',
				// 'te': 'trailers',
				Cookie: cookiesHeader,
			},
			method: "PATCH",
			body: JSON.stringify(patchBody),
		});
		new Notice(`patch文章成功`);
	} catch (error) {
		new Notice(`patch文章失败: ${error}`);
	}
}

async function publishDraft(
	vault: Vault,
	id: string,
	toc: boolean,
	isPublished: boolean,
) {
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
		const xsrftoken = data.cookies._xsrf;
		const traceId = `${Date.now()},${uuidv4()}`;
		const response = await requestUrl({
			url: `https://www.zhihu.com/api/v4/content/publish`,
			headers: {
				"User-Agent": settings.user_agent,
				"Accept-Encoding": "gzip, deflate, br, zstd",
				"Content-Type": "application/json",
				"accept-language":
					"zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
				// 'referer': `https://zhuanlan.zhihu.com/p/${id}/edit`,
				"x-requested-with": "fetch",
				"x-xsrftoken": xsrftoken,
				// 'x-zse-93': '101_3_3.0',
				// 'x-zse-96': '2.0_LR8Q6m9DRDr5V67FbmueqQC2WpP4haQauHp/y0C25HxTT6Hw5+5hLKca68OOHRKY',
				// 'x-zst-81': '3_2.0aR_sn77yn6O92wOB8hPZniUZo02x-7om0CNMDrxTrR2xQRY01T2Z-we8gGHPDRFZG0Y0jQgM7A2pr6P0mRPO7HoY70SfquPmz93mhDQyiqV9ebO1hwOYiiR0ELYuUrxmtDomqU7ynXtOnAoTh_PhRDSTFTYO8Ug1sR316cH0fBV8jug87CtOAgNmkvx_VhFCUUCGFJemtGxfBBV0YCSTvTrf9CCBicS8hggKgCeY68XsagpMBXLKwhO1xJO96LpGADwmDJSfVgcYbLeVmU3MJbO03qtLPD3M2CtKb4omVBS8ave87ggfu9eq1wtVpCYytCL_8vxmCqkw3BYL6gpKJULLhgpK2cfyJhXC6CHMogp1oH39RJSMSqH_QJN_CBFCQqHYwrrCih3__rx1K0tKbCLYIg3XhgcCZuFKzUH9hgHKarLO8MF0ST9ZQXLKeXYC',
				// 'origin': 'https://zhuanlan.zhihu.com',
				// 'dnt': '1',
				// 'sec-gpc': '1',
				// 'sec-fetch-dest': 'empty',
				// 'sec-fetch-mode': 'cors',
				// 'sec-fetch-site': 'same-site',
				// 'priority': 'u=0',
				// 'te': 'trailers',
				Cookie: cookiesHeader,
			},
			method: "POST",
			body: JSON.stringify({
				action: "article",
				data: {
					publish: { traceId: traceId },
					extra_info: {
						publisher: "pc",
						pc_business_params: `{\
                       "column":null,\
                       "commentPermission":"anyone",\
                       "disclaimer_type":"none",\
                       "disclaimer_status":"close",\
                       "table_of_contents_enabled":${toc},\
                       "commercial_report_info":{"commercial_types":[]},\
                       "commercial_zhitask_bind_info":null,\
                       "canReward":false\
                   }`,
					},
					draft: {
						disabled: 1,
						id: id,
						isPublished: isPublished,
					},
					commentsPermission: { comment_permission: "anyone" },
					creationStatement: {
						disclaimer_type: "none",
						disclaimer_status: "close",
					},
					contentsTables: { table_of_contents_enabled: toc },
					commercialReportInfo: { isReport: 0 },
					appreciate: { can_reward: false, tagline: "" },
					hybridInfo: {},
				},
			}),
		});
		if (response.json.message === "success") {
			const result = JSON.parse(response.json.data.result);
			return result;
		}
	} catch (error) {
		new Notice(`发布文章失败: ${error}`);
	}
}

async function checkQuestion(
	vault: Vault,
	articleId: string,
	questionId: string,
) {
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
		const xsrftoken = data.cookies._xsrf;
		const url = `https://www.zhihu.com/api/v4/creators/article_publish/check/question`;
		await requestUrl({
			url: url,
			headers: {
				"User-Agent": settings.user_agent,
				"Accept-Encoding": "gzip, deflate, br, zstd",
				"Content-Type": "application/json",
				"accept-language":
					"zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
				// referer: `https://zhuanlan.zhihu.com/p/${articleId}/edit`,
				"x-requested-with": "fetch",
				"x-xsrftoken": xsrftoken,
				// origin: "https://zhuanlan.zhihu.com",
				// 'dnt': '1',
				// 'sec-gpc': '1',
				// 'sec-fetch-dest': 'empty',
				// 'sec-fetch-mode': 'cors',
				// 'sec-fetch-site': 'same-origin',
				// 'priority': 'u=4',
				// 'te': 'trailers',
				Cookie: cookiesHeader,
			},
			method: "POST",
			body: JSON.stringify({
				article_token: articleId,
				question_token: questionId,
			}),
		});
		new Notice(`添加回答成功`);
	} catch (error) {
		new Notice(`添加回答失败: ${error}`);
	}
}

function publishStatus(link: string): number {
	if (typeof link === "undefined" || link === null) {
		// 如果链接为空或者不存在link这个属性
		// 说明未发表
		return 0;
	} else if (isZhihuArticleLink(link)) {
		// 如果通过了知乎文章链接的正则匹配
		// 说明已经发表
		return 1;
	} else if (isZhihuDraftLink(link)) {
		// 如果通过了知乎草稿链接的正则匹配
		// 说明未发布但是已生成草稿
		return 2;
	} else {
		return 3;
	}
}

function isZhihuArticleLink(link: string): boolean {
	const pattern = /^https:\/\/zhuanlan\.zhihu\.com\/p\/\d+$/;
	return pattern.test(link);
}

function isZhihuDraftLink(link: string): boolean {
	const pattern = /^https:\/\/zhuanlan\.zhihu\.com\/p\/\d+(\/edit)?$/;
	return pattern.test(link);
}

function extractQuestionId(url: string): string | null {
	const match = url.match(/zhihu\.com\/question\/(\d+)/);
	return match ? match[1] : "";
}
