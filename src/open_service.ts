import { App, Vault, MarkdownView, Notice, TFile, requestUrl } from "obsidian";
import * as dataUtil from "./data";
import * as cookies from "./cookies";
import { openContent } from "./sides_view";

function isZhihuAnswerLink(link: string): boolean {
    return /^https?:\/\/(www\.)?zhihu\.com\/question\/\d+\/answer\/\d+/.test(
        link,
    );
}

function getQuestionAndAnswerId(link: string): [string, string] {
    const match = link.match(
        /^https?:\/\/www\.zhihu\.com\/question\/(\d+)\/answer\/(\d+)/,
    );
    if (match) {
        return [match[1], match[2]];
    }
    return ["", ""];
}

export async function handleAnswerClickReadMode(app: App, evt: MouseEvent) {
    const target = evt.target as HTMLElement;
    // if (!(target && target.tagName === 'A')) return;
    if (
        !(target instanceof HTMLAnchorElement) ||
        !target.classList.contains("external-link")
    )
        return;
    const targetLink = target.href;
    // const targetLink = (target as HTMLAnchorElement).getAttribute("href");
    const targetConetent = target.textContent;
    console.log(targetLink, targetConetent);
    if (!targetConetent) return;
    console.log(isZhihuAnswerLink(targetLink));
    if (!isZhihuAnswerLink(targetLink)) return;
    evt.preventDefault();
    evt.stopPropagation();
    console.log("链接点击已被拦截");
    openZhihuLinkInVault(app, targetLink);
}

export async function handleAnswerClickLivePreview(app: App, evt: MouseEvent) {
    const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) return;

    const editor = markdownView.editor;
    const cmEditor = (editor as any).cm;
    if (!cmEditor) return;

    const pos = cmEditor.posAtCoords({ x: evt.clientX, y: evt.clientY });
    if (!pos) return;

    const state = cmEditor.state;
    const doc = state.doc;
    const line = doc.lineAt(pos);
    const text = line.text;

    // 正则匹配 Markdown 链接 [title](url)
    const match = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    let found: RegExpExecArray | null;
    while ((found = match.exec(text))) {
        const linkStart = line.from + found.index;
        const linkEnd = linkStart + found[0].length;
        if (pos >= linkStart && pos <= linkEnd) {
            const linkText = found[1];
            const linkHref = found[2];
            if (!isZhihuAnswerLink(linkHref)) return;

            // 拦截点击
            evt.preventDefault();
            evt.stopPropagation();

            console.log("Live Preview 模式下点击了知乎链接：", linkHref);
            openZhihuLinkInVault(app, linkHref);
            return;
        }
    }
}
async function openZhihuLinkInVault(app: App, zhihuLink: string) {
    const [questionId, answerId] = getQuestionAndAnswerId(zhihuLink);
    try {
        const data = await dataUtil.loadData(app.vault);
        const cookiesHeader = cookies.cookiesHeaderBuilder(data, []);
        const response = await requestUrl({
            url: zhihuLink,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "accept-language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                "upgrade-insecure-requests": "1",
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "none",
                "sec-fetch-user": "?1",
                priority: "u=0, i",
                Cookie: cookiesHeader,
            },
            method: "GET",
        });
        const htmlText = response.text;
        // 使用 DOMParser 解析 HTML 字符串
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, "text/html");
        // 定位回答内容 div
        const contentEle = doc.querySelector(".RichContent-inner .RichText");
        const writerInfoEle = doc.querySelector(
            ".UserLink.AuthorInfo-name .UserLink-link",
        );
        const questionTitleEle = doc.querySelector(".QuestionHeader-title");
        if (contentEle && writerInfoEle && questionTitleEle) {
            const writerName = writerInfoEle.textContent?.trim() || "知乎用户";
            const questionTitle =
                questionTitleEle.textContent?.trim() || `知乎问题${questionId}`;
            openContent(
                app,
                questionTitle,
                zhihuLink,
                contentEle.innerHTML,
                "answer",
                writerName,
            );
        } else {
            console.log("未找到回答内容");
        }
    } catch (error) {
        console.error("回答请求失败", error);
        new Notice(`回答请求失败: ${error.message}`);
    }
}
