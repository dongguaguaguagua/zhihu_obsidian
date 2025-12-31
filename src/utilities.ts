import { execFile } from "child_process";
import { App, Notice } from "obsidian";

type RequestOptions = {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
};

export function toCurl(options: RequestOptions): string {
    const { url, method = "GET", headers = {}, body } = options;

    const headerParts = Object.entries(headers).map(
        ([key, value]) => `-H "${key}: ${value}"`,
    );

    const methodPart =
        method.toUpperCase() === "GET" ? "" : `-X ${method.toUpperCase()}`;

    const bodyPart = body ? `-d '${body.replace(/'/g, `'\\''`)}'` : "";

    const parts = [
        "curl",
        methodPart,
        `"${url}"`,
        ...headerParts,
        bodyPart,
    ].filter(Boolean); // remove empty strings

    return parts.join(" \\\n  ");
}

export function normalizeStr(str: string | string[] | undefined): string[] {
    if (!str) return [];
    if (typeof str === "string") {
        return [str];
    }
    return str;
}

export function fmtDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day} ${hour}:${minute}`;
}

// 执行命令并等待
export function execFileAsync(cmd: string, args: string[]) {
    return new Promise<void>((resolve, reject) => {
        execFile(cmd, args, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

export function isWebUrl(url: string): boolean {
    try {
        const parsed = new URL(url, "file://"); // 基于 file:// 解析相对路径
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false; // URL 解析失败
    }
}

export async function pickDirectoryDesktop(): Promise<string | null> {
    let electron: any;
    try {
        // Obsidian 桌面端才能 require('electron')
        electron = require("electron");
    } catch {
        new Notice("当前环境不支持系统文件夹选择器（仅桌面端可用）");
        return null;
    }

    const dialog = electron?.remote?.dialog ?? electron?.dialog;
    if (!dialog?.showOpenDialog) {
        new Notice("无法调用系统文件夹选择器");
        return null;
    }

    const result = await dialog.showOpenDialog({
        title: "选择存储目录",
        properties: ["openDirectory", "createDirectory"],
    });

    if (result.canceled) return null;
    const dirPath = result.filePaths?.[0];
    return dirPath ?? null;
}

function tryGetVaultBasePath(app: App): string | null {
    const adapter: any = app.vault.adapter;
    if (adapter && typeof adapter.getBasePath === "function") {
        return adapter.getBasePath();
    }
    if (adapter && typeof adapter.basePath === "string") {
        return adapter.basePath;
    }
    return null;
}

/**
 * 如果 absPath 在 vault 根目录内，返回相对路径（用于 app.vault.createFolder/create）
 * 否则返回 null
 */
export function tryMapAbsPathToVaultRel(
    app: App,
    absPath: string,
): string | null {
    const base = tryGetVaultBasePath(app);
    if (!base) return null;

    const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/g, "");
    const baseN = norm(base);
    const absN = norm(absPath);

    if (!absN.startsWith(baseN + "/") && absN !== baseN) return null;

    const rel = absN.slice(baseN.length).replace(/^\/+/, "");
    // 空字符串代表 vault 根目录，这里不建议直接写根目录，就返回 "zhihu"
    if (!rel) return "zhihu";
    return rel;
}
