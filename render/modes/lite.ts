import { createZhihuHandlers } from "../core/handlers";
import { convertMarkdownToZhihuHtml } from "../core/convert";

export type ZhihuRenderLiteOptions = {
    useZhihuHeadings?: boolean;
};

export async function remarkMdToHTML(
    md: string,
    opts: ZhihuRenderLiteOptions = {},
) {
    const idMap = new Map<string, number>(); // 原始id → 新编号
    const handlers = createZhihuHandlers({
        idMap,
        useZhihuHeadings: opts.useZhihuHeadings ?? true,
    });

    return await convertMarkdownToZhihuHtml(md, { handlers });
}
