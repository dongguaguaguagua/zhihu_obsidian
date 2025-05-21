import { App, Vault, Notice, TFile, requestUrl } from 'obsidian';
import { htmlToMd } from './html_to_markdown';
import * as dataUtil from "./data";
import * as cookies from "./cookies";

function isZhihuAnswerLink(link: string): boolean {
    return /^https?:\/\/(www\.)?zhihu\.com\/question\/\d+\/answer\/\d+/.test(link);
}

function getQuestionAndAnswerId(link: string): [string, string] {
    const match = link.match(/^https?:\/\/www\.zhihu\.com\/question\/(\d+)\/answer\/(\d+)/);
    if (match) {
        return [match[1], match[2]];
    }
    return ['', ''];
}

export async function handleAnswerClick(vault: Vault, evt: MouseEvent) {
    const target = evt.target as HTMLElement;
    if (!(target && target.tagName === 'A')) return;
    const targetLink = (target as HTMLAnchorElement).getAttribute('href');
    const targetConetent = target.textContent;
    console.log(targetLink, targetConetent);
    if (!targetConetent) return;
    // 匹配知乎回答链接
    if (!isZhihuAnswerLink(targetConetent)) return;

    evt.preventDefault(); // 阻止默认跳转行为
    evt.stopImmediatePropagation(); // 阻止 Obsidian 的默认处理器
    evt.stopPropagation();
    console.log('链接点击已被拦截');
    openZhihuLinkInVault(vault, targetConetent);
}


async function openZhihuLinkInVault(vault: Vault, zhihuLink: string) {
    const [questionId, answerId] = getQuestionAndAnswerId(zhihuLink);
    try {
        const data = await dataUtil.loadData(vault);
        const cookiesHeader = cookies.cookiesHeaderBuilder(data, []);
        const response = await requestUrl({
            url: zhihuLink,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'accept-language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
                'upgrade-insecure-requests': '1',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'none',
                'sec-fetch-user': '?1',
                'priority': 'u=0, i',
                Cookie: cookiesHeader,
            },
            method: "GET"
        });
        const htmlText = response.text;
        // 使用 DOMParser 解析 HTML 字符串
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        // 定位回答内容 div
        const contentEle = doc.querySelector('.RichContent-inner .RichText');
        const writerInfoEle = doc.querySelector('.UserLink.AuthorInfo-name .UserLink-link');
        const questionTitleEle = doc.querySelector('.QuestionHeader-title');
        if (contentEle && writerInfoEle && questionTitleEle) {
            const mdText = htmlToMd(contentEle.innerHTML);
            const writerName = writerInfoEle.textContent?.trim() || '知乎用户';
            const questionTitle = questionTitleEle.textContent?.trim() || `知乎问题${questionId}`;
            // 构造文件路径
            const folder = 'zhihu';
            const fileName = `${writerName}：${questionTitle}.md`;
            const filePath = `${folder}/${fileName}`;
            console.log(fileName);
            // 确保文件夹存在
            await this.app.vault.createFolder(folder).catch(() => { });
            // 创建或覆盖文件
            let file: TFile;
            try {
                file = await this.app.vault.getAbstractFileByPath(filePath) as TFile;
                await this.app.vault.modify(file, mdText);
            } catch {
                file = await this.app.vault.create(filePath, mdText);
            }
            // 在 Obsidian 中打开
            this.app.workspace.openLinkText(filePath, '', false);
        } else {
            console.log('未找到回答内容');
        }
    } catch (error) {
        console.error('回答请求失败', error);
        new Notice(`回答请求失败: ${error.message}`);
    }
}
