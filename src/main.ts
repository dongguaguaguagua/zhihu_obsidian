import {
    App,
    Editor,
    MarkdownView,
    Plugin,
    type PluginManifest,
    Notice,
    Platform,
} from "obsidian";

import { MentionSuggest } from "./member_mention";
import * as login from "./login_service";
import * as publish from "./publish_service";
import * as side from "./sides_view";
import * as answer from "./answer_service";
import { ZhihuSettingTab } from "./settings_tab";
import { loadIcons } from "./icon";
import { loadSettings } from "./settings";
import * as open from "./open_service";
import i18n, { type Lang } from "../locales";
import { registerMenuCommands } from "./menu";
import { ViewPlugin, ViewUpdate, EditorView } from "@codemirror/view";

export default class ZhihuObPlugin extends Plugin {
    i18n: Lang;
    public lastCursorPos: number | null = null; // 记录上一次光标的位置

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
        this.i18n = i18n.current;
    }

    async onload() {
        const settings = await loadSettings(this.app.vault);

        // 注册 EditorViewPlugin 来跟踪光标位置 (lastCursorPos)
        // 这是 CodeMirror 6 中跟踪状态（如光标位置）的标准方式
        this.registerEditorExtension([
            open.pluginField.init(() => this),
            ViewPlugin.fromClass(open.CursorPosTrace),
        ]);

        if (settings.autoOpenZhihuLink) {
            this.registerDomEvent(
                document,
                "click",
                (e) => {
                    open.clickInReadMode(this.app, e); // 在阅读模式下自动打开链接
                    open.clickInPreview(this, e); // 在Live Preview模式下自动打开链接
                },
                true,
            );
        }

        if (settings.restrictToZhihuFM) {
            this.registerEditorSuggest(new MentionSuggest(this.app));
        }
        registerMenuCommands(this); // 监听右键菜单和文件菜单事件
        const loginNoticeStr = this.i18n.notice.notLogin;
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
            id: "open-content",
            name: "Open link",
            callback: async () => {
                if (await login.checkIsUserLogin(this.app.vault)) {
                    new open.ZhihuInputLinkModal(this.app).open();
                } else {
                    new Notice(loginNoticeStr);
                }
            },
        });
        // 在移动端设备上不能直接登录,
        // 可以使用自定义cookie或者iCloud云同步登录
        if (!Platform.isMobile) {
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
                id: "refresh-cookie",
                name: "Refresh ZSE cookie",
                callback: async () => {
                    await login.zhihuRefreshZseCookies(this.app);
                },
            });
        }

        this.addCommand({
            id: "publish-current-article",
            name: "Publish current article",
            editorCallback: async (editor: Editor, view: MarkdownView) => {
                if (await login.checkIsUserLogin(this.app.vault)) {
                    await publish.publishCurrentArticle(this.app);
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

        this.addCommand({
            id: "convert-to-new-article",
            name: "Convert to new article",
            callback: async () => {
                if (await login.checkIsUserLogin(this.app.vault)) {
                    await publish.convertToNewZhihuArticle(this.app);
                } else {
                    new Notice(loginNoticeStr);
                }
            },
        });
        this.addCommand({
            id: "convert-to-new-answer",
            name: "Convert to new answer",
            callback: async () => {
                if (await login.checkIsUserLogin(this.app.vault)) {
                    new answer.ZhihuQuestionLinkModal(
                        this.app,
                        async (questionLink) => {
                            await answer.convertToNewZhihuAnswer(
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

        // Register the settings tab
        this.addSettingTab(new ZhihuSettingTab(this.app, this));
    }

    onunload() {
        // Avoid detaching leaves in onunload
        // https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Don't+detach+leaves+in+%60onunload%60
        // this.app.workspace.detachLeavesOfType(SIDES_VIEW_TYPE);
    }
}
