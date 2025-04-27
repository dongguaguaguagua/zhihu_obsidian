import { App, PluginSettingTab, Setting } from "obsidian";
import ZhihuObPlugin from "./main";
import { loadSettings, saveSettings } from "./settings";
import * as login from "./login_service";
import { loadData, updateData, deleteData } from "./data";

export class ZhihuSettingTab extends PluginSettingTab {
  plugin: ZhihuObPlugin;
  isLoggedIn: boolean = false;
  userInfo: { avatar_url: string; name: string; headline?: string } | null = null;

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
      .setName("My Account")
      .setDesc("Manage your Zhihu login status")
      .then((setting) => {
        if (this.isLoggedIn && this.userInfo) {
          const userInfoContainer = setting.nameEl.createDiv({
            cls: "zhihu-user-info",
          });

          userInfoContainer.createEl("img", {
            cls: "zhihu-avatar",
            attr: { src: this.userInfo.avatar_url, width: "40", height: "40" },
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
                  await deleteData(this.app.vault, "userInfo");
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
      .setName("User Agent")
      .setDesc("Custom User Agent for Zhihu API requests")
      .addText((text) =>
        text
          .setPlaceholder("Enter User Agent")
          .setValue(settings.user_agent)
          .onChange(async (value) => {
            try {
              await saveSettings(this.app.vault, { user_agent: value });
            } catch (e) {
              console.error("Failed to save User Agent:", e);
            }
          }),
      );
  }
}
