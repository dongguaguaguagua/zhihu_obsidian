import { App, Vault, Notice, Modal, requestUrl } from "obsidian";
import QRCode from "qrcode";
import * as dataUtil from "./data";
import * as cookieUtil from "./cookies";
import { loadSettings } from "./settings";

export class QRCodeModal extends Modal {
    private link: string;
    private canvas: HTMLCanvasElement | null = null;
    onCloseCallback: (() => void) | null = null;

    constructor(app: any, link: string) {
        super(app);
        this.link = link;
    }
    async onOpen() {
        this.modalEl.style.width = "320px";
        this.modalEl.style.height = "360px";
        const { contentEl } = this;
        const titleContainer = contentEl.createEl("div", {
            cls: "qrcode-title",
        });
        titleContainer.createEl("span", { text: "请扫码登录知乎" });
        contentEl.classList.add("zhihu-qrcode-modal");
        this.canvas = contentEl.createEl("canvas");
        await this.renderQRCode(this.link);
    }

    async renderQRCode(link: string) {
        if (!this.canvas) return;
        try {
            await QRCode.toCanvas(this.canvas, link, {
                width: 256,
                margin: 2,
                color: {
                    dark: "#3274ee",
                    light: "#00000000",
                },
            });
        } catch (err) {
            const { contentEl } = this;
            contentEl.createEl("p", { text: "生成二维码失败：" + err });
        }
    }

    async updateQRCode(newLink: string) {
        this.link = newLink;
        await this.renderQRCode(newLink);
    }

    showSuccess() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("div", {
            text: "✅ 扫码成功！请在知乎app中点击确认以登录",
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

export async function zhihuQRcodeLogin(app: App) {
    const vault = app.vault;
    await initCookies(vault);
    await signInNext(vault);
    await initUdidCookies(vault);
    await scProfiler(vault);
    const login = await getLoginLink(vault);
    await captchaSignIn(vault);
    const modal = new QRCodeModal(app, login.link);
    modal.open();
    let token = login.token;
    const interval = setInterval(async () => {
        const response = await fetchQRcodeStatus(vault, token);
        const res = response?.json;
        if ("status" in res) {
            if (res.status === 1) {
                modal.showSuccess();
            } else if (res.status === 5) {
                if (res.new_token) {
                    const newToken = res.new_token.Token;
                    const newLink = loginLinkBuilder(newToken);
                    modal.updateQRCode(newLink);
                    token = newToken;
                    new Notice("二维码已更新");
                }
            }
        } else {
            const zc0_cookie = cookieUtil.getCookiesFromHeader(response);
            await dataUtil.updateData(vault, { cookies: zc0_cookie });
            await dataUtil.updateData(vault, { bearer: res });
            await signInZhihu(vault);
            await prodTokenRefresh(vault);
            await getUserInfo(vault);
            modal.close();
            clearInterval(interval);
        }
    }, 2000);
    // 确保手动关闭modal也能清除轮询
    modal.setOnCloseCallback(() => {
        clearInterval(interval);
    });
}

export async function zhihuWebLogin(app: App) {
    const vault = app.vault;
    const remote = window.require("@electron/remote");
    const { BrowserWindow, session } = remote;

    // 清理环境：cookie、缓存、storage
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
    const oldCookies = await session.defaultSession.cookies.get({
        url: "https://www.zhihu.com",
    });
    await Promise.all(
        oldCookies.map((c: { name: any }) =>
            session.defaultSession.cookies.remove(
                "https://www.zhihu.com",
                c.name,
            ),
        ),
    );

    // 标记 zse-ck 脚本加载
    let loadedZse = false;
    session.defaultSession.webRequest.onCompleted(
        { urls: ["https://static.zhihu.com/zse-ck/v4/*"] },
        () => {
            loadedZse = true;
        },
    );

    // 模拟浏览器请求头
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ["https://*.zhihu.com/*"] },
        (details: any, callback: any) => {
            const h = details.requestHeaders;
            h["Referer"] = h["Referer"] || "https://www.zhihu.com/";
            h["Upgrade-Insecure-Requests"] = "1";
            h["Accept-Language"] = "zh-CN,zh;q=0.9";
            callback({ cancel: false, requestHeaders: h });
        },
    );

    // 创建窗口并设置 UA
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    win.webContents.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    );

    const loginUrl = "https://www.zhihu.com/signin";
    const exampleQuestionUrl = "https://www.zhihu.com/question/19550225";
    await win.loadURL(loginUrl);

