import { Editor, MarkdownView, Plugin, WorkspaceLeaf, Notice } from "obsidian";

import { MentionSuggest } from "./member_mention";
import * as login from "./login_service";
import * as publish from "./publish_service";
import { ZhihuSlidesView } from "./sides_view";
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

		loadIcons();
		this.addRibbonIcon("zhihu-icon", "Open Zhihu side view", async () => {
			if (await login.checkIsUserLogin(this.app.vault)) {
				this.activateView();
			} else {
				new Notice("您还未登录知乎，请先登录");
			}
		});
		this.registerView(
			SLIDES_VIEW_TYPE,
			(leaf) => new ZhihuSlidesView(leaf, this.app.vault),
		);

		this.addCommand({
			id: "qrcode-login",
			name: "QRCode login",
			callback: async () => {
				await login.zhihuQRcodeLogin(this.app);
			},
		});

        this.addCommand({
            id: "web-login",
            name: "Web login",
            callback: async () => {
                await login.zhihuWebLogin(this.app);
            },
        });

		this.addCommand({
			id: "publish-current-file",
			name: "Publish current file",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (await login.checkIsUserLogin(this.app.vault)) {
					await publish.publishCurrentFile(this.app);
				} else {
					new Notice("您还未登录知乎，请先登录");
				}
			},
		});

		this.addCommand({
			id: "create-new-article",
			name: "Create new article",
			callback: async () => {
				if (await login.checkIsUserLogin(this.app.vault)) {
					await publish.createNewZhihuArticle(this.app);
				} else {
					new Notice("您还未登录知乎，请先登录");
				}
			},
		});

		this.addCommand({
			id: "create-new-answer",
			name: "Create new answer",
			callback: async () => {
				if (await login.checkIsUserLogin(this.app.vault)) {
					new answer.ZhihuQuestionLinkModal(
						this.app,
						async (questionLink) => {
							await answer.createNewZhihuAnswer(
								this.app,
								questionLink,
							);
						},
					).open();
				} else {
					new Notice("您还未登录知乎，请先登录");
				}
			},
		});

		this.addCommand({
			id: "publish-current-answer",
			name: "Publish current answer",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (await login.checkIsUserLogin(this.app.vault)) {
					await answer.publishCurrentAnswer(this.app);
				} else {
					new Notice("您还未登录知乎，请先登录");
				}
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
				"Failed to open Zhihu sides: unable to create a sidebar leaf.",
			);
			console.error("No leaf available for Zhihu sides view");
		}
	}

	onunload() {
		// Avoid detaching leaves in onunload
		// https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Don't+detach+leaves+in+%60onunload%60
		// this.app.workspace.detachLeavesOfType(SLIDES_VIEW_TYPE);
	}
}
