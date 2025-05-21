import { Editor, MarkdownView, Plugin, Notice } from "obsidian";

import { MentionSuggest } from "./member_mention";
import * as login from "./login_service";
import * as publish from "./publish_service";
import * as side from "./sides_view";
import * as answer from "./answer_service";
import { ZhihuSettingTab } from "./settings_tab";
import { loadIcons } from "./icon";
import { loadSettings } from "./settings";
import { handleAnswerClick } from "./view_answer";

export default class ZhihuObPlugin extends Plugin {
    async onload() {
        const settings = await loadSettings(this.app.vault);
        this.registerDomEvent(document, 'click', handleAnswerClick.bind(this, this.app.vault));
        this.registerEditorSuggest(
            new MentionSuggest(this.app, settings.restrictToZhihuTag),
        );

        const loginNoticeStr = "您还未登录知乎，请先登录";
		loadIcons();
		this.addRibbonIcon("zhihu-icon", "Open Zhihu side view", async () => {
			if (await login.checkIsUserLogin(this.app.vault)) {
				side.activateSideView();
			} else {
				new Notice(loginNoticeStr);
			}
		});
		this.registerView(
			side.SIDES_VIEW_TYPE,
			(leaf) => new side.ZhihuSideView(leaf, this.app.vault),
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
					new Notice(loginNoticeStr);
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
					new Notice(loginNoticeStr);
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
					new Notice(loginNoticeStr);
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
					new Notice(loginNoticeStr);
				}
			},
		});

        // Register the settings tab
        this.addSettingTab(new ZhihuSettingTab(this.app, this));
    }

    onunload() {
        // Avoid detaching leaves in onunload
        // https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Don't+detach+leaves+in+%60onunload%60
        // this.app.workspace.detachLeavesOfType(SIDES_VIEW_TYPE);
    }
}
