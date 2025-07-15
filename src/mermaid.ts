import { loadMermaid } from "obsidian";

/**
 * Renders Mermaid code into a container element.
 * @param mermaidCode The Mermaid diagram syntax.
 * @param container The HTMLElement to render the diagram into.
 */
export async function renderMermaid(
    mermaidCode: string,
    container: HTMLElement,
): Promise<void> {
    const mermaid = await loadMermaid(); // 1. 加载 Obsidian 内置的 Mermaid 渲染器
    const elementId = "mermaid-svg-" + Math.random().toString(36).substring(2); // 创建唯一的 ID
    const { svg } = await mermaid.render(elementId, mermaidCode);
    container.innerHTML = svg;
}

export function svgToDataURL(svgString: string): string {
    // 对SVG字符串进行URI编码，以处理特殊字符
    const encodedSvg = encodeURIComponent(svgString);
    return `data:image/svg+xml;charset=utf-8,${encodedSvg}`;
}

export function cleanSvg(svgString: string): string {
    const cssVarRegex = /var\((--[\w-]+)\)/g;
    const computedStyle = getComputedStyle(document.body);
    return svgString.replace(cssVarRegex, (match, varName) => {
        return computedStyle.getPropertyValue(varName).trim();
    });
}

export async function svgToPngBuffer(svgString: string): Promise<Buffer> {
    const dataUrl = svgToDataURL(svgString);

    // 创建一个Image对象
    const image = new Image();

    return new Promise((resolve, reject) => {
        image.onload = () => {
            // 图片加载成功后，创建Canvas
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d");

            if (!ctx) {
                return reject(new Error("无法获取Canvas 2D上下文"));
            }

            // 将图片绘制到Canvas上
            ctx.drawImage(image, 0, 0);

            // 从Canvas获取PNG格式的Blob对象
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    return reject(new Error("无法从Canvas生成Blob"));
                }
                // 将Blob转换为ArrayBuffer
                const arrayBuffer = await blob.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                resolve(buffer);
            }, "image/png");
        };

        image.onerror = (error) => {
            reject(new Error(`加载SVG图片失败: ${error}`));
        };

        // 设置Image的源为我们的Data URL
        image.src = dataUrl;
    });
}
