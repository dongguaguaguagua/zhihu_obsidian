import { App, TFile, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

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

export default class ZhihuObPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();
        let isUserLogin = await this.checkIsUserLogin();

        // This creates an icon in the left ribbon.
        this.addRibbonIcon('dice', '生成知乎二维码登录', async () => {
        });

        // Perform additional things with the ribbon
        // ribbonIconEl.addClass('my-plugin-ribbon-class');

        // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText('Status Bar Text');

        this.addCommand({
          id: 'zhihu-qrcode-login',
          name: 'Zhihu QRCode Login',
          callback: async () => {
            await this.zhihuQRcodeLogin();
          }
        });

        this.addCommand({
            id: 'zhihu-publish-current-file',
            name: 'Zhihu Publish Current FIle',
            editorCallback: async (editor: Editor, view: MarkdownView) => {
                await this.publishCurrentFile(this.app);
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

    async checkIsUserLogin() {
        const data = await this.loadData();
        if('userInfo' in data) {
            new Notice(`欢迎! 知乎用户 ${data.userInfo.name}`)
            return true
        } else {
            new Notice("您还未登录知乎，请先登录")
            return false
        }
    }

    async zhihuQRcodeLogin() {
        await this.initCookies();
        await this.signInNext();
        await this.initUdidCookies();
        await this.scProfiler();
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
                await this.updateData({ cookies: zc0_cookie });
                await this.updateData({ bearer: res });
                new Notice('获取z_c0 cookie成功')
                await this.signInZhihu();
                await this.prodTokenRefresh();
                await this.getUserInfo();
                modal.close()
                clearInterval(interval);
            }
        }, 2000);
        // 确保手动关闭modal也能清除轮询
        modal.setOnCloseCallback(() => {
          clearInterval(interval);
        });
    }

    async publishCurrentFile(app: App) {
      const activeFile = app.workspace.getActiveFile();
      if (!activeFile) {
        console.warn("No active file found");
        return;
      }
      const fileCache = app.metadataCache.getFileCache(activeFile);
      const frontmatter = fileCache?.frontmatter;
      if (!frontmatter) {
        new Notice("Zhihu on obsidian要求要添加文章属性")
        return;
      }
      const tags = normalizeStr(frontmatter.tags);
      const topics = normalizeStr(frontmatter.topics);
      const hasZhihuTag = tags.includes("zhihu");
      if (!hasZhihuTag) {
        new Notice("Zhihu on obsidian要求标签包含zhihu")
        return;
      }
      if (topics.length === 0) {
        new Notice("Zhihu on obsidian要求必须添加话题")
        return;
      }
      const isPublished = typeof frontmatter.link !== "undefined" && frontmatter.link !== null;
      const toc = false;

      if (!isPublished) {
        const title = frontmatter.title || "untitled";
        const id = await this.newDraft(title);
        const content = await app.vault.read(activeFile);
        await this.patchDraft(id, title, content, toc);

        for (const topic of topics) {
          try {
            const res = await this.autoCompleteTopic(id, topic);
            if (Array.isArray(res) && res.length > 0) {
              await this.topics2Draft(id, res[0]);
            }
          } catch (err) {
            console.error(`Error auto-completing topic for tag "${topic}":`, err);
          }
        }

        const publishResult = await this.publishDraft(id, toc);
        const url = publishResult.publish.url
        if (url) {
            await addFrontmatter(app, activeFile, "link", url);
        }
      }
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
            const cookies = this.getCookiesFromHeader(response)
            new Notice('获取初始cookies成功')
            await this.updateData({ cookies: cookies });
        } catch (error) {
            new Notice(`获取初始cookies失败：${error}`)
        }
    }

    async signInNext() {
        try {
            const data = await this.loadData();
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC"])
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
            new Notice('重定向至sign in界面成功')
        } catch (error) {
            new Notice(`重定向至sign in界面失败：${error}`)
        }
    }

    // 可获得cookie d_c0
    async initUdidCookies() {
        try {
            const data = await this.loadData();
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC"])
            const xsrftoken = data.cookies._xsrf;
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
            const udid_cookies = this.getCookiesFromHeader(response);
            new Notice('获取UDID成功');
            await this.updateData({ cookies: udid_cookies});
        } catch (error) {
            new Notice(`获取UDID失败：${error}`)
        }
    }

    async scProfiler() {
        try {
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC"])
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
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC", "d_c0"])
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

    // 可获得cookie captcha_session_v2
    async captchaSignIn() {
        try {
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC", "d_c0"])
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
            await this.updateData({ cookies: cap_cookies});
        } catch (error) {
            new Notice(`获取captcha_session_v2失败:${error}`)
        }
    }

    // 可获得z_c0 cookie，这是身份识别的重要凭证
    async fetchQRcodeStatus(token: string) {
        try {
            const data = await this.loadData();
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC", "d_c0", "captcha_session_v2"])
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

    // 成功请求可获得 3个BEC cookie，和q_c1 cookie
    // 3个BEC cookies中，通常用最后一个进行下一步请求, 即token refresh
    async signInZhihu() {
        try {
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC", "d_c0", "captcha_session_v2", "z_c0"])
            const response = await requestUrl({
                url: `https://www.zhihu.com`,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'referer': 'https://www.zhihu.com/signin?next=%2F',
                    'dnt': '1',
                    'sec-gpc': '1',
                    'upgrade-insecure-requests': '1',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-origin',
                    'priority': 'u=0, i',
                    // 'te': 'trailers',
                    'Cookie': cookiesHeader
                },
                method: "GET",
            });
            const new_cookies = this.getCookiesFromHeader(response)
            new Notice(`获取q_c1 cookie成功`)
            await this.updateData({ cookies: new_cookies});
            return response
        } catch (error) {
            console.log(error)
            new Notice(`获取q_c1 cookie失败: ${error}`)
        }
    }

    // 这里响应头的BEC会用于commercial API，所以不会存储
    async prodTokenRefresh() {
        try {
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC", "d_c0", "captcha_session_v2", "z_c0", "q_c1"])
            const response = await requestUrl({
                url: `https://www.zhihu.com/api/account/prod/token/refresh`,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'referer': 'https://www.zhihu.com/',
                    'x-requested-with': 'fetch',
                    'origin': 'https://www.zhihu.com',
                    'dnt': '1',
                    'sec-gpc': '1',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'priority': 'u=4',
                    // 'te': 'trailers',
                    'Cookie': cookiesHeader
                },
                method: "POST",
            });
            // const new_cookies = this.getCookiesFromHeader(response)
            // console.log("new cookies:", new_cookies)
            new Notice(`访问prod/token/refresh成功`)
            // await this.updateData({ cookies: new_cookies});
        } catch (error) {
            console.log(error)
            new Notice(`访问prod/token/refresh失败: ${error}`)
        }
    }

    // 这里得到的BEC才会被用于后续请求。
    async getUserInfo() {
        try {
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC", "d_c0", "captcha_session_v2", "z_c0", "q_c1"])
            const response = await requestUrl({
                url: `https://www.zhihu.com/api/v4/me?include=is_realname`,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'referer': 'https://www.zhihu.com/',
                    'x-requested-with': 'fetch',
                    'x-zse-93': '101_3_3.0',
                    // 'x-zse-96': '2.0_uomb2nYm99nKWMHwGgFO3jv3IaI27H1sOu7Hok/0M/oD=+VeYt0cQgS7=ddu+mT/',
                    // 'dnt': '1',
                    // 'sec-gpc': '1',
                    // 'sec-fetch-dest': 'empty',
                    // 'sec-fetch-mode': 'cors',
                    // 'sec-fetch-site': 'same-origin',
                    // 'priority': 'u=4',
                    // 'te': 'trailers',
                    'Cookie': cookiesHeader
                },
                method: "GET",
            });
            const new_BEC = this.getCookiesFromHeader(response)
            const userInfo = response.json
            console.log("new BEC:", new_BEC)
            // new Notice(`获取用户信息成功成功`)
            new Notice(`欢迎！${userInfo.name}`)
            await this.updateData({ cookies: new_BEC});
            await this.updateData({ userInfo: userInfo});
        } catch (error) {
            console.log(error)
            new Notice(`获取用户信息失败: ${error}`)
        }
    }

    async newDraft(title: string) {
        try {
            const data = await this.loadData();
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC", "d_c0", "captcha_session_v2", "z_c0"])
            const xsrftoken = data.cookies._xsrf;
            const response = await requestUrl({
                url: `https://zhuanlan.zhihu.com/api/articles/drafts`,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Content-Type': 'application/json',
                    'accept-language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'referer': 'https://zhuanlan.zhihu.com/write',
                    'x-requested-with': 'fetch',
                    'x-xsrftoken': xsrftoken,
                    // 'x-zst-81': '3_2.0aR_sn77yn6O92wOB8hPZniUZo02x-7om0CNMDrxTrR2xQRY01T2Z-we8gGHPDRFZG0Y0jQgM7A2pr6P0mRPO7HoY70SfquPmz93mhDQyiqV9ebO1hwOYiiR0ELYuUrxmtDomqU7ynXtOnAoTh_PhRDSTFRC_EqXMywpykbOfrJHMoC2B8XxMSeVO6LosB9OGYUXYJUHq3UwprcxL7UeTvTrf9CCBicS8hggKgCeY68XsagpMBXLKwhO1xJO96LpGADwmDJSfVgcYbLeVmU3MJbO03qtLPD3M2CtKb4omVBS8ave87ggfu9eq1wtVpCYytCL_8vxmCqkw3BYL6gpKJULLhgpK2cfyJhXC6CHMogp1oH39RJSMSqH_QJN_CBFCQqHYwrrCih3__rx1K0tKbCLYIg3XhgcCZuFKzUH9hgHKarLO8MF0ST9ZQXLKeXYC',
                    'origin': 'https://zhuanlan.zhihu.com',
                    // 'dnt': '1',
                    // 'sec-gpc': '1',
                    // 'sec-fetch-dest': 'empty',
                    // 'sec-fetch-mode': 'cors',
                    // 'sec-fetch-site': 'same-origin',
                    // 'priority': 'u=4',
                    // 'te': 'trailers',
                    'Cookie': cookiesHeader
                },
                method: "POST",
                body: JSON.stringify({
                  'title': title,
                  'delta_time': 0,
                  'can_reward': false
                })
            });
            const articleId = response.json.id
            new Notice(`获取文章ID成功`)
            console.log("articleId: ", articleId)
            return articleId
        } catch (error) {
            console.log(error)
            new Notice(`生成新的草稿失败: ${error}`)
        }
    }

    async patchDraft(id: string, title: string, content: string, toc: boolean) {
        try {
            const data = await this.loadData();
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC", "d_c0", "captcha_session_v2", "z_c0"])
            const xsrftoken = data.cookies._xsrf;
            const response = await requestUrl({
                url: `https://zhuanlan.zhihu.com/api/articles/${id}/draft`,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Content-Type': 'application/json',
                    'accept-language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'referer': `https://zhuanlan.zhihu.com/p/${id}/edit`,
                    'x-requested-with': 'fetch',
                    'x-xsrftoken': xsrftoken,
                    // 'x-zst-81': '3_2.0aR_sn77yn6O92wOB8hPZniUZo02x-7om0CNMDrxTrR2xQRY01T2Z-we8gGHPDRFZG0Y0jQgM7A2pr6P0mRPO7HoY70SfquPmz93mhDQyiqV9ebO1hwOYiiR0ELYuUrxmtDomqU7ynXtOnAoTh_PhRDSTFRC_EqXMywpykbOfrJHMoC2B8XxMSeVO6LosB9OGYUXYJUHq3UwprcxL7UeTvTrf9CCBicS8hggKgCeY68XsagpMBXLKwhO1xJO96LpGADwmDJSfVgcYbLeVmU3MJbO03qtLPD3M2CtKb4omVBS8ave87ggfu9eq1wtVpCYytCL_8vxmCqkw3BYL6gpKJULLhgpK2cfyJhXC6CHMogp1oH39RJSMSqH_QJN_CBFCQqHYwrrCih3__rx1K0tKbCLYIg3XhgcCZuFKzUH9hgHKarLO8MF0ST9ZQXLKeXYC',
                    'origin': 'https://zhuanlan.zhihu.com',
                    // 'dnt': '1',
                    // 'sec-gpc': '1',
                    // 'sec-fetch-dest': 'empty',
                    // 'sec-fetch-mode': 'cors',
                    // 'sec-fetch-site': 'same-origin',
                    // 'priority': 'u=4',
                    // 'te': 'trailers',
                    'Cookie': cookiesHeader
                },
                method: "PATCH",
                body: JSON.stringify({
                    'title': title,
                    'content': content,
                    'table_of_contents': toc,
                    'delta_time': 30,
                    'can_reward': false
                })
            });
            new Notice(`patch文章成功`)
        } catch (error) {
            console.log(error)
            new Notice(`patch文章失败: ${error}`)
        }
    }

    async autoCompleteTopic(id: string, topic: string) {
        try {
            const data = await this.loadData();
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC", "d_c0", "captcha_session_v2", "z_c0"])
            const xsrftoken = data.cookies._xsrf;
            const response = await requestUrl({
                url: encodeURI(`https://zhuanlan.zhihu.com/api/autocomplete/topics?token=${topic}&max_matches=5&use_similar=0&topic_filter=1`),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'referer': `https://zhuanlan.zhihu.com/p/${id}/edit`,
                    'x-requested-with': 'fetch',
                    // 'x-zse-93': '101_3_3.0',
                    // 'x-zse-96': '2.0_XG+DQ3XSgsFurS0dDNCjVCj7C4W4dIeeopGJ18N1LcupsmTKxdk7gvhgHYvBIdW/',
                    // 'x-zst-81': '3_2.0aR_sn77yn6O92wOB8hPZniUZo02x-7om0CNMDrxTrR2xQRY01T2Z-we8gGHPDRFZG0Y0jQgM7A2pr6P0mRPO7HoY70SfquPmz93mhDQyiqV9ebO1hwOYiiR0ELYuUrxmtDomqU7ynXtOnAoTh_PhRDSTFTYO8Ug1sR316cH0fBV8jug87CtOAgNmkvx_VhFCUUCGFJemtGxfBBV0YCSTvTrf9CCBicS8hggKgCeY68XsagpMBXLKwhO1xJO96LpGADwmDJSfVgcYbLeVmU3MJbO03qtLPD3M2CtKb4omVBS8ave87ggfu9eq1wtVpCYytCL_8vxmCqkw3BYL6gpKJULLhgpK2cfyJhXC6CHMogp1oH39RJSMSqH_QJN_CBFCQqHYwrrCih3__rx1K0tKbCLYIg3XhgcCZuFKzUH9hgHKarLO8MF0ST9ZQXLKeXYC',
                    // 'dnt': '1',
                    // 'sec-gpc': '1',
                    // 'sec-fetch-dest': 'empty',
                    // 'sec-fetch-mode': 'cors',
                    // 'sec-fetch-site': 'same-origin',
                    // 'priority': 'u=4',
                    // 'te': 'trailers',
                    'Cookie': cookiesHeader
                },
                method: "GET"
            });
            new Notice(`获取话题成功`)
            return response.json
        } catch (error) {
            console.log(error)
            new Notice(`获取话题失败: ${error}`)
        }
    }

    async topics2Draft(id: string, topics: any) {
        try {
            const data = await this.loadData();
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC", "d_c0", "captcha_session_v2", "z_c0"])
            const xsrftoken = data.cookies._xsrf;
            const response = await requestUrl({
                url: `https://zhuanlan.zhihu.com/api/articles/${id}/topics`,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Content-Type': 'application/json',
                    'accept-language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    'referer': `https://zhuanlan.zhihu.com/p/${id}/edit`,
                    'x-requested-with': 'fetch',
                    'x-xsrftoken': xsrftoken,
                    'origin': 'https://zhuanlan.zhihu.com',
                    // 'dnt': '1',
                    // 'sec-gpc': '1',
                    // 'sec-fetch-dest': 'empty',
                    // 'sec-fetch-mode': 'cors',
                    // 'sec-fetch-site': 'same-origin',
                    // 'priority': 'u=0',
                    // 'te': 'trailers',
                    'Cookie': cookiesHeader
                },
                method: "POST",
                body:JSON.stringify(topics)
            });
            console.log(response)
            new Notice(`给文章赋予话题成功`)
            // return response.json
        } catch (error) {
            console.log(error)
            new Notice(`给文章赋予话题失败: ${error}`)
        }
    }

    async publishDraft(id: string, toc: boolean) {
        try {
            const data = await this.loadData();
            const cookiesHeader = await this.cookiesHeaderBuilder(["_zap", "_xsrf", "BEC", "d_c0", "captcha_session_v2", "z_c0", "q_c1"])
            const xsrftoken = data.cookies._xsrf;
            const traceId = `${Date.now()},${uuidv4()}`;
            const response = await requestUrl({
                url: `https://www.zhihu.com/api/v4/content/publish`,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Content-Type': 'application/json',
                    'accept-language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                    // 'referer': `https://zhuanlan.zhihu.com/p/${id}/edit`,
                    'x-requested-with': 'fetch',
                    'x-xsrftoken': xsrftoken,
                    // 'x-zse-93': '101_3_3.0',
                    // 'x-zse-96': '2.0_LR8Q6m9DRDr5V67FbmueqQC2WpP4haQauHp/y0C25HxTT6Hw5+5hLKca68OOHRKY',
                    // 'x-zst-81': '3_2.0aR_sn77yn6O92wOB8hPZniUZo02x-7om0CNMDrxTrR2xQRY01T2Z-we8gGHPDRFZG0Y0jQgM7A2pr6P0mRPO7HoY70SfquPmz93mhDQyiqV9ebO1hwOYiiR0ELYuUrxmtDomqU7ynXtOnAoTh_PhRDSTFTYO8Ug1sR316cH0fBV8jug87CtOAgNmkvx_VhFCUUCGFJemtGxfBBV0YCSTvTrf9CCBicS8hggKgCeY68XsagpMBXLKwhO1xJO96LpGADwmDJSfVgcYbLeVmU3MJbO03qtLPD3M2CtKb4omVBS8ave87ggfu9eq1wtVpCYytCL_8vxmCqkw3BYL6gpKJULLhgpK2cfyJhXC6CHMogp1oH39RJSMSqH_QJN_CBFCQqHYwrrCih3__rx1K0tKbCLYIg3XhgcCZuFKzUH9hgHKarLO8MF0ST9ZQXLKeXYC',
                    // 'origin': 'https://zhuanlan.zhihu.com',
                    // 'dnt': '1',
                    // 'sec-gpc': '1',
                    // 'sec-fetch-dest': 'empty',
                    // 'sec-fetch-mode': 'cors',
                    // 'sec-fetch-site': 'same-site',
                    // 'priority': 'u=0',
                    // 'te': 'trailers',
                    'Cookie': cookiesHeader
                },
                method: "POST",
                body: JSON.stringify({
                'action': 'article',
                'data': {
                'publish': {'traceId': traceId},
                'extra_info': {
                    'publisher': 'pc',
                    'pc_business_params': `{\
                        "column":null,\
                        "commentPermission":"anyone",\
                        "disclaimer_type":"none",\
                        "disclaimer_status":"close",\
                        "table_of_contents_enabled":${toc},\
                        "commercial_report_info":{"commercial_types":[]},\
                        "commercial_zhitask_bind_info":null,\
                        "canReward":false\
                    }`
                },
                'draft': {'disabled': 1,'id': id,'isPublished': false},
                'commentsPermission': {'comment_permission': 'anyone'},
                'creationStatement': {'disclaimer_type': 'none','disclaimer_status': 'close'},
                'contentsTables': {'table_of_contents_enabled': toc},
                'commercialReportInfo': {'isReport': 0},
                'appreciate': {'can_reward': false,'tagline': ''},
                'hybridInfo': {}
                }
              })
            });
            if (response.json.message === "success"){
                new Notice(`发布文章成功!`)
                const result = JSON.parse(response.json.data.result)
                return result
            }
        } catch (error) {
            console.log(error)
            new Notice(`发布文章失败: ${error}`)
        }
    }

    async cookiesHeaderBuilder(keys: string[]): Promise<string> {
        const data = await this.loadData();
        const cookiesHeader = Object.entries(data.cookies)
            .filter(([key]) => keys.includes(key))
            .map(([key, value]) => `${key}=${value}`)
            .join("; ");
        return cookiesHeader;
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async updateData(patch: Record<string, any>) {
        const oldData = await this.loadData() || {};
        const newData = this.deepMerge(oldData, patch);
        await this.saveData(newData);
    }

    deepMerge(target: any, source: any): any {
      if (typeof target !== 'object' || target === null) return source;
      if (typeof source !== 'object' || source === null) return source;

      const merged: Record<string, any> = { ...target };

      for (const key of Object.keys(source)) {
        const targetVal = target[key];
        const sourceVal = source[key];

        if (
          typeof targetVal === 'object' && targetVal !== null &&
          typeof sourceVal === 'object' && sourceVal !== null &&
          !Array.isArray(sourceVal)
        ) {
          merged[key] = this.deepMerge(targetVal, sourceVal);
        } else {
          merged[key] = sourceVal;
        }
      }

      return merged;
    }


    getCookiesFromHeader(response: any): { [key: string]: string } {
        let new_cookies: string[] = [];
        const res_cookies = response.headers['set-cookie'];
        if (Array.isArray(res_cookies)) {
            new_cookies = res_cookies;
        } else if (typeof res_cookies === 'string') {
            new_cookies = [res_cookies];
        }

        const result: { [key: string]: string } = {};

        new_cookies.forEach(cookieStr => {
            const [keyValuePair] = cookieStr.split(";");
            const separatorIndex = keyValuePair.indexOf("=");
            if (separatorIndex !== -1) {
                const key = keyValuePair.substring(0, separatorIndex).trim();
                const value = keyValuePair.substring(separatorIndex + 1).trim();
                result[key] = value;
            }
        });

        return result;
    }

    loginLinkBuilder(token: string): string {
        return `https://www.zhihu.com/account/scan/login/${token}?/api/login/qrcode`;
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
    plugin: ZhihuObPlugin;

    constructor(app: App, plugin: ZhihuObPlugin) {
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

type RequestOptions = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

function toCurl(options: RequestOptions): string {
  const { url, method = "GET", headers = {}, body } = options;

  const headerParts = Object.entries(headers).map(
    ([key, value]) => `-H "${key}: ${value}"`
  );

  const methodPart = method.toUpperCase() === "GET" ? "" : `-X ${method.toUpperCase()}`;

  const bodyPart = body ? `-d '${body.replace(/'/g, `'\\''`)}'` : "";

  const parts = [
    "curl",
    methodPart,
    `"${url}"`,
    ...headerParts,
    bodyPart
  ].filter(Boolean); // remove empty strings

  return parts.join(" \\\n  ");
}

function normalizeStr(str: string | string[] | undefined): string[] {
    if (!str) return [];
    if (typeof str === "string") {
        return [str];
    }
    return str;
}

async function addFrontmatter(app: App, file: TFile, key: string, value: string) {
  const content = await app.vault.read(file);
  const fmRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(fmRegex);

  if (match) {
    let fm = match[1];
    const keyRegex = new RegExp(`^${key}:.*$`, "m");

    if (!keyRegex.test(fm)) {
      fm += `\n${key}: ${value}`;
      const updatedContent = content.replace(fmRegex, `---\n${fm}\n---`);
      await app.vault.modify(file, updatedContent);
      console.log(`Added frontmatter: ${key}: ${value}`);
    } else {
      console.log(`Frontmatter key "${key}" already exists. Skipping add.`);
    }
  } else {
    console.warn("Frontmatter not found.");
  }
}

async function updateFrontmatter(app: App, file: TFile, key: string, value: string) {
  const content = await app.vault.read(file);
  const fmRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(fmRegex);

  if (match) {
    let fm = match[1];
    const keyRegex = new RegExp(`^${key}:.*$`, "m");

    if (keyRegex.test(fm)) {
      fm = fm.replace(keyRegex, `${key}: ${value}`);
    } else {
      fm += `\n${key}: ${value}`;
    }

    const updatedContent = content.replace(fmRegex, `---\n${fm}\n---`);
    await app.vault.modify(file, updatedContent);
    console.log(`Updated frontmatter: ${key}: ${value}`);
  } else {
    console.warn("Frontmatter not found.");
  }
}

