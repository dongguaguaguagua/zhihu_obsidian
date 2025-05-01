import { Editor, MarkdownView, Plugin, WorkspaceLeaf, Notice } from "obsidian";

import { MentionSuggest } from "./member_mention";
import * as login from "./login_service";
import * as publish from "./publish_service";
import { ZhihuSlidesView } from "./sildes_view";
import * as answer from "./answer_service";
import { ZhihuSettingTab } from "./settings_tab";
import { loadIcons } from "./icon";
import { loadSettings } from "./settings";
const SLIDES_VIEW_TYPE = "zhihu-slides-view";

export default class ZhihuObPlugin extends Plugin {
	async onload() {
		const settings = await loadSettings(this.app.vault);
		this.registerEditorSuggest(
			new MentionSuggest(this.app, settings.restrictToZhihuTag),
		);
		await login.checkIsUserLogin(this.app.vault);

		loadIcons();
		const zhihuIconEL = this.addRibbonIcon(
			"zhihu-icon",
			"Open Zhihu Sildes",
			() => {
				this.activateView();
			},
		);
		this.registerView(
			SLIDES_VIEW_TYPE,
			(leaf) => new ZhihuSlidesView(leaf, this.app.vault),
		);

		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status Bar Text");

		this.addCommand({
			id: "zhihu-qrcode-login",
			name: "Zhihu QRCode Login",
			callback: async () => {
				await login.zhihuQRcodeLogin(this.app);
			},
		});

		this.addCommand({
			id: "zhihu-publish-current-file",
			name: "Zhihu Publish Current FIle",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await publish.publishCurrentFile(this.app);
			},
		});

		this.addCommand({
			id: "create-new-zhihu-article",
			name: "Create New Zhihu Article",
			callback: async () => {
				await publish.createNewZhihuArticle(this.app);
			},
		});

		this.addCommand({
			id: "create-new-zhihu-answer",
			name: "Create New Zhihu Answer",
			callback: () => {
				new answer.ZhihuQuestionLinkModal(
					this.app,
					async (questionLink) => {
						await answer.createNewZhihuAnswer(
							this.app,
							questionLink,
						);
					},
				).open();
			},
		});

		this.addCommand({
			id: "zhihu-publish-current-answer",
			name: "Zhihu Publish Current Answer",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await answer.publishCurrentAnswer(this.app);
			},
		});

		// Register the settings tab
		this.addSettingTab(new ZhihuSettingTab(this.app, this));
	}

	async activateView() {
		const { workspace } = this.app;
		workspace.detachLeavesOfType(SLIDES_VIEW_TYPE);
		let leaf: WorkspaceLeaf | null = workspace.getLeftLeaf(false);

		if (!leaf) {
			leaf = workspace.getLeaf(true);
		}

		if (leaf) {
			await leaf.setViewState({
				type: SLIDES_VIEW_TYPE,
				active: true,
			});
			workspace.revealLeaf(leaf);
		} else {
			new Notice(
				"Failed to open Zhihu Sildes: Unable to create a sidebar leaf.",
			);
			console.error("No leaf available for Zhihu Sildes view");
		}
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(SLIDES_VIEW_TYPE);
	}
}
