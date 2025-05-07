import { Vault, Notice, View, WorkspaceLeaf, TFile, setIcon } from "obsidian";
import {
	Recommendation,
	loadRecommendations,
	getRecommend,
} from "./recommend_service";
import { Follow, loadFollows, getFollows } from "./follow_service";
import { HotList, loadHotList } from "./hot_lists_service";
import { htmlToMd } from "./html_to_markdown";
import { addFrontmatter } from "./frontmatter";
import { touchToRead } from "./read_service";
import { loadSettings } from "./settings";

export class ZhihuSlidesView extends View {
	private recommendations: Recommendation[] = [];
	private follows: Follow[] = [];
	private hotLists: HotList[] = [];
	private recommendUrl = `https://www.zhihu.com/api/v3/feed/topstory/recommend?action=down&ad_interval=-10&desktop=true&page_number=7`;
	private followUrl = `https://www.zhihu.com/api/v3/moments?limit=10&desktop=true`;
	private nextRecommendUrl = "";
	private nextFollowUrl = "";
	private prevRecommendUrl = "";
	private prevFollowUrl = "";
	constructor(
		leaf: WorkspaceLeaf,
		private vault: Vault,
	) {
		super(leaf);
	}

	getViewType(): string {
		return "zhihu-slides-view";
	}

	getDisplayText(): string {
		return "Zhihu slides";
	}

	getIcon(): string {
		return "zhihu-icon";
	}

	async onOpen() {
		this.render();
	}

	async render() {
		const container = this.containerEl;
		container.empty();
		container.addClass("zhihu-slides-view");

		// recommends
		const recom_details = container.createEl("details");
		recom_details.addClass("side-collapsible");
		const recom_summary = recom_details.createEl("summary", {
			text: "推荐",
		});
		recom_summary.addClass("side-summary");
		const recom_icon_container = recom_summary.createDiv();
		recom_icon_container.addClass("side-icons");
		const recom_prev_icon = recom_icon_container.createEl("span");
		recom_prev_icon.addClass("side-icon");
		recom_prev_icon.setAttr("aria-label", "上一页");
		setIcon(recom_prev_icon, "arrow-left");
		recom_prev_icon.onClickEvent((e) => {
			e.preventDefault();
			this.refreshRecommendations(this.prevRecommendUrl);
		});
		const recom_refresh_icon = recom_icon_container.createEl("span");
		recom_refresh_icon.addClass("side-icon");
		recom_refresh_icon.setAttr("aria-label", "刷新推荐");
		setIcon(recom_refresh_icon, "refresh-cw");
		recom_refresh_icon.onClickEvent((e) => {
			e.preventDefault();
			this.refreshRecommendations(this.recommendUrl);
		});
		const recom_next_icon = recom_icon_container.createEl("span");
		recom_next_icon.addClass("side-icon");
		recom_next_icon.setAttr("aria-label", "下一页");
		setIcon(recom_next_icon, "arrow-right");
		recom_next_icon.onClickEvent((e) => {
			e.preventDefault();
			this.refreshRecommendations(this.nextRecommendUrl);
		});

		const recom_list_container = recom_details.createEl("div");
		recom_list_container.addClass("side-list-container");

		const recom_list = recom_list_container.createEl("ul");
		await this.refreshRecommendations(this.recommendUrl, recom_list); // 初始加载推荐

		// follows
		const follow_details = container.createEl("details");
		follow_details.addClass("side-collapsible");
		const follow_summary = follow_details.createEl("summary", {
			text: "关注",
		});
		follow_summary.addClass("side-summary");

		const follow_icon_container = follow_summary.createDiv();
		follow_icon_container.addClass("side-icons");
		const follow_prev_icon = follow_icon_container.createEl("span");
		follow_prev_icon.addClass("side-icon");
		follow_prev_icon.setAttr("aria-label", "上一页");
		setIcon(follow_prev_icon, "arrow-left");
		follow_prev_icon.onClickEvent((e) => {
			e.preventDefault();
			this.refreshFollows(this.prevFollowUrl);
		});
		const follow_refresh_icon = follow_icon_container.createEl("span");
		follow_refresh_icon.addClass("side-icon");
		follow_refresh_icon.setAttr("aria-label", "刷新关注");
		setIcon(follow_refresh_icon, "refresh-cw");
		follow_refresh_icon.onClickEvent((e) => {
			e.preventDefault();
			this.refreshFollows(this.followUrl);
		});
		const follow_next_icon = follow_icon_container.createEl("span");
		follow_next_icon.addClass("side-icon");
		follow_next_icon.setAttr("aria-label", "下一页");
		setIcon(follow_next_icon, "arrow-right");
		follow_next_icon.onClickEvent((e) => {
			e.preventDefault();
			this.refreshFollows(this.nextFollowUrl);
		});

		const follow_list_container = follow_details.createEl("div");
		follow_list_container.addClass("side-list-container");

		const follow_list = follow_list_container.createEl("ul");
		await this.refreshFollows(this.followUrl, follow_list); // 初始加载关注

		// hot lists
		const hotlist_details = container.createEl("details");
		hotlist_details.addClass("side-collapsible");
		const hotlist_summary = hotlist_details.createEl("summary", {
			text: "热榜",
		});
		hotlist_summary.addClass("side-summary");

		const hotlist_refresh_icon = hotlist_summary.createEl("span");
		hotlist_refresh_icon.addClass("side-icon");
		hotlist_refresh_icon.setAttr("aria-label", "刷新热榜");
		setIcon(hotlist_refresh_icon, "refresh-cw");
		hotlist_refresh_icon.onClickEvent((e) => {
			e.preventDefault();
			this.refreshHotLists();
		});

		const hotlist_container = hotlist_details.createEl("div");
		hotlist_container.addClass("side-list-container");

		const hotlist = hotlist_container.createEl("ul");
		await this.refreshHotLists(hotlist); // 初始加载热榜
	}

