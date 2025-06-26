import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import ZhihuObPlugin from "./main";
import { loadSettings, saveSettings } from "./settings";
import * as login from "./login_service";
import { loadData, deleteData } from "./data";
import i18n, { type Lang } from "../locales";
import { basicSetup } from "./ui/snippets_editor/extensions";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export class ZhihuSettingTab extends PluginSettingTab {
    plugin: ZhihuObPlugin;
    isLoggedIn = false;
    i18n: Lang;
    snippetsEditor: EditorView;
    snippetsFileLocEl: HTMLElement;
    snippetVariablesFileLocEl: HTMLElement;

    hide() {
        this.snippetsEditor?.destroy();
    }

    userInfo: { avatar_url: string; name: string; headline?: string } | null =
        null;

    constructor(app: App, plugin: ZhihuObPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.i18n = i18n.current;
    }

    async display(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();

        // Check login status
        this.isLoggedIn = await login.checkIsUserLogin(this.app.vault);
        if (this.isLoggedIn) {
            const data = await loadData(this.app.vault);
            this.userInfo = data?.userInfo
                ? {
                      avatar_url: data.userInfo.avatar_url,
                      name: data.userInfo.name,
                      headline: data.userInfo.headline,
                  }
                : null;
        } else {
            this.userInfo = null;
        }

        // User login status and info
        new Setting(containerEl)
            .setName(this.i18n.settings.accountTitle)
            .setDesc(this.i18n.settings.accountTitleDesc)
            .then((setting) => {
                if (this.isLoggedIn && this.userInfo) {
                    const userInfoContainer = setting.nameEl.createDiv({
                        cls: "zhihu-user-info",
                    });

                    userInfoContainer.createEl("img", {
                        cls: "zhihu-avatar",
                        attr: {
                            src: this.userInfo.avatar_url,
                            width: "40",
                            height: "40",
                        },
                    });

                    const textContainer = userInfoContainer.createDiv({
                        cls: "zhihu-text-container",
                    });

                    textContainer.createEl("div", {
                        text: this.userInfo.name,
                        cls: "zhihu-username",
                    });

                    if (this.userInfo.headline) {
                        textContainer.createEl("div", {
                            text: this.userInfo.headline,
                            cls: "zhihu-headline",
                        });
                    }

                    // Log out button
                    setting.addButton((button) =>
                        button
                            .setButtonText(this.i18n.settings.logoutButtonText)
                            .setWarning()
                            .onClick(async () => {
                                try {
                                    // Clear userInfo from zhihu-data.json
                                    await deleteData(
                                        this.app.vault,
                                        "userInfo",
                                    );
                                    this.isLoggedIn = false;
                                    this.userInfo = null;
                                    this.display();
                                } catch (e) {
                                    console.error(
                                        this.i18n.error.logoutFailed,
                                        e,
                                    );
                                }
                            }),
                    );
                } else {
                    // Log in button
                    setting.addButton((button) =>
                        button
                            .setButtonText(this.i18n.settings.loginButtonText)
                            .setCta()
                            .onClick(async () => {
                                try {
                                    await login.zhihuQRcodeLogin(this.app);
                                    this.isLoggedIn =
                                        await login.checkIsUserLogin(
                                            this.app.vault,
                                        );
                                    if (this.isLoggedIn) {
                                        const data = await loadData(
                                            this.app.vault,
                                        );
                                        this.userInfo = data?.userInfo
                                            ? {
                                                  avatar_url:
                                                      data.userInfo.avatar_url,
                                                  name: data.userInfo.name,
                                                  headline:
                                                      data.userInfo.headline,
                                              }
                                            : null;
                                    }
                                    this.display();
                                } catch (e) {
                                    console.error(
                                        this.i18n.error.loginFailed,
                                        e,
                                    );
                                }
                            }),
                    );
                }
            });

        // User Agent setting
        const settings = await loadSettings(this.app.vault);
        new Setting(containerEl)
            .setName(this.i18n.settings.userAgent)
            .setDesc(this.i18n.settings.userAgentDesc)
            .addText((text) =>
                text
                    .setPlaceholder(this.i18n.settings.userAgentPlaceholder)
                    .setValue(settings.user_agent)
                    .onChange(async (value) => {
                        try {
                            await saveSettings(this.app.vault, {
                                user_agent: value,
                            });
                        } catch (e) {
                            console.error(
                                this.i18n.error.saveUserAgentFailed,
                                e,
                            );
                        }
                    }),
            );

        // Restrict @知友 to notes with zhihu tag
        new Setting(containerEl)
            .setName(this.i18n.settings.restrictAt)
            .setDesc(this.i18n.settings.restrictAtDesc)
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.restrictToZhihuFM)
                    .onChange(async (value) => {
                        try {
                            await saveSettings(this.app.vault, {
                                restrictToZhihuFM: value,
                            });
                        } catch (e) {
                            console.error(
                                this.i18n.error.saveRestrictAtFailed,
                                e,
                            );
                        }
                    }),
            );

        // Clear Image Cahce in `data.cache`
        new Setting(containerEl)
            .setName(this.i18n.settings.clearImageCache)
            .setDesc(this.i18n.settings.clearImageCacheDesc)
            .then((setting) => {
                // Log out button
                setting.addButton((button) =>
                    button
                        .setButtonText(
                            this.i18n.settings.clearImageCacheButtonText,
                        )
                        .onClick(async () => {
                            try {
                                await deleteData(this.app.vault, "cache");
                                new Notice(this.i18n.notice.imageCacheCleared);
                            } catch (e) {
                                console.error(
                                    this.i18n.error.clearImageCacheFailed,
                                    e,
                                );
                            }
                        }),
                );
            });

        // If send read to Zhihu
        new Setting(containerEl)
            .setName(this.i18n.settings.sendRead)
            .setDesc(this.i18n.settings.sendReadDesc)
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.sendReadToZhihu)
                    .onChange(async (value) => {
                        try {
                            await saveSettings(this.app.vault, {
                                sendReadToZhihu: value,
                            });
                        } catch (e) {
                            console.error(
                                this.i18n.error.saveSendZhihuFailed,
                                e,
                            );
                        }
                    }),
            );
        // Setting to enable Zhihu level headings
        new Setting(containerEl)
            .setName(this.i18n.settings.zhihuHeading)
            .setDesc(this.i18n.settings.zhihuHeadingDesc)
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.useZhihuHeadings)
                    .onChange(async (value) => {
                        try {
                            await saveSettings(this.app.vault, {
                                useZhihuHeadings: value,
                            });
                        } catch (e) {
                            console.error(
                                this.i18n.error.saveUseZhihuHeadingFailed,
                                e,
                            );
                        }
                    }),
            );
        // setting to control if set default img name as img base name
        // if img caption is not provided
        new Setting(containerEl)
            .setName(this.i18n.settings.useImgNameDefault)
            .setDesc(this.i18n.settings.useImgNameDefaultDesc)
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.useImgNameDefault)
                    .onChange(async (value) => {
                        try {
                            await saveSettings(this.app.vault, {
                                useImgNameDefault: value,
                            });
                        } catch (e) {
                            console.error(
                                this.i18n.error.saveUseImgNameFailed,
                                e,
                            );
                        }
                    }),
            );
        // // Recommend Count setting
        // new Setting(containerEl)
        // 	.setName("Recommendation Count")
        // 	.setDesc(
        // 		"Number of recommended items to fetch from Zhihu API (5-12)",
        // 	)
        // 	.addSlider((slider) =>
        // 		slider
        // 			.setLimits(5, 12, 1)
        // 			.setValue(settings.recommendCount)
        // 			.setDynamicTooltip()
        // 			.onChange(async (value) => {
        // 				try {
        // 					await saveSettings(this.app.vault, {
        // 						recommendCount: value,
        // 					});
        // 				} catch (e) {
        // 					console.error(
        // 						"Failed to save recommendCount setting:",
        // 						e,
        // 					);
        // 				}
        // 			}),
        // 	);

        // 添加“手动编辑Cookies”开关
        new Setting(containerEl)
            .setName("手动编辑Cookies")
            .setDesc("启用后可手动编辑zhihu-data.json中的cookies内容")
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.manualCookieEdit)
                    .onChange(async (value) => {
                        try {
                            await saveSettings(this.app.vault, {
                                manualCookieEdit: value,
                            });
                            snippetsSetting.settingEl.toggleClass(
                                "snippets-text-area",
                                value === true,
                            );
                            snippetsSetting.settingEl.toggleClass(
                                "hidden",
                                value !== true,
                            );
                        } catch (e) {
                            console.error("保存设置失败", e);
                        }
                    }),
            );

        const snippetsSetting = new Setting(containerEl)
            .setName("Snippets")
            .setDesc(
                'Enter snippets here. Remember to add a comma after each snippet, and escape all backslashes with an extra \\. Lines starting with "//" will be treated as comments and ignored.',
            )
            .setClass("snippets-text-area");

        const data = await loadData(this.app.vault);
        this.createSnippetsEditor(snippetsSetting, data);
    }

    async createSnippetsEditor(snippetsSetting: Setting, data: any) {
        const customCSSWrapper = snippetsSetting.controlEl.createDiv(
            "snippets-editor-wrapper",
        );

        // const extensions = basicSetup;

        // const change = EditorView.updateListener.of(async (v: ViewUpdate) => {
        //     if (v.docChanged) {
        //         const snippets = v.state.doc.toString();
        //         let success = true;
        //         console.log("doc changed");
        //         // let snippetVariables;
        //         // try {
        //         //     snippetVariables = await parseSnippetVariables(
        //         //         this.plugin.settings.snippetVariables,
        //         //     );
        //         //     await parseSnippets(snippets, snippetVariables);
        //         // } catch (e) {
        //         //     success = false;
        //         // }

        //         // updateValidityIndicator(success);

        //         // if (!success) return;

        //         // this.plugin.settings.snippets = snippets;
        //         // await this.plugin.saveSettings();
        //     }
        // });

        // extensions.push(change);
        // const basicSetup: Extension[] = [
        //     lineNumbers(),
        //     highlightSpecialChars(),
        //     json(),
        // ];
        const extensions = basicSetup;
        this.snippetsEditor = new EditorView({
            state: EditorState.create({
                doc: `{}`,
                extensions,
            }),
        });

        customCSSWrapper.appendChild(this.snippetsEditor.dom);
    }
}
