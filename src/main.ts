import {
	App,
	Editor,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	Notice,
} from "obsidian";

import { MentionSuggest } from "./member_mention";

import * as dataUtil from "./data";
import * as login from "./login_service";
import * as publish from "./publish_service";
import { ZhihuSlidesView } from "./sildes_view";

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: "default",
};

const SLIDES_VIEW_TYPE = "zhihu-slides-view";

export default class ZhihuObPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();
		this.registerEditorSuggest(new MentionSuggest(this.app));
		await login.checkIsUserLogin(this.app.vault);

		this.addRibbonIcon("star", "Open Zhihu Sildes", () => {
			this.activateView();
		});
		this.registerView(
			SLIDES_VIEW_TYPE,
			(leaf) => new ZhihuSlidesView(leaf, this.app.vault),
		);

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
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

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			console.log("click", evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(
			window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000),
		);
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

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await dataUtil.loadData(this.app.vault),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(SLIDES_VIEW_TYPE);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: ZhihuObPlugin;

	constructor(app: App, plugin: ZhihuObPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
