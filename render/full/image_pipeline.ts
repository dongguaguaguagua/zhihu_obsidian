import { Vault, Notice, App } from "obsidian";
import { Plugin, Transformer } from "unified";
import { visit } from "unist-util-visit";
import type { Parent, Node } from "unist";
import type { Image, Code } from "mdast";
import type { ZhihuSettings } from "../../src/settings";
import { loadSettings } from "../../src/settings";
import { getOnlineImg, getZhihuImg, getImgDimensions } from "../../src/image_service";
import * as file from "../../src/files";
import * as path from "path";
import * as mermaid from "../../src/mermaid";
import { isWebUrl, toArrayBuffer } from "../../src/utilities";
import { fileTypeFromBuffer } from "file-type";

// edit from `https://github.com/landakram/mdast-util-wiki-link/blob/master/src/from-markdown.ts`
// line 20-28
interface WikiImgLinkNode extends Node {
    type: "wikiImgLink";
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
            "data-rawwidth": string;
            "data-rawheight": string;
            "data-watermark": string;
            "data-original-src": string;
            "data-watermark-src": string;
            "data-private-watermark-src": string;
        };
        hChildren: [];
    };
}

// ===================================================
// 获取![alt](link)格式的图片，先下载到本地，
// 再上传到知乎，获得链接URL，最后转换为知乎HTML
// 获取![[link|alt]]格式的本地图片，再上传到知乎
// ===================================================
export const remarkZhihuImgs: Plugin<[App], Parent, Parent> = (app) => {
    const vault = app.vault;
    const transformer: Transformer<Parent, Parent> = async (tree) => {
        const settings = await loadSettings(vault);
        const tasks: Promise<void>[] = [];

        visit(tree, "image", (node) => {
            tasks.push(handleMdImage(app, vault, settings, node));
        });

        visit(tree, "wikiImgLink", (node, idx, par) => {
            tasks.push(handleWikiImg(app, vault, settings, node, par, idx));
        });

        visit(tree, "code", (node, idx, par) => {
            tasks.push(handleMermaid(vault, settings, node, par, idx));
        });

        await Promise.all(tasks);
    };
    return transformer;
};

async function bufferToZhihuImageNode(
    vault: Vault,
    imgArrayBuffer: ArrayBuffer,
    alt: string,
): Promise<Image> {
    const imgRes = await getZhihuImg(vault, imgArrayBuffer);
    const fileType = await fileTypeFromBuffer(new Uint8Array(imgArrayBuffer));
    if (!fileType) {
        new Notice("无法识别图片类型");
        throw new Error("无法识别图片类型");
    }

    const ext = fileType.ext;
    const { width, height } = getImgDimensions(imgArrayBuffer);
    const url = `${imgRes.original_src}.${ext}`;

    return {
        type: "image",
        url,
        alt,
        data: {
            hName: "img",
            hProperties: {
                src: url,
                "data-caption": alt,
                "data-size": "normal",
                "data-rawwidth": `${width}`,
                "data-rawheight": `${height}`,
                "data-watermark": `${imgRes.watermark}`,
                "data-original-src": url,
                "data-watermark-src": `${imgRes.watermark_src}.${ext}`,
                "data-private-watermark-src": "",
            },
            hChildren: [],
        },
    };
}

function replaceNode(
    parent: Parent | null,
    index: number | null,
    oldNode: Node,
    newNode: Node,
) {
    if (parent && typeof index === "number") {
        parent.children[index] = newNode;
    } else {
        Object.assign(oldNode, newNode);
    }
}
// 处理 markdown 格式的图片
async function handleMdImage(
    app: App,
    vault: Vault,
    settings: ZhihuSettings,
    node: Image,
) {
    let alt = node.alt;
    const decodedUrl = decodeURIComponent(node.url ?? "");

    let imgArrayBuffer: ArrayBuffer;

    if (isWebUrl(decodedUrl)) {
        imgArrayBuffer = await getOnlineImg(vault, decodedUrl);
    } else {
        imgArrayBuffer = await file.getImgBufferFromName(app, decodedUrl);
    }

    if (!alt) {
        alt = settings.useImgNameDefault ? decodedUrl : "";
    }

    const imageNode = await bufferToZhihuImageNode(vault, imgArrayBuffer, alt);

    node.url = imageNode.url;
    node.data = imageNode.data;
}
// 处理 ![[link]] 图片
async function handleWikiImg(
    app: App,
    vault: Vault,
    settings: ZhihuSettings,
    node: WikiImgLinkNode,
    parent: Parent | null,
    index: number | null,
) {
    let alt = node.data.alias;
    const imgName = node.value;

    if (alt === imgName) {
        alt = settings.useImgNameDefault ? path.basename(imgName) : "";
    }

    const imgData = await file.getImgBufferFromName(app, imgName);
    const imageNode = await bufferToZhihuImageNode(vault, imgData, alt);

    replaceNode(parent, index, node, imageNode);
}
// 处理mermaid图片
async function handleMermaid(
    vault: Vault,
    settings: ZhihuSettings,
    node: Code,
    parent: Parent | null,
    index: number | null,
) {
    if (node.lang !== "mermaid") return;

    const container = document.createElement("div");
    await mermaid.renderMermaid(node.value, container);

    const svgEl = container.querySelector("svg");
    if (!svgEl) return;

    const svg = mermaid.cleanSvg(svgEl.outerHTML);
    const imgData = await mermaid.svgToPngBuffer(svg, settings.mermaidScale);
    const imgArrayBuffer = toArrayBuffer(imgData);

    const imageNode = await bufferToZhihuImageNode(vault, imgArrayBuffer, "");
    replaceNode(parent, index, node, imageNode);
}
