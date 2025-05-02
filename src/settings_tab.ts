import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import ZhihuObPlugin from "./main";
import { loadSettings, saveSettings } from "./settings";
import * as login from "./login_service";
import { loadData, deleteData } from "./data";

export class ZhihuSettingTab extends PluginSettingTab {
	plugin: ZhihuObPlugin;
	isLoggedIn = false;

	userInfo: { avatar_url: string; name: string; headline?: string } | null =
		null;

	constructor(app: App, plugin: ZhihuObPlugin) {
		super(app, plugin);
		this.plugin = plugin;
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
			.setName("My account")
			.setDesc("Manage your Zhihu login status")
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
							.setButtonText("Log out")
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
									console.error("Failed to log out:", e);
								}
							}),
					);
				} else {
					// Log in button
					setting.addButton((button) =>
						button
							.setButtonText("Log in")
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
														data.userInfo
															.avatar_url,
													name: data.userInfo.name,
													headline:
														data.userInfo.headline,
												}
											: null;
									}
									this.display();
								} catch (e) {
									console.error("Failed to log in:", e);
								}
							}),
					);
				}
			});

		// User Agent setting
		const settings = await loadSettings(this.app.vault);
		new Setting(containerEl)
			.setName("User agent")
			.setDesc("Custom user agent for Zhihu API requests")
			.addText((text) =>
				text
					.setPlaceholder("Enter user agent")
					.setValue(settings.user_agent)
					.onChange(async (value) => {
						try {
							await saveSettings(this.app.vault, {
								user_agent: value,
							});
						} catch (e) {
							console.error("Failed to save user agent:", e);
						}
					}),
			);

		// Restrict @知友 to notes with zhihu tag
		new Setting(containerEl)
			.setName("Restrict @Zhihuers to Zhihu-tagged notes")
			.setDesc(
				"Enable @Zhihuers functionality only for notes with a 'zhihu' tag in frontmatter. (Need to reload plugin once changed)",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(settings.restrictToZhihuTag)
					.onChange(async (value) => {
						try {
							await saveSettings(this.app.vault, {
								restrictToZhihuTag: value,
							});
						} catch (e) {
							console.error(
								"Failed to save restrictToZhihuTag setting:",
								e,
							);
						}
					}),
			);

		// Clear Image Cahce in `data.cache`
		new Setting(containerEl)
			.setName("Clear image cache")
			.setDesc(
				"With image cache, you can reduce access requency to the Zhihu API",
			)
			.then((setting) => {
				// Log out button
				setting.addButton((button) =>
					button.setButtonText("Clear").onClick(async () => {
						try {
							await deleteData(this.app.vault, "cache");
							new Notice("Image cache cleared!");
						} catch (e) {
							console.error("Failed to clear image cache", e);
						}
					}),
				);
			});

		// If send read to Zhihu
		new Setting(containerEl)
			.setName("Send read to Zhihu")
			.setDesc(
				"Send read information to Zhihu when you click the slide view articles or answers",
			)
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
								"Failed to save sendReadToZhihu setting:",
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
	}
}
