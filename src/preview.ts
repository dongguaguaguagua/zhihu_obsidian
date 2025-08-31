import { App, Notice } from "obsidian";
import { loadSettings } from "./settings";
import { publishCurrentArticle } from "./publish_service";

// 知乎文章的“电脑预览”
export async function zhihuDesktopPreview(app: App) {
    const id = await publishCurrentArticle(app, true); // 先把当前内容放在草稿中
    if (id === undefined) return;
    await createPreview(app, id);
}

async function createPreview(app: App, articleId: string) {
    const vault = app.vault;
    const remote = window.require("@electron/remote");
    const { BrowserWindow } = remote;
    const settings = await loadSettings(vault);
    const partition = settings.partition;

    const previewURL = `https://zhuanlan.zhihu.com/p/${articleId}/preview?comment=0&catalog=0`;

    const win = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            partition,
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false, // 关闭同源策略
        },
    });

    await win.loadURL(previewURL);
}
