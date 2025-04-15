import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import QRCode from 'qrcode';

class QRCodeModal extends Modal {
  private link: string;
  private canvas: HTMLCanvasElement | null = null;
  onCloseCallback: (() => void) | null = null;

  constructor(app: any, link: string) {
    super(app);
    this.link = link;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: '知乎登录二维码' });

    this.canvas = contentEl.createEl('canvas');
    await this.renderQRCode(this.link);
  }

  async renderQRCode(link: string) {
    if (!this.canvas) return;
    try {
      await QRCode.toCanvas(this.canvas, link, {
        width: 256,
        margin: 2
      });
    } catch (err) {
      const { contentEl } = this;
      contentEl.createEl('p', { text: '生成二维码失败：' + err });
    }
  }

  async updateQRCode(newLink: string) {
    this.link = newLink;
    await this.renderQRCode(newLink);
  }

  showSuccess() {
    const { contentEl } = this;
    contentEl.empty();

    const successEl = contentEl.createEl('div', {
      text: '✅ 扫码成功！请在知乎app中点击确认以登录',
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }

  setOnCloseCallback(callback: () => void) {
    this.onCloseCallback = callback;
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
        await this.initCookies();
        await this.signInNext();
        await this.initUdidCookies();
        await this.scProfiler();

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
            const login = await this.getLoginLink();
            await this.captchaSignIn();
            const modal = new QRCodeModal(this.app, login.link);
            modal.open()
            let token = login.token
            const interval = setInterval(async () => {
                const response = await this.fetchQRcodeStatus(token);
                const res = response!.json
                if ('status' in res) {
                    if (res.status === 1) {
                        modal.showSuccess();
                    } else if (res.status === 5) {
                        if (res.new_token) {
                            const newToken = res.new_token.Token
                            const newLink = this.loginLinkBuilder(newToken)
                            modal.updateQRCode(newLink);
                            token = newToken
                            new Notice("二维码已更新")
                        }
                    }
                } else {
                    const data = await this.loadData();
                    const cookies = data?.cookies
                    const zc0_cookie = this.getCookiesFromHeader(response)
                    await this.updateData({ cookies: [...cookies, ...zc0_cookie] });
                    await this.updateData({ bearer: res });
                    new Notice('获取z_c0 cookie成功')
                    modal.close()
                    clearInterval(interval);
                }
            }, 2000);
            // 确保手动关闭modal也能清除轮询
            modal.setOnCloseCallback(() => {
              clearInterval(interval);
            });
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

    async initCookies() {
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
            cookies = this.getCookiesFromHeader(response)
            new Notice('获取初始cookies成功')
            await this.updateData({ cookies: cookies });
        } catch (error) {
            new Notice(`获取初始cookies失败：${error}`)
        }
    }
    async signInNext() {
        try {
            const data = await this.loadData();
            const cookies = data?.cookies
            const cookiesHeader = cookies?.join('; ') ?? '';
            const response = await requestUrl({
                url: "https://www.zhihu.com/signin?next=%2F",
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
                    'Priority': 'u=0, i',
                    'Cookie': cookiesHeader
                },
                method: "GET",
            });
            console.log(response.text)
            new Notice('重定向至sign in界面成功')
            await this.updateData({ cookies: cookies });
        } catch (error) {
            new Notice(`重定向至sign in界面失败：${error}`)
        }
    }

    async initUdidCookies() {
        try {
            const data = await this.loadData();
            const cookies = data?.cookies
            const cookiesHeader = cookies?.join('; ') ?? '';
            const xsrfCookie = await this.selectCookies(['_xsrf'])
            const xsrftoken = this.extractToken(xsrfCookie[0])
            console.log(xsrftoken)
            const response = await requestUrl({
                url: "https://www.zhihu.com/udid",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'Referer': 'https://www.zhihu.com/signin?next=%2F',
                    'x-xsrftoken': xsrftoken,
                    'x-zse-93': '101_3_3.0',
                    // 'x-zse-96': '2.0_WOZM=RCjY6RrNnbgjIrINcDa+pa2jlkfC8fA11VI+YGer2mtT/pKtc7Cb6AHkT1G',
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
            const udid_cookies = this.getCookiesFromHeader(response)
            new Notice('获取UDID成功')
            await this.updateData({ cookies: [...cookies, ...udid_cookies]});
        } catch (error) {
            new Notice(`获取UDID失败：${error}`)
        }
    }

    async scProfiler() {
        try {
            const data = await this.loadData();
            const cookies = await this.selectCookies(['_zap','_xsrf','BEC'])
            const cookiesHeader = cookies?.join('; ') ?? '';
            const response = await requestUrl({
                url: "https://www.zhihu.com/sc-profiler",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Content-Type': 'application/json',
                    'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'Referer': 'https://www.zhihu.com/signin?next=%2F',
                    'Origin': 'https://www.zhihu.com',
                    'DNT': '1',
                    'Sec-GPC': '1',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'Cookie': cookiesHeader
                },
                body: JSON.stringify([
                  [
                    'i',
                    'production.heifetz.desktop.v1.za_helper.init.count',
                    1,
                    1
                  ]
                ]),
                method: "POST",
            });
            console.log(response.text)
            new Notice('sc-profiler成功')
        } catch (error) {
            new Notice(`sc-profiler失败：${error}`)
        }
    }

    async getLoginLink() {
        try {
            const data = await this.loadData();
            const cookies = data?.cookies
            const cookiesHeader = cookies?.join('; ') ?? '';
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
            await this.updateData({ login: response.json });
            return response.json
        } catch (error) {
            new Notice(`获取登录链接失败：${error}`)
        }
    }

    async captchaSignIn() {
        try {
            const data = await this.loadData();
            const cookies = data?.cookies
            const cookiesHeader = cookies?.join('; ') ?? '';
            const response = await requestUrl({
                url: "https://www.zhihu.com/api/v3/oauth/captcha/v2?type=captcha_sign_in",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'Referer': 'https://www.zhihu.com/signin?next=%2F',
                    'x-requested-with': 'fetch',
                    'DNT': '1',
                    'Sec-GPC': '1',
                    'Sec-Fetch-Dest': 'empty',
                    // 'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'Priority': 'u=4',
                    'Cookie': cookiesHeader
                },
                method: "GET",
            });
            console.log(response)
            const cap_cookies = this.getCookiesFromHeader(response)
            new Notice('获取captcha_session_v2成功')
            await this.updateData({ cookies: [...cookies, ...cap_cookies]});
        } catch (error) {
            new Notice(`获取captcha_session_v2失败:${error}`)
        }
    }

    // async zbstEvents() {
    //     try {
    //         const data = await this.loadData();
    //         let cookies = data?.cookies
    //         const cookiesHeader = cookies?.join(' ') ?? '';
    //         const response = await requestUrl({
    //             url: "https://www.zhihu.com/zbst/events/r",
    //             headers: {
    //                 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
    //                 'Accept-Encoding': 'gzip, deflate, br, zstd',
    //                 'Content-Type': 'text/plain; text/plain;charset=UTF-8',
    //                 'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
    //                 'Referer': 'https://www.zhihu.com/no-referrer',
    //                 'x-requested-with': 'fetch',
    //                 'x-zse-83': '3_2.0',
    //                 'Origin': 'https://www.zhihu.com',
    //                 'DNT': '1',
    //                 'Sec-GPC': '1',
    //                 'Sec-Fetch-Dest': 'empty',
    //                 'Sec-Fetch-Mode': 'cors',
    //                 'Sec-Fetch-Site': 'same-origin',
    //                 'Priority': 'u=4',
    //                 'Cache-Control': 'max-age=0',
    //                 'Cookie': cookiesHeader
    //             },
    //             method: "GET",
    //         });
    //         cookies = this.getCookiesFromHeader(cookies, response)
    //         await this.updateData({ cookies: cookies });
    //     } catch (error) {
    //         new Notice(`获取captcha_session_v2失败:${error}`)
    //     }
    // }

    async fetchQRcodeStatus(token: string) {
        try {
            const data = await this.loadData();
            const cookies = data?.cookies
            const cookiesHeader = cookies?.join('; ') ?? '';
            const url = `https://www.zhihu.com/api/v3/account/api/login/qrcode/${token}/scan_info`
            const response = await requestUrl({
                url: url,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'Referer': 'https://www.zhihu.com/signin?next=%2F',
                    'DNT': '1',
                    'Sec-GPC': '1',
                    'Sec-Fetch-Dest': 'empty',
                    // 'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'Priority': 'u=4',
                    'Cookie': cookiesHeader
                },
                method: "GET",
            });
            new Notice(`扫描状态: ${response.json.status}`)
            return response
        } catch (error) {
            console.log(error)
            new Notice(`获取扫描状态失败: ${error}`)
        }
    }

    async selectCookies(keys: string[]): Promise<string[]> {
        const data = await this.loadData();
        const allCookies: string[] = data.cookies;

        const selectedCookies = allCookies.filter(cookieStr => {
            const key = cookieStr.split("=")[0];
            return keys.includes(key);
        });

        return selectedCookies;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async updateData(patch: Record<string, any>) {
      const oldData = await this.loadData() || {};
      const newData = Object.assign({}, oldData, patch);
      await this.saveData(newData);
    }

    getCookiesFromHeader(response: any): string[] {
        let new_cookies: string[] = [];
        const res_cookies = response.headers['set-cookie'];
        if (Array.isArray(res_cookies)) {
            new_cookies = res_cookies;
        } else if (typeof res_cookies === 'string') {
            new_cookies = [res_cookies];
        }
        new_cookies = new_cookies.map(cookie => {
            const match = cookie.match(/^[^;]+;/);
            return match ? match[0].replace(/;$/, '') : '';
        }).filter(Boolean);
        return new_cookies;
    }

    extractToken(str: string): string {
        const parts = str.split('=');
        if (parts.length > 1) {
            const valueWithSemicolon = parts[1];
            return valueWithSemicolon.slice(0, -1);  // 去除末尾的 ";"
        }
        return "";
    }

    loginLinkBuilder(token: string): string {
        return `https://www.zhihu.com/account/scan/login/${token}?/api/login/qrcode`
    }

    onunload() {

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

function toCurl({ url, headers }: { url: string, headers: Record<string, string> }) {
  const headerStr = Object.entries(headers)
    .map(([key, value]) => `-H '${key}: ${value}'`)
    .join(' \\\n  ');
  return `curl -X GET '${url}' \\\n  ${headerStr}`;
}
