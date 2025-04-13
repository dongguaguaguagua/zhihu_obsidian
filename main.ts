import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import QRCode from 'qrcode';

class QRCodeModal extends Modal {
  private link: string;

  constructor(app: any, link: string) {
    super(app);
    this.link = link;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: '知乎登录二维码' });

    const canvas = contentEl.createEl('canvas');

    try {
      await QRCode.toCanvas(canvas, this.link, {
        width: 256,
        margin: 2
      });
    } catch (err) {
      contentEl.createEl('p', { text: '生成二维码失败：' + err });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

interface MyPluginSettings {
    mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default'
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();
        await this.initZapCookies();
        await this.initUdidCookies();
        // This creates an icon in the left ribbon.
        this.addRibbonIcon('dice', '生成知乎二维码登录', async () => {
        });

        // Perform additional things with the ribbon
        // ribbonIconEl.addClass('my-plugin-ribbon-class');

        // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText('Status Bar Text');

        this.addCommand({
          id: 'zhihu-login-qrcode',
          name: 'Zhihu login',
          editorCallback: async (editor: Editor, view: MarkdownView) => {
            const loginLink = await this.getLoginLink();
            const modal = new QRCodeModal(this.app, loginLink);
            modal.open();
        }
        });

        // This adds a simple command that can be triggered anywhere
        this.addCommand({
            id: 'open-sample-modal-simple',
            name: 'Open sample modal (simple)',
            callback: () => {
                new SampleModal(this.app).open();
            }
        });
        // This adds an editor command that can perform some operation on the current editor instance
        this.addCommand({
            id: 'sample-editor-command',
            name: 'Sample editor command',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                console.log(editor.getSelection());
                editor.replaceSelection('Sample Editor Command');
            }
        });
        // This adds a complex command that can check whether the current state of the app allows execution of the command
        this.addCommand({
            id: 'open-sample-modal-complex',
            name: 'Open sample modal (complex)',
            checkCallback: (checking: boolean) => {
                // Conditions to check
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    // If checking is true, we're simply "checking" if the command can be run.
                    // If checking is false, then we want to actually perform the operation.
                    if (!checking) {
                        new SampleModal(this.app).open();
                    }

                    // This command will only show up in Command Palette when the check function returns true
                    return true;
                }
            }
        });

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new SampleSettingTab(this.app, this));

        // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
        // Using this function will automatically remove the event listener when this plugin is disabled.
        this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
            console.log('click', evt);
        });

        // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
        this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
    }

    async initZapCookies() {
        try {
            const response = await requestUrl({
                url: "https://www.zhihu.com",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'DNT': '1',
                    'Sec-GPC': '1',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Priority': 'u=0, i'
                },
                method: "GET",
            });
            let cookies: string[];
            const rawCookies = response.headers['set-cookie'];
            if (Array.isArray(rawCookies)) {
                cookies = rawCookies;
            } else {
                cookies = [rawCookies];
            }
            cookies = cookies.map(cookie => {
                const match = cookie.match(/^[^;]+;/);
                return match ? match[0] : '';
            });
            new Notice('获取初始cookies成功')
            await this.saveData({ cookies: cookies });
        } catch (error) {
            new Notice(`获取初始cookies失败：${error}`)
        }
    }

    async initUdidCookies() {
        try {
            const data = await this.loadData();
            const cookies = data?.cookies
            const cookiesHeader = cookies?.join(' ') ?? '';
            console.log(cookiesHeader)
            const response = await requestUrl({
                url: "https://www.zhihu.com/udid",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'Referer': 'https://www.zhihu.com/signin?next=%2F',
                    'Origin': 'https://www.zhihu.com',
                    'DNT': '1',
                    'Sec-GPC': '1',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'Priority': 'u=4',
                    'Cookie': cookiesHeader
                },
                method: "POST",
            });
            let udid_cookie: string[];
            const udid = response.headers['set-cookie']
            if (Array.isArray(udid)) {
                udid_cookie = udid;
            } else {
                udid_cookie = [udid];
            }
            udid_cookie = udid_cookie.map(cookie => {
                const match = cookie.match(/^[^;]+;/);
                return match ? match[0] : '';
            });
            console.log(udid_cookie)
            cookies.push(udid_cookie[0])
            new Notice('获取UDID成功')
            await this.saveData({ cookies: cookies });
        } catch (error) {
            new Notice(`获取UDID失败：${error}`)
        }
    }

    async getLoginLink() {
        try {
            const data = await this.loadData();
            const cookies = data?.cookies
            const cookiesHeader = cookies?.join(' ') ?? '';
            const response = await requestUrl({
                url: "https://www.zhihu.com/api/v3/account/api/login/qrcode",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'Referer': 'https://www.zhihu.com/signin?next=%2F',
                    'Origin': 'https://www.zhihu.com',
                    'DNT': '1',
                    'Sec-GPC': '1',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'Priority': 'u=4',
                    'Cookie': cookiesHeader
                },
                method: "POST",
            });
            new Notice('获取登录链接成功')
            return response.json.link
        } catch (error) {
            new Notice(`获取登录链接失败：${error}`)
        }
    }
    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class SampleModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.setText('Woah!');
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Setting #1')
            .setDesc('It\'s a secret')
            .addText(text => text
                .setPlaceholder('Enter your secret')
                .setValue(this.plugin.settings.mySetting)
                .onChange(async (value) => {
                    this.plugin.settings.mySetting = value;
                    await this.plugin.saveSettings();
                }));
    }
}