    win.webContents.on("did-finish-load", async () => {
        const url = win.webContents.getURL();
        new Notice("加载完成：" + url);
        // 登录页面完成，用户输入完毕后可能跳转到首页
        if (url === "https://www.zhihu.com/") {
            // 转到具体问题页面，触发 zse-ck 脚本加载
            await win.loadURL(exampleQuestionUrl);
            return;
        }

        // 问题页面加载完成
        if (url.startsWith(exampleQuestionUrl)) {
            // 检查 zse-ck 脚本是否加载
            if (!loadedZse) {
                new Notice(
                    "登录失败：未能加载 zse-ck 脚本，请检查网络或尝试重试",
                );
                return;
            }

            // 获取 cookies
            const cookies = await session.defaultSession.cookies.get({
                url: "https://www.zhihu.com",
            });
            const zse = cookies.find(
                (c: { name: string }) => c.name === "__zse_ck",
            );
            if (!zse) {
                new Notice("登录失败：未获取到 __zse_ck，请检查网络或环境");
                return;
            }
            new Notice("登录成功");

            // convert cookies to {string: string} format
            const cookieObj: { [key: string]: string } = {};
            cookies.forEach((c: { name: string; value: string }) => {
                cookieObj[c.name] = c.value;
            });
            // save cookies to vault
            await dataUtil.updateData(vault, { cookies: cookieObj });
            await getUserInfo(vault);

            win.close();
        }
    });

    win.on("closed", () => {
        session.defaultSession.webRequest.onCompleted(null as any);
        session.defaultSession.webRequest.onBeforeSendHeaders(null as any);
    });
}

export async function checkIsUserLogin(vault: Vault) {
    const data = await dataUtil.loadData(vault);
    if (data && "userInfo" in data && data.userInfo) {
        new Notice(`欢迎! 知乎用户 ${data.userInfo.name}`);
        return true;
    } else {
        return false;
    }
}

async function initCookies(vault: Vault) {
    try {
        const settings = await loadSettings(vault);
        const response = await requestUrl({
            url: "https://www.zhihu.com",
            headers: {
                "User-Agent": settings.user_agent,
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Accept-Language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                DNT: "1",
                "Sec-GPC": "1",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                Priority: "u=0, i",
            },
            method: "GET",
        });
        const cookies = cookieUtil.getCookiesFromHeader(response);
        new Notice("获取初始cookies成功");
        await dataUtil.updateData(vault, { cookies: cookies });
    } catch (error) {
        new Notice(`获取初始cookies失败：${error}`);
    }
}

async function signInNext(vault: Vault) {
    try {
        const data = await dataUtil.loadData(vault);
        const settings = await loadSettings(vault);
        const cookiesHeader = cookieUtil.cookiesHeaderBuilder(data, [
            "_zap",
            "_xsrf",
            "BEC",
        ]);
        await requestUrl({
            url: "https://www.zhihu.com/signin?next=%2F",
            headers: {
                "User-Agent": settings.user_agent,
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Accept-Language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                DNT: "1",
                "Sec-GPC": "1",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                Priority: "u=0, i",
                Cookie: cookiesHeader,
            },
            method: "GET",
        });
    } catch (error) {
        new Notice(`重定向至sign in界面失败：${error}`);
    }
}

// 可获得cookie d_c0
async function initUdidCookies(vault: Vault) {
    try {
        const data = await dataUtil.loadData(vault);
        const settings = await loadSettings(vault);
        const cookiesHeader = cookieUtil.cookiesHeaderBuilder(data, [
            "_zap",
            "_xsrf",
            "BEC",
        ]);
        const xsrftoken = data.cookies._xsrf;
        const response = await requestUrl({
            url: "https://www.zhihu.com/udid",
            headers: {
                "User-Agent": settings.user_agent,
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Accept-Language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                Referer: "https://www.zhihu.com/signin?next=%2F",
                "x-xsrftoken": xsrftoken,
                "x-zse-93": "101_3_3.0",
                // 'x-zse-96': '2.0_WOZM=RCjY6RrNnbgjIrINcDa+pa2jlkfC8fA11VI+YGer2mtT/pKtc7Cb6AHkT1G',
                Origin: "https://www.zhihu.com",
                DNT: "1",
                "Sec-GPC": "1",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
                Priority: "u=4",
                Cookie: cookiesHeader,
            },
            method: "POST",
        });
        const udid_cookies = cookieUtil.getCookiesFromHeader(response);
        await dataUtil.updateData(vault, { cookies: udid_cookies });
    } catch (error) {
        new Notice(`获取UDID失败：${error}`);
    }
}

