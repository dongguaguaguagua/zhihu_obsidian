import { App, Notice } from "obsidian";
import { Plugin, Transformer } from "unified";
import { visit } from "unist-util-visit";
import type { Parent } from "unist";
import { loadSettings } from "../../src/settings";
import { typst2tex } from "tex2typst";
import i18n, { type Lang } from "../../locales";
import { typstCode2Img } from "../../src/typst";

const locale: Lang = i18n.current;

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
            try {
                const tex = typst2tex(typst);
                node.value = tex;
            } catch (e) {
                console.error(`Typst inline math ${typst} conversion failed`);
                new Notice(`${locale.notice.inlineTypstConvertFailed}`);
            }
        });
        visit(tree, "math", (node: any) => {
            const typstEq = node.value;
            const toPicTask = async () => {
                let imgLink = "";
                try {
                    const presetStyle = settings.typstPresetStyle;
                    const typstContent = `${presetStyle}\n$ ${typstEq} $`;
                    imgLink = await typstCode2Img(typstContent, vault);
                } catch (e) {
                    console.error("Typst display math conversion failed:", e);
                    new Notice(`${locale.notice.typstConvertImgFailed}`);
                    return;
                }
                node.type = "image"; // 转换成 img 节点
                node.url = imgLink;
                node.alt = "";
            };

            const toTeXTask = async () => {
                try {
                    const tex = typst2tex(typstEq);
                    node.value = tex;
                } catch (e) {
                    console.error(
                        `Typst display math ${typstEq} conversion failed`,
                    );
                    new Notice(`${locale.notice.displayTypstConvertFailed}`);
                    return;
                }
            };
            // 在设置中查看如何处理行间公式
            settings.typstDisplayToTeX
                ? tasks.push(toTeXTask()) // 转换成TeX
                : tasks.push(toPicTask()); // 转换成图片
        });
        visit(tree, "code", (node: any) => {
            const typstCode = node.value;
            const lang = node.lang;
            if (lang !== "typrender") {
                return;
            }
            const task = (async () => {
                let imgLink = "";
                try {
                    const presetStyle = settings.typstPresetStyle;
                    const typstContent = `${presetStyle}\n${typstCode}`;
                    imgLink = await typstCode2Img(typstContent, vault);
                } catch (error) {
                    console.error("Typst code conversion failed:", error);
                    new Notice("Typst 转换图片失败，请检查语法是否正确");
                    return;
                }
                node.type = "image"; // 转换成 img 节点
                node.url = imgLink;
                node.alt = "";
            })();
            tasks.push(task);
        });
        await Promise.all(tasks);
    };
    return transformer;
};
