import { unified, Plugin, Transformer } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeFormat from "rehype-format";
import { syntax } from "micromark-extension-wiki-link";
import { fromMarkdown, toMarkdown } from "mdast-util-wiki-link";
import { visit } from "unist-util-visit";
import { u } from "unist-builder";
import type { Element } from "hast";
import type { Link, Image } from "mdast";
import { Vault, Notice, App, TFile } from "obsidian";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import type { Parent, Node } from "unist";
import { loadSettings } from "./settings";
import { getOnlineImg, getZhihuImgLink } from "./image_service";
import * as file from "./files";
import * as fs from "fs";
import * as path from "path";
import remarkCallout from "@r4ai/remark-callout";
import remarkBreaks from "remark-breaks";
import { mathFromMarkdown, mathToMarkdown } from "mdast-util-math";
import { math } from "micromark-extension-math";
import * as mermaid from "./mermaid";
import { typst2tex } from "tex2typst";
import i18n, { type Lang } from "../locales";
import rehypeRaw from "rehype-raw";
import { typstCode2Img } from "./typst";
import { isWebUrl } from "./utilities";

const locale = i18n.current;

// edit from `https://github.com/landakram/mdast-util-wiki-link/blob/master/src/from-markdown.ts`
// line 20-28
interface WikiLinkNode extends Node {
    type: "wikiLink";
    value: string;
    data: {
        alias: string;
        permalink: string;
        exists: boolean;
        hName?: string;
        hProperties?: {
            src: string;
            "data-caption": string;
            "data-size": string;
            "data-watermark": string;
            "data-original-src": string;
            "data-watermark-src": string;
            "data-private-watermark-src": string;
        };
        hChildren: [];
    };
}

function mathPlugin(this: any) {
    const settings = this || {};
    const data = this.data();

    const micromarkExtensions =
        data.micromarkExtensions || (data.micromarkExtensions = []);
    const fromMarkdownExtensions =
        data.fromMarkdownExtensions || (data.fromMarkdownExtensions = []);
    const toMarkdownExtensions =
        data.toMarkdownExtensions || (data.toMarkdownExtensions = []);

    micromarkExtensions.push(math(settings));
    fromMarkdownExtensions.push(mathFromMarkdown());
    toMarkdownExtensions.push(mathToMarkdown(settings));
}

function wikiLinkPlugin(this: any, opts = {}) {
    const data = this.data();

    function add(field: any, value: any) {
        if (data[field]) data[field].push(value);
        else data[field] = [value];
    }

    add("micromarkExtensions", syntax(opts));
    add("fromMarkdownExtensions", fromMarkdown(opts));
    add("toMarkdownExtensions", toMarkdown(opts));
}