async function scProfiler(vault: Vault) {
    try {
        const data = await dataUtil.loadData(vault);
        const settings = await loadSettings(vault);
        const cookiesHeader = cookieUtil.cookiesHeaderBuilder(data, [
            "_zap",
            "_xsrf",
            "BEC",
        ]);
        await requestUrl({
            url: "https://www.zhihu.com/sc-profiler",
            headers: {
                "User-Agent": settings.user_agent,
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Content-Type": "application/json",
                "Accept-Language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                Referer: "https://www.zhihu.com/signin?next=%2F",
                Origin: "https://www.zhihu.com",
                DNT: "1",
                "Sec-GPC": "1",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
                Cookie: cookiesHeader,
            },
            body: JSON.stringify([
                [
                    "i",
                    "production.heifetz.desktop.v1.za_helper.init.count",
                    1,
                    1,
                ],
            ]),
            method: "POST",
        });
    } catch (error) {
        new Notice(`sc-profiler失败：${error}`);
    }
}

async function getLoginLink(vault: Vault) {
    try {
        const data = await dataUtil.loadData(vault);
        const settings = await loadSettings(vault);
        const cookiesHeader = cookieUtil.cookiesHeaderBuilder(data, [
            "_zap",
            "_xsrf",
            "BEC",
            "d_c0",
        ]);
        const response = await requestUrl({
            url: "https://www.zhihu.com/api/v3/account/api/login/qrcode",
            headers: {
                "User-Agent": settings.user_agent,
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Accept-Language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                Referer: "https://www.zhihu.com/signin?next=%2F",
                Origin: "https://www.zhihu.com",
                DNT: "1",
                "Sec-GPC": "1",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
                Priority: "u=4",
                Cookie: cookiesHeader,
            },
            method: "POST",
        });
        new Notice("获取登录链接成功");
        await dataUtil.updateData(vault, { login: response.json });
        return response.json;
    } catch (error) {
        new Notice(`获取登录链接失败：${error}`);
    }
}

// 可获得cookie captcha_session_v2
async function captchaSignIn(vault: Vault) {
    try {
        const data = await dataUtil.loadData(vault);
        const settings = await loadSettings(vault);
        const cookiesHeader = cookieUtil.cookiesHeaderBuilder(data, [
            "_zap",
            "_xsrf",
            "BEC",
            "d_c0",
        ]);
        const response = await requestUrl({
            url: "https://www.zhihu.com/api/v3/oauth/captcha/v2?type=captcha_sign_in",
            headers: {
                "User-Agent": settings.user_agent,
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Accept-Language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                Referer: "https://www.zhihu.com/signin?next=%2F",
                "x-requested-with": "fetch",
                DNT: "1",
                "Sec-GPC": "1",
                "Sec-Fetch-Dest": "empty",
                // 'Sec-Fetch-Mode': 'cors',
                "Sec-Fetch-Site": "same-origin",
                Priority: "u=4",
                Cookie: cookiesHeader,
            },
            method: "GET",
        });
        const cap_cookies = cookieUtil.getCookiesFromHeader(response);
        await dataUtil.updateData(vault, { cookies: cap_cookies });
    } catch (error) {
        new Notice(`获取captcha_session_v2失败:${error}`);
    }
}

// 可获得z_c0 cookie，这是身份识别的重要凭证
async function fetchQRcodeStatus(vault: Vault, token: string) {
    try {
        const data = await dataUtil.loadData(vault);
        const settings = await loadSettings(vault);
        const cookiesHeader = cookieUtil.cookiesHeaderBuilder(data, [
            "_zap",
            "_xsrf",
            "BEC",
            "d_c0",
            "captcha_session_v2",
        ]);
        const url = `https://www.zhihu.com/api/v3/account/api/login/qrcode/${token}/scan_info`;
        const response = await requestUrl({
            url: url,
            headers: {
                "User-Agent": settings.user_agent,
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Accept-Language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                Referer: "https://www.zhihu.com/signin?next=%2F",
                DNT: "1",
                "Sec-GPC": "1",
                "Sec-Fetch-Dest": "empty",
                // 'Sec-Fetch-Mode': 'cors',
                "Sec-Fetch-Site": "same-origin",
                Priority: "u=4",
                Cookie: cookiesHeader,
            },
            method: "GET",
        });
        new Notice(`扫描状态: ${response.json.status}`);
        return response;
    } catch (error) {
        new Notice(`获取扫描状态失败: ${error}`);
    }
}