	private async refreshRecommendations(
		url: string,
		recom_list?: HTMLElement,
	) {
		const list =
			recom_list ||
			(this.containerEl.querySelector(
				".zhihu-slides-view .side-list-container ul",
			) as HTMLElement);
		const settings = await loadSettings(this.vault);
		list.empty();
		const response = await getRecommend(this.vault, url);
		this.recommendations = loadRecommendations(response);
		this.nextRecommendUrl = response.paging.next;
		this.prevRecommendUrl = response.paging.previous;
		new Notice(response.fresh_text);
		this.recommendations.forEach((recommendation) => {
			const item = list.createEl("li");
			item.addClass("side-item");
			item.setAttr(
				"aria-label",
				`${recommendation.title}\n${recommendation.authorName}`,
			);
			item.setAttr("data-tooltip-position", "right");
			const title = item.createEl("h4", { text: recommendation.title });
			title.addClass("side-title");

			const excerpt = item.createEl("p");
			excerpt.addClass("side-excerpt");
			excerpt.createEl("b", {
				text: recommendation.authorName,
			});
			excerpt.appendText(": " + recommendation.excerpt);

			item.onClickEvent(async () => {
				if (settings.sendReadToZhihu !== false) {
					await touchToRead(
						this.vault,
						recommendation.type,
						recommendation.id,
					);
				}
				this.openContent(
					recommendation.title,
					recommendation.authorName,
					recommendation.url,
					recommendation.content,
					recommendation.type,
				);
			});
		});
	}

	private async refreshFollows(url: string, follow_list?: HTMLElement) {
		const list =
			follow_list ||
			(this.containerEl.querySelectorAll(
				".zhihu-slides-view .side-list-container ul",
			)[1] as HTMLElement);
		const settings = await loadSettings(this.vault);
		list.empty();
		const response = await getFollows(this.vault, url);
		this.follows = loadFollows(response);
		this.nextFollowUrl = response.paging.next;
		this.prevFollowUrl = response.paging.previous;
		new Notice(response.fresh_test); // 逆天，知乎把text打成了test
		this.follows.forEach((follow) => {
			const item = list.createEl("li");
			item.addClass("side-item");
			item.setAttr(
				"aria-label",
				`${follow.title}\n${follow.action_text}`,
			);
			item.setAttr("data-tooltip-position", "right");
			const title = item.createEl("h4", { text: follow.title });
			title.addClass("side-title");

			const excerpt = item.createEl("p");
			excerpt.addClass("side-excerpt");
			excerpt.createEl("b", {
				text: follow.action_text,
			});
			excerpt.appendText(": " + follow.excerpt);

			item.onClickEvent(async () => {
				if (settings.sendReadToZhihu !== false) {
					await touchToRead(this.vault, follow.type, follow.id);
				}
				this.openContent(
					follow.title,
					follow.authorName,
					follow.url,
					follow.content,
					follow.type,
				);
			});
		});
	}

	private async refreshHotLists(hotlist?: HTMLElement) {
		const list =
			hotlist ||
			(this.containerEl.querySelectorAll(
				".zhihu-slides-view .side-list-container ul",
			)[2] as HTMLElement);
		list.empty();
		this.hotLists = await loadHotList(this.vault);
		this.hotLists.forEach((hot) => {
			const item = list.createEl("li");
			item.addClass("side-item");
			item.setAttr("aria-label", hot.title);
			item.setAttr("data-tooltip-position", "right");
			const title = item.createEl("h4", { text: hot.title });
			title.addClass("side-title");

			const excerpt = item.createEl("p");
			excerpt.addClass("side-excerpt");
			excerpt.createEl("b", {
				text: `🔥${hot.detail_text}🔥`,
			});
			excerpt.appendText(": " + hot.excerpt);
		});
	}

	async openContent(
		title: string,
		authorName: string,
		url: string,
		content: string,
		type: string,
	) {
		const typeStr = fromTypeGetStr(type);
		const folderPath = "zhihu";
		title = stripHtmlTags(title);
		const fileName = removeSpecialChars(
			`${title}-${authorName}的${typeStr}.md`,
		);
		const filePath = `${folderPath}/${fileName}`;

		const folder = this.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			await this.vault.createFolder(folderPath);
		}

		let file = this.vault.getAbstractFileByPath(filePath);
		let markdown = htmlToMd(content);
		markdown = addFrontmatter(markdown, "link", url);
		if (!file) {
			file = await this.vault.create(filePath, markdown);
		} else if (!(file instanceof TFile)) {
			console.error(`Path ${filePath} is not a file`);
			return;
		}

		const leaf = this.app.workspace.getLeaf();
		await leaf.openFile(file as TFile);
	}
}

function changePageNumber(url: string, pageNumber: number): string {
	try {
		const parsedUrl = new URL(url);
		parsedUrl.searchParams.set("page_number", pageNumber.toString());
		return parsedUrl.toString();
	} catch (error) {
		console.error("Invalid URL:", error);
		return url;
	}
}

function removeSpecialChars(input: string): string {
	return input.replace(/[/\\[\]|#^:]/g, "");
}

function stripHtmlTags(input: string): string {
	return input.replace(/<[^>]*>/g, "");
}

function fromTypeGetStr(type: string) {
	switch (type) {
		case "article":
			return "文章";
		case "question":
			return "提问";
		case "answer":
			return "回答";
		case "pin":
			return "想法";
		default:
			return "Unknown Item Type";
	}
}
