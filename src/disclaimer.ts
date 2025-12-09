type DisclaimerResult = {
    type: string;
    status: string;
};

type DisclaimerItem = {
    type: string;
    description: string;
};

const DISCLAIMER_DICT: DisclaimerItem[] = [
    { type: "spoiler", description: "包含剧透" },
    { type: "spoiler", description: "内容包含剧透" },
    { type: "medical_advice", description: "包含医疗建议" },
    { type: "medical_advice", description: "内容包含医疗建议" },
    { type: "fictional_creation", description: "虚构创作" },
    { type: "contain_finance", description: "包含理财内容" },
    { type: "ai_creation", description: "包含 AI 辅助创作" },
    { type: "ai_creation", description: "包含 ai 辅助创作" },
    { type: "ai_creation", description: "包含AI辅助创作" },
    { type: "ai_creation", description: "包含ai辅助创作" },
];

// 中文 → 英文
const descriptionToTypeMap = new Map<string, string>(
    DISCLAIMER_DICT.map((item) => [item.description, item.type]),
);
export function parseDisclaimer(rawDisclaimer: unknown): DisclaimerResult {
    let description: string | undefined;

    if (Array.isArray(rawDisclaimer)) {
        // 数组：只取第一个
        if (rawDisclaimer.length === 0) {
            return { type: "none", status: "closed" };
        }
        if (typeof rawDisclaimer[0] === "string") {
            description = rawDisclaimer[0].trim();
        }
    } else if (typeof rawDisclaimer === "string") {
        description = rawDisclaimer.trim();
    }

    if (!description) {
        return { type: "none", status: "closed" };
    }

    const mappedType = descriptionToTypeMap.get(description);

    if (!mappedType) {
        return { type: "none", status: "closed" };
    }

    return {
        type: mappedType,
        status: "open",
    };
}
