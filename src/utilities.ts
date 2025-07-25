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
