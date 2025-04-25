import { Vault, Notice, View, WorkspaceLeaf, setIcon } from "obsidian";
import {
	Recommendation,
	loadRecommendations,
	getRecommend,
} from "./recommend_service";
import { Follow, loadFollows, getFollows } from "./follow_service";
import { HotList, loadHotList } from "./hot_lists_service";
import { htmlToMd } from "./html_to_markdown";
import { addFrontmatter } from "./frontmatter";

export class ZhihuSlidesView extends View {
	private recommendations: Recommendation[] = [];
	private follows: Follow[] = [];
	private hotLists: HotList[] = [];
	private nextRecommendUrl = `https://www.zhihu.com/api/v3/feed/topstory/recommend?action=down&ad_interval=-10&desktop=true&page_number=7`;
	private nextFollowUrl = `https://www.zhihu.com/api/v3/moments?limit=10&desktop=true`;

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
		return "Zhihu Sildes";
	}

	getIcon(): string {
		return "star";
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
		recom_details.addClass("silde-collapsible");
		const recom_summary = recom_details.createEl("summary", {
			text: "recommend",
		});
		recom_summary.addClass("silde-summary");

		const recom_refresh_button = recom_summary.createEl("button", {
			text: "刷新",
		});
		recom_refresh_button.addClass("silde-refresh-button");
		recom_refresh_button.onClickEvent(() => this.refreshRecommendations());

		const recom_list_container = recom_details.createEl("div");
		recom_list_container.addClass("silde-list-container");

		const recom_list = recom_list_container.createEl("ul");
		await this.refreshRecommendations(recom_list); // 初始加载推荐

		// follows
		const follow_details = container.createEl("details");
		follow_details.addClass("silde-collapsible");
		const follow_summary = follow_details.createEl("summary", {
			text: "follows",
		});
		follow_summary.addClass("silde-summary");

		const follow_refresh_button = follow_summary.createEl("button", {
			text: "刷新",
		});
		follow_refresh_button.addClass("silde-refresh-button");
		follow_refresh_button.onClickEvent(() => this.refreshFollows());

		const follow_list_container = follow_details.createEl("div");
		follow_list_container.addClass("silde-list-container");

		const follow_list = follow_list_container.createEl("ul");
		await this.refreshFollows(follow_list); // 初始加载关注

		// hot lists
		const hotlist_details = container.createEl("details");
		hotlist_details.addClass("silde-collapsible");
		const hotlist_summary = hotlist_details.createEl("summary", {
			text: "Hot lists",
		});
		hotlist_summary.addClass("silde-summary");

		const hotlist_container = hotlist_details.createEl("div");
		hotlist_container.addClass("silde-list-container");

		const hotlist = hotlist_container.createEl("ul");
		new Notice("正在加载热榜...");
		this.hotLists = await loadHotList(this.vault);
		this.hotLists.forEach((hot) => {
			const item = hotlist.createEl("li");
			item.addClass("silde-item");

			const title = item.createEl("h4", { text: hot.title });
			title.addClass("silde-title");

			const excerpt = item.createEl("p", {
				text: `${hot.detail_text}: ${hot.excerpt}`,
			});
			excerpt.addClass("silde-excerpt");
		});
	}

	private async refreshRecommendations(recom_list?: HTMLElement) {
		const list =
			recom_list ||
			(this.containerEl.querySelector(
				".zhihu-slides-view .silde-list-container ul",
			) as HTMLElement);
		list.empty();
		new Notice("正在加载推荐...");
		const response = await getRecommend(this.vault, this.nextRecommendUrl);
		this.recommendations = loadRecommendations(response);
		this.nextRecommendUrl = response.paging.next;
		this.recommendations.forEach((recommendation) => {
			const item = list.createEl("li");
			item.addClass("silde-item");

			const title = item.createEl("h4", { text: recommendation.title });
			title.addClass("silde-title");

			const excerpt = item.createEl("p", {
				text: recommendation.excerpt,
			});
			excerpt.addClass("silde-excerpt");

			item.onClickEvent(() =>
				this.openContent(
					recommendation.title,
					recommendation.authorName,
					recommendation.url,
					recommendation.content,
					recommendation.type,
				),
			);
		});
	}

	private async refreshFollows(follow_list?: HTMLElement) {
		const list =
			follow_list ||
			(this.containerEl.querySelectorAll(
				".zhihu-slides-view .silde-list-container ul",
			)[1] as HTMLElement);
		list.empty();
		new Notice("正在加载关注...");
		const response = await getFollows(this.vault, this.nextFollowUrl);
		this.follows = loadFollows(response); // 注意这里使用 loadFollows 而非 loadRecommendations
		this.nextFollowUrl = response.paging.next;
		this.follows.forEach((follow) => {
			const item = list.createEl("li");
			item.addClass("silde-item");

			const title = item.createEl("h4", { text: follow.title });
			title.addClass("silde-title");

			const excerpt = item.createEl("p", {
				text: `${follow.action_text}: ${follow.excerpt}`,
			});
			excerpt.addClass("silde-excerpt");

			item.onClickEvent(() =>
				this.openContent(
					follow.title,
					follow.authorName,
					follow.url,
					follow.content,
					follow.type,
				),
			);
		});
	}

	async openContent(
		title: string,
		authorName: string,
		url: string,
		content: string,
		type: string,
	) {
		const typeStr = type === "article" ? "文章" : "回答";
		const filePath = removeSpecialChars(
			`${title}-${authorName}的${typeStr}.md`,
		);

		let file = this.vault.getAbstractFileByPath(filePath);
		console.log(content);
		let markdown = htmlToMd(content);
		markdown = addFrontmatter(markdown, "link", url);
		if (!file) {
			file = await this.vault.create(filePath, markdown);
		}

		const leaf = this.app.workspace.getLeaf();
		await leaf.openFile(file as any);
	}
}

function removeSpecialChars(input: string): string {
	return input.replace(/[/\\[\]|#^]/g, "");
}