// 获取![alt](link)格式的图片，先下载到本地，
// 再上传到知乎，获得链接URL，最后转换为知乎HTML
// 获取![[link|alt]]格式的本地图片，再上传到知乎
export const remarkZhihuImgs: Plugin<[App], Parent, Parent> = (app) => {
    const vault = app.vault;
    // 处理图片和Mermaid代码块的转换
    const transformer: Transformer<Parent, Parent> = async (tree) => {
        const settings = await loadSettings(vault);
        const tasks: Promise<void>[] = [];
        visit(tree, "image", (node: Image) => {
            const task = (async () => {
                let alt = node.alt;
                const url = node.url || "";
                // 自动判断是否是HTTP/HTTPS协议
                // 如果是则获取在线图片，否则按照原路经处理
                let imgBuffer: Buffer;
                if (isWebUrl(url)) {
                    imgBuffer = await getOnlineImg(vault, url);
                } else {
                    const imgPathOnDisk = await file.getFilePathFromName(
                        app,
                        url,
                    );
                    imgBuffer = fs.readFileSync(imgPathOnDisk);
                }
                const imgLink = await getZhihuImgLink(vault, imgBuffer);
                if (!alt) {
                    // 如果alt为空，则通过设置判断是否加alt
                    alt = settings.useImgNameDefault ? imgLink : "";
                }
                node.url = imgLink;
                node.data = {
                    ...node.data,
                    hName: "img",
                    hProperties: {
                        src: imgLink,
                        "data-caption": alt,
                        "data-size": "normal",
                        "data-watermark": "watermark",
                        "data-original-src": imgLink,
                        "data-watermark-src": "",
                        "data-private-watermark-src": "",
                    },
                    hChildren: [],
                };
            })();
            tasks.push(task);
        });
        visit(tree, "wikiLink", (node: WikiLinkNode) => {
            const task = (async () => {
                let alt = node.data.alias;
                const imgName = node.value;
                // new Notice(`正在处理图片: ${imgName}`);
                const imgPathOnDisk = await file.getFilePathFromName(
                    app,
                    imgName,
                );
                try {
                    const imgBuffer = fs.readFileSync(imgPathOnDisk);
                    const imgLink = await getZhihuImgLink(vault, imgBuffer);
                    if (alt === imgName) {
                        // 图片名称和alt相同，说明没加alt，则通过设置判断是否加alt
                        alt = settings.useImgNameDefault
                            ? path.basename(imgName)
                            : "";
                    }
                    (node as any).type = "image";
                    (node as any).url = imgLink;
                    (node as any).alt = alt;
                    node.data = {
                        ...node.data,
                        hName: "img",
                        hProperties: {
                            src: imgLink,
                            "data-caption": alt,
                            "data-size": "normal",
                            "data-watermark": "watermark",
                            "data-original-src": imgLink,
                            "data-watermark-src": "",
                            "data-private-watermark-src": "",
                        },
                        hChildren: [],
                    };
                } catch (error) {
                    new Notice(`图片读取失败: ${error.message}`);
                }
                // new Notice(`图片处理完成: ${imgPathOnDisk}`);
            })();
            tasks.push(task);
        });
        visit(tree, "code", (node: any) => {
            if (node.lang !== "mermaid") {
                return;
            }

            const task = (async () => {
                try {
                    // 使用Obsidian API渲染Mermaid代码块以获取SVG
                    const mermaidCode = node.value;
                    const container = document.createElement("div");
                    await mermaid.renderMermaid(mermaidCode, container);
                    const svgEl = container.querySelector("svg");
                    if (!svgEl) return;
                    let svgString = svgEl.outerHTML;
                    svgString = mermaid.cleanSvg(svgString); // 将svg中的动态变量变成具体值
                    const imgBuffer = await mermaid.svgToPngBuffer(
                        svgString,
                        settings.mermaidScale,
                    );

                    // 上传图片到知乎
                    const imgLink = await getZhihuImgLink(vault, imgBuffer);
                    if (!imgLink) {
                        console.error(locale.error.uploadMermaidImgFailed);
                        return;
                    }

                    // 将代码块节点替换为图片节点
                    const alt = "";
                    node.type = "image"; // 改变节点类型
                    node.url = imgLink;
                    node.alt = alt;
                    node.data = {
                        ...node.data,
                        hName: "img",
                        hProperties: {
                            src: imgLink,
                            "data-caption": alt,
                            "data-size": "normal",
                            "data-watermark": "watermark",
                            "data-original-src": imgLink,
                            "data-watermark-src": "",
                            "data-private-watermark-src": "",
                        },
                        hChildren: [],
                    };
                } catch (error) {
                    console.error(locale.error.errorHandlingMermaid, error);
                }
            })();
            tasks.push(task);
        });
        await Promise.all(tasks);
    };
    return transformer;
};

export const remarkTypst: Plugin<[App], Parent, Parent> = (app) => {
    const vault = app.vault;
    const transformer: Transformer<Parent, Parent> = async (tree) => {
        const settings = await loadSettings(vault);
        const tasks: Promise<void>[] = [];
        if (settings.typstMode === false) {
            return;
        }
        visit(tree, "inlineMath", (node: any) => {
            const typst = node.value;
            const tex = typst2tex(typst);
            node.value = tex;
        });
        visit(tree, "math", (node: any) => {
            const typstEq = node.value;
            const toPicTask = (async () => {
                try {
                    const presetStyle = settings.typstPresetStyle;
                    const typstContent = `${presetStyle}\n$ ${typstEq} $`;
                    const imgLink = await typstCode2Img(typstContent, vault);
                    node.type = "image"; // 转换成 img 节点
                    node.url = imgLink;
                    node.alt = "";
                } catch (error) {
                    console.error("Typst equation conversion failed:", error);
                    return;
                }
            })();
            const toTeXTask = (async () => {
                const tex = typst2tex(typstEq);
                node.value = tex;
            })();
            // 在设置中查看如何处理行间公式
            settings.typstDisplayToTeX
                ? tasks.push(toTeXTask) // 转换成TeX
                : tasks.push(toPicTask); // 转换成图片
        });
        visit(tree, "code", (node: any) => {
            const typstCode = node.value;
            const lang = node.lang;
            if (lang !== "typrender") {
                return;
            }
            const task = (async () => {
                try {
                    const presetStyle = settings.typstPresetStyle;
                    const typstContent = `${presetStyle}\n${typstCode}`;
                    const imgLink = await typstCode2Img(typstContent, vault);
                    node.type = "image"; // 转换成 img 节点
                    node.url = imgLink;
                    node.alt = "";
                } catch (error) {
                    console.error("Typst code conversion failed:", error);
                }
            })();
            tasks.push(task);
        });
        await Promise.all(tasks);
    };
    return transformer;
};