// 成功请求可获得 3个BEC cookie，和q_c1 cookie
// 3个BEC cookies中，通常用最后一个进行下一步请求, 即token refresh
async function signInZhihu(vault: Vault) {
    try {
        const data = await dataUtil.loadData(vault);
        const settings = await loadSettings(vault);
        const cookiesHeader = cookieUtil.cookiesHeaderBuilder(data, [
            "_zap",
            "_xsrf",
            "BEC",
            "d_c0",
            "captcha_session_v2",
            "z_c0",
        ]);
        const response = await requestUrl({
            url: `https://www.zhihu.com`,
            headers: {
                "User-Agent": settings.user_agent,
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "accept-language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                referer: "https://www.zhihu.com/signin?next=%2F",
                dnt: "1",
                "sec-gpc": "1",
                "upgrade-insecure-requests": "1",
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "same-origin",
                priority: "u=0, i",
                // 'te': 'trailers',
                Cookie: cookiesHeader,
            },
            method: "GET",
        });
        const new_cookies = cookieUtil.getCookiesFromHeader(response);
        await dataUtil.updateData(vault, { cookies: new_cookies });
        return response;
    } catch (error) {
        new Notice(`获取q_c1 cookie失败: ${error}`);
    }
}

// 这里响应头的BEC会用于commercial API，所以不会存储
async function prodTokenRefresh(vault: Vault) {
    try {
        const data = await dataUtil.loadData(vault);
        const settings = await loadSettings(vault);
        const cookiesHeader = cookieUtil.cookiesHeaderBuilder(data, [
            "_zap",
            "_xsrf",
            "BEC",
            "d_c0",
            "captcha_session_v2",
            "z_c0",
            "q_c1",
        ]);
        await requestUrl({
            url: `https://www.zhihu.com/api/account/prod/token/refresh`,
            headers: {
                "User-Agent": settings.user_agent,
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "accept-language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                referer: "https://www.zhihu.com/",
                "x-requested-with": "fetch",
                origin: "https://www.zhihu.com",
                dnt: "1",
                "sec-gpc": "1",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                priority: "u=4",
                // 'te': 'trailers',
                Cookie: cookiesHeader,
            },
            method: "POST",
        });
    } catch (error) {
        new Notice(`访问prod/token/refresh失败: ${error}`);
    }
}

// 这里得到的BEC才会被用于后续请求。
async function getUserInfo(vault: Vault) {
    try {
        const data = await dataUtil.loadData(vault);
        const settings = await loadSettings(vault);
        const cookiesHeader = cookieUtil.cookiesHeaderBuilder(data, [
            "_zap",
            "_xsrf",
            "BEC",
            "d_c0",
            "captcha_session_v2",
            "z_c0",
            "q_c1",
        ]);
        const response = await requestUrl({
            url: `https://www.zhihu.com/api/v4/me?include=is_realname`,
            headers: {
                "User-Agent": settings.user_agent,
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "accept-language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                referer: "https://www.zhihu.com/",
                "x-requested-with": "fetch",
                "x-zse-93": "101_3_3.0",
                // 'x-zse-96': '2.0_uomb2nYm99nKWMHwGgFO3jv3IaI27H1sOu7Hok/0M/oD=+VeYt0cQgS7=ddu+mT/',
                // 'dnt': '1',
                // 'sec-gpc': '1',
                // 'sec-fetch-dest': 'empty',
                // 'sec-fetch-mode': 'cors',
                // 'sec-fetch-site': 'same-origin',
                // 'priority': 'u=4',
                // 'te': 'trailers',
                Cookie: cookiesHeader,
            },
            method: "GET",
        });
        const new_BEC = cookieUtil.getCookiesFromHeader(response);
        const userInfo = response.json;
        new Notice(`欢迎！${userInfo.name}`);
        await dataUtil.updateData(vault, { cookies: new_BEC });
        await dataUtil.updateData(vault, { userInfo: userInfo });
    } catch (error) {
        new Notice(`获取用户信息失败: ${error}`);
    }
}

function loginLinkBuilder(token: string): string {
    return `https://www.zhihu.com/account/scan/login/${token}?/api/login/qrcode`;
}
