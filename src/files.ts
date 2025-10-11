import { App, Notice, FileSystemAdapter, TFile, normalizePath } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import i18n, { type Lang } from "../locales";
const locale: Lang = i18n.current;

interface FileSearchResult {
    file: TFile;
    path: string;
}

export async function getImgPathFromName(
    app: App,
    fileName: string,
): Promise<string> {
    const vault = app.vault;
    const adapter = vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
        throw new Error("Vault is not using a local file system adapter.");
    }
    const vaultBasePath = adapter.getBasePath();
    // 规范化文件名
    const normalizedName = normalizePath(fileName.trim()).toLowerCase();
    const isPath = normalizedName.includes("/");

    // 支持的扩展名
    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"];
    const hasExtension = imageExtensions.some((ext) =>
        normalizedName.endsWith(ext),
    );

    // 获取所有文件
    const files = vault.getFiles();
    const matches: FileSearchResult[] = [];

    // 提取文件名（不含扩展名）和路径
    let baseName = normalizedName;
    if (!hasExtension) {
        baseName = normalizedName.split("/").pop() || normalizedName;
    }

    // 处理相对路径
    if (normalizedName.startsWith("../") || normalizedName.startsWith("./")) {
        const activeFile = app.workspace.getActiveFile?.();
        if (activeFile) {
            const activeFileAbsPath = path.join(vaultBasePath, activeFile.path);
            const imageAbsPath = path.resolve(
                path.dirname(activeFileAbsPath),
                fileName,
            );

            try {
                if (fs.existsSync(imageAbsPath)) {
                    // new Notice(`图片文件存在: ${imageAbsPath}`);
                    return imageAbsPath;
                }
            } catch (e) {
                new Notice(`图片文件检查异常: ${e}`);
            }
        }
    }

    // 搜索逻辑
    for (const file of files) {
        const filePath = normalizePath(file.path).toLowerCase();
        const fileNameLower = file.name.toLowerCase();

        // 仅处理图片文件
        if (!imageExtensions.some((ext) => filePath.endsWith(ext))) {
            continue;
        }

        // 匹配逻辑
        if (isPath) {
            if (
                filePath === normalizedName ||
                filePath.endsWith(normalizedName)
            ) {
                matches.push({
                    file,
                    path: path.join(vaultBasePath, file.path),
                });
            }
        } else {
            if (
                fileNameLower === baseName ||
                fileNameLower.startsWith(baseName + ".")
            ) {
                matches.push({
                    file,
                    path: path.join(vaultBasePath, file.path),
                });
            }
        }
    }

    // 处理匹配结果
    if (matches.length === 0) {
        new Notice(`${locale.notice.imgSearchFailed}: ${fileName}`);
        return fileName;
    } else if (matches.length === 1) {
        return matches[0].path;
    } else {
        // 多匹配情况下，按路径长度或修改时间排序
        matches.sort(
            (a, b) =>
                a.path.length - b.path.length ||
                b.file.stat.mtime - a.file.stat.mtime,
        );
        return matches[0].path;
    }
}

/**
 * 通过文件名（不含扩展名.md）在整个仓库中查找文件。
 * @param fileName 文件名，例如 "这次化债是不是意味未来大通胀？-黑桦的回答"
 * @returns TFile 对象或 null
 */
export function getFilePathFromName(app: App, fileName: string): TFile | null {
    const allFiles = app.vault.getMarkdownFiles();
    const targetFile = allFiles.find(
        (file: TFile) => file.basename === fileName,
    );
    return targetFile || null;
}