export async function remarkMdToHTML(app: App, md: string) {
    const idMap = new Map<string, number>(); // 原始id → 新编号
    const zhihuHandlers = {
        link(state: any, node: Link): Element {
            const properties: { [key: string]: string } = {};
            if (node.title === "card") {
                // EXAMPLE:
                // [Github](https://github.com/ "card")
                // <a data-draft-node="block" data-draft-type="link-card" href="https://github.com/">Github</a>
                properties["data-draft-node"] = "block";
                properties["data-draft-type"] = "link-card";
                properties.href = node.url;
            } else if (node.title && node.title.includes("member_mention")) {
                // EXAMPLE:
                // [@Dong](https://www.zhihu.com/people/dong-jun-kai "member_mention_ed006411b00ce202f72d45c413246050")
                // <a class="member_mention" href="/people/dong-jun-kai" data-hash="ed006411b00ce202f72d45c413246050">@Dong</a>
                const hash = node.title.replace("member_mention_", "");
                const peopleId = node.url.replace(
                    "https://www.zhihu.com/people/",
                    "",
                );
                properties.class = "member_mention";
                properties.href = `/people/${peopleId}`;
                properties["data-hash"] = hash;
            } else {
                // EXAMPLE:
                // [Github](https://github.com/)
                // <a href="https://github.com/">Github</a>
                properties.href = node.url;
            }

            return {
                type: "element",
                tagName: "a",
                properties,
                children: state.all(node),
            };
        },
        inlineMath(state: any, node: any): Element {
            const eq = node.value;
            const alt = eq.replace(/[\n\r]/g, " ");
            const encoded = encodeURI(eq);
            return {
                type: "element",
                tagName: "img",
                properties: {
                    eeimg: "1",
                    src: `//www.zhihu.com/equation?tex=${encoded}`,
                    alt: alt,
                },
                children: [],
            };
        },
        math(state: any, node: any): Element {
            const eq = node.value + "\\\\";
            const alt = eq.replace(/[\n\r]/g, " ");
            const encoded = encodeURI(eq);
            return {
                type: "element",
                tagName: "p",
                properties: {},
                children: [
                    {
                        type: "element",
                        tagName: "img",
                        properties: {
                            eeimg: "1",
                            src: `//www.zhihu.com/equation?tex=${encoded}`,
                            alt: alt,
                        },
                        children: [],
                    },
                ],
            };
        },
        // EXAMPLE:
        // ```python
        // print("hello")
        // ```
        // <pre lang="python">
        // print("hello")
        // </pre>
        code(state: any, node: any): Element {
            const lang = node.lang || "";
            const code = node.value ? node.value.trim() : "";
            return {
                type: "element",
                tagName: "pre",
                properties: { lang: lang },
                children: [u("text", code)],
            };
        },
        table(state: any, node: any): Element {
            // EXAMPLE:
            // <table data-draft-node="block" data-draft-type="table" data-size="normal"><tbody>
            // <tr><th>水果</th><th>英文</th></tr>
            // <tr><td>苹果</td><td>apple</td></tr>
            // </tbody></table>
            const rows = state.all(node) as Element[];
            const tbody: Element = u(
                "element",
                { tagName: "tbody", properties: {} },
                rows,
            );

            return {
                type: "element",
                tagName: "table",
                properties: {
                    "data-draft-node": "block",
                    "data-draft-type": "table",
                    "data-size": "normal",
                },
                children: [tbody],
            };
        },
        // EXAMPLE:
        // <sup data-text="注释文本" data-url="https://www.github.com"
        // data-draft-node="inline" data-draft-type="reference"
        // data-numero="1">[1]</sup>
        footnoteReference(state: any, node: any): Element {
            const rawId = String(node.identifier).toUpperCase(); // 标准化 id（内部存的是大写）
            // 分配新编号
            let numero = idMap.get(rawId);
            if (!numero) {
                numero = idMap.size + 1;
                idMap.set(rawId, numero);
            }
            // 从 state.footnoteById 拿到 FootnoteDefinition 节点
            const def = state.footnoteById.get(rawId);
            if (!def) {
                // 没找到定义就直接渲染一个普通的 [1]
                return {
                    type: "element",
                    tagName: "sup",
                    properties: {},
                    children: [{ type: "text", value: `[${numero}]` }],
                };
            }

            // 解析 def.children[0]（第一个段落）里的文本和链接
            const para = def.children[0];
            let text = "";
            let url = "";
            for (const child of para.children as any[]) {
                if (child.type === "text") text += child.value.trim();
                if (child.type === "link") url = child.url;
            }

            return {
                type: "element",
                tagName: "sup",
                properties: {
                    "data-text": text,
                    "data-url": url,
                    "data-draft-node": "inline",
                    "data-draft-type": "reference",
                    "data-numero": String(numero),
                },
                children: [u("text", `[${numero}]`)],
            };
        },

        footnoteDefinition(): undefined {
            return;
        },
        // 如果是一个#，则是二级标题<h2>
        // 如果是两个#，则是三级标题<h3>
        // 如果是三个及以上的#，则是加粗处理
        heading(state: any, node: any): Element {
            const children = state.all(node) as Element[];

            switch (node.depth) {
                case 1:
                    return {
                        type: "element",
                        tagName: "h2",
                        properties: {},
                        children,
                    };
                case 2:
                    return {
                        type: "element",
                        tagName: "h3",
                        properties: {},
                        children,
                    };
                default:
                    return {
                        type: "element",
                        tagName: "p",
                        properties: {},
                        children: [
                            {
                                type: "element",
                                tagName: "strong",
                                properties: {},
                                children,
                            },
                        ],
                    };
            }
        },

        blockquote(state: any, node: any): Element {
            // 如果不存在callout，说明是普通引用块，则返回原本结果
            if (node?.data?.hProperties?.dataCallout === undefined) {
                return {
                    type: "element",
                    tagName: "blockquote",
                    properties: {},
                    children: state.all(node),
                };
            }
            const props = node.data?.hProperties || {};
            // ignore类型直接返回空 p
            // EXAMPLE:
            // > [!ignore] Title
            // > some text
            const ignoreType = ["ignore", "忽略", "注释"];
            if (ignoreType.includes(props.dataCalloutType)) {
                return {
                    type: "element",
                    tagName: "p",
                    properties: {},
                    children: [],
                };
            }

            // 找到标题段落（带有 dataCalloutTitle）
            const titleParagraph = node.children.find(
                (child: any) => child.data?.hProperties?.dataCalloutTitle,
            );

            // 提取标题文本
            const titleText = titleParagraph?.children?.[0]?.value ?? "";

            // 提取正文（去掉 title 节点和嵌套 blockquote）
            const contentNodes = node.children
                .filter((child: any) => {
                    const hName = child.data?.hName;
                    return (
                        hName !== "div" ||
                        !child.data?.hProperties?.dataCalloutTitle
                    );
                })
                .flatMap((child: any) => {
                    // 若是嵌套 blockquote 包含 dataCalloutBody，取其子项
                    if (
                        child.type === "blockquote" &&
                        child.data?.hProperties?.dataCalloutBody
                    ) {
                        return child.children ?? [];
                    }
                    return [child];
                });

            return {
                type: "element",
                tagName: "p",
                properties: {},
                children: [
                    {
                        type: "element",
                        tagName: "strong",
                        properties: {},
                        children: [u("text", titleText)],
                    },
                    ...state.all({ children: contentNodes }),
                ],
            };
        },
    };
    const rehypeOpts: RemarkRehypeOptions = {
        allowDangerousHtml: true,
        handlers: zhihuHandlers,
    };
    const output = await unified()
        .use(remarkParse)
        .use(remarkGfm) // 解析脚注、表格等
        .use(mathPlugin) // 解析数学公式
        .use(wikiLinkPlugin) // 解析 Obsidian 风格的图片链接
        .use(remarkCallout) // 解析 Obsidian 风格的 Callout
        .use(remarkBreaks) // 换行符换行
        .use(remarkTypst, app) // 将数学公式转换为 Typst 或者图片节点
        .use(remarkZhihuImgs, app) // 将上面解析的图片节点和维基链接节点转换为知乎图片
        .use(remarkRehype, undefined, rehypeOpts) // 转换其余不需要异步的节点
        .use(rehypeRaw) // 解析 HTML 标签
        // .use(rehypeFormat, { indent: 0 }) // 会导致行内公式被强制换行
        .use(rehypeStringify)
        .process(md);

    const htmlOutput = String(output);
    console.log(htmlOutput);
    return htmlOutput;
}

// 由于中间换行不会被检测到，所以需要将所有\n替换成break节点。
// function replaceTextWithBreaks(node: any): any[] {
//     if (node.type === "text") {
//         const parts = node.value.split(/\n/);
//         const result = [];

//         for (let i = 0; i < parts.length; i++) {
//             result.push(u("text", parts[i]));
//             if (i < parts.length - 1) {
//                 result.push({
//                     type: "break",
//                 });
//             }
//         }

//         return result;
//     }

//     // 如果是段落、强调等元素，也递归处理它的 children
//     if (node.children && Array.isArray(node.children)) {
//         return [
//             {
//                 ...node,
//                 children: node.children.flatMap(replaceTextWithBreaks),
//             },
//         ];
//     }

//     return [node];
// }
