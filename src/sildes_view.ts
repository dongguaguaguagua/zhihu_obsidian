import { Vault, Notice, View, WorkspaceLeaf } from "obsidian";
import { Recommendation, loadRecommendations } from "./recommend_service";
import { Follow, loadFollows } from "./follow_service";
import { HotList, loadHotList } from "./hot_lists_service";
import { htmlToMd } from "./html_to_markdown";

export class ZhihuSlidesView extends View {
	private recommendations: Recommendation[] = [];
	private follows: Follow[] = [];
	private hotLists: HotList[] = [];

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

		const recom_list_container = recom_details.createEl("div");
		recom_list_container.addClass("silde-list-container");

		const recom_list = recom_list_container.createEl("ul");
		new Notice("正在加载推荐...");
		this.recommendations = await loadRecommendations(this.vault);
		this.recommendations.forEach((recommendation) => {
			const item = recom_list.createEl("li");
			item.addClass("silde-item");

			const title = item.createEl("h4", { text: recommendation.title });
			title.addClass("silde-title");

			const excerpt = item.createEl("p", {
				text: recommendation.excerpt,
			});
			excerpt.addClass("silde-excerpt");

			item.onClickEvent(() =>
				this.openContent(recommendation.id, recommendation.content),
			);
		});

		// follows
		const follow_details = container.createEl("details");
		follow_details.addClass("silde-collapsible");
		const follow_summary = follow_details.createEl("summary", {
			text: "follows",
		});
		follow_summary.addClass("silde-summary");

		const follow_list_container = follow_details.createEl("div");
		follow_list_container.addClass("silde-list-container");

		const follow_list = follow_list_container.createEl("ul");
		new Notice("正在加载关注...");
		this.follows = await loadFollows(this.vault);
		this.follows.forEach((follow) => {
			const item = follow_list.createEl("li");
			item.addClass("silde-item");

			const title = item.createEl("h4", { text: follow.title });
			title.addClass("silde-title");

			const excerpt = item.createEl("p", {
				text: `${follow.action_text}: ${follow.excerpt}`,
			});
			excerpt.addClass("silde-excerpt");

			item.onClickEvent(() =>
				this.openContent(follow.id, follow.content),
			);
		});

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
		console.log(this.hotLists);
		this.hotLists.forEach((hot) => {
			const item = hotlist.createEl("li");
			item.addClass("silde-item");

			const title = item.createEl("h4", { text: hot.title });
			title.addClass("silde-title");

			const excerpt = item.createEl("p", {
				text: `${hot.detail_text}: ${hot.excerpt}`,
			});
			excerpt.addClass("silde-excerpt");

			// item.onClickEvent(() =>
			// 	this.openContent(hot.id, hot.content),
			// );
		});
	}

	async openContent(id: string, content: string) {
		const filePath = `Zhihu_${id}.md`;
		let file = this.vault.getAbstractFileByPath(filePath);
		console.log(content);
		const markdown = htmlToMd(content);

		if (!file) {
			file = await this.vault.create(filePath, markdown);
		}

		const leaf = this.app.workspace.getLeaf();
		await leaf.openFile(file as any);
	}
}
