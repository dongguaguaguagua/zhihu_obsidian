import { Vault, Notice, requestUrl } from "obsidian";
import * as fs from "fs";
import * as crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import * as cookies from "./cookies";
import * as dataUtil from "./data";
import * as file from "./files";
import { loadSettings } from "./settings";
import i18n, { type Lang } from "../locales";
import { App } from "obsidian";
const locale: Lang = i18n.current;

async function getImgIdFromHash(vault: Vault, imgHash: string) {
    try {
        const data = await dataUtil.loadData(vault);
        const cookiesHeader = cookies.cookiesHeaderBuilder(data, [
            "_zap",
            "_xsrf",
            "BEC",
            "d_c0",
            "captcha_session_v2",
            "z_c0",
        ]);
        const response = await requestUrl({
            url: `https://api.zhihu.com/images`,
            headers: {
                "Content-Type": "application/json",
                "accept-language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                // 'referer': `https://zhuanlan.zhihu.com/p/${id}/edit`,
                // 'origin': 'https://zhuanlan.zhihu.com',
                // 'dnt': '1',
                // 'sec-gpc': '1',
                // 'sec-fetch-dest': 'empty',
                // 'sec-fetch-mode': 'cors',
                // 'sec-fetch-site': 'same-site',
                // 'priority': 'u=4',
                Cookie: cookiesHeader,
            },
            method: "POST",
            body: JSON.stringify({
                image_hash: imgHash,
                source: "article",
            }),
        });
        new Notice(`${locale.notice.getImageIdSuccess}`);
        return response.json;
    } catch (error) {
        new Notice(`${locale.notice.getImageIdFailed},${error}`);
    }
}

export async function uploadCover(app: App, cover: string) {
    const match = cover.match(/\[\[(.*?)\]\]/);
    if (!match) {
        new Notice(`${locale.notice.coverSyntaxInvalid}`);
        return;
    } else {
        const imgName = match[1];
        const imgLink = await file.getImgPathFromName(app, imgName);
        const imgBuffer = fs.readFileSync(imgLink);
        const imgOriginalPath = await getZhihuImgLink(app.vault, imgBuffer);
        return imgOriginalPath;
    }
}

async function uploadImg(vault: Vault, imgBuffer: Buffer, uploadToken: any) {
    try {
        const settings = await loadSettings(vault);
        const imgHash = crypto
            .createHash("md5")
            .update(imgBuffer)
            .digest("hex");
        const arrayBuffer = imgBuffer.buffer.slice(
            imgBuffer.byteOffset,
            imgBuffer.byteOffset + imgBuffer.byteLength,
        );
        const fileType = await fileTypeFromBuffer(imgBuffer);
        if (!fileType) throw new Error(locale.error.recognizeFileTypeFailed);
        const mimeType = fileType.mime;
        const requestTime = Date.now();
        const UTCDate = new Date(requestTime).toUTCString();
        const ua = "aliyun-sdk-js/6.8.0 Firefox 137.0 on OS X 10.15";
        const stringToSign = stringToSignBuilder(
            mimeType,
            UTCDate,
            uploadToken.access_token,
            ua,
            imgHash,
        );
        const signature = await calculateSignature(
            uploadToken.access_key,
            stringToSign,
        );
        const request = {
            url: `https://zhihu-pics-upload.zhimg.com/v2-${imgHash}`,
            headers: {
                "User-Agent": settings.user_agent,
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Content-Type": mimeType,
                "Accept-Language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                "x-oss-date": UTCDate,
                "x-oss-user-agent": ua,
                "x-oss-security-token": uploadToken.access_token,
                authorization: `OSS ${uploadToken.access_id}:${signature}`,
                // 'Origin': 'https://zhuanlan.zhihu.com',
                // 'DNT': '1',
                // 'Sec-GPC': '1',
                // 'Referer': 'https://zhuanlan.zhihu.com/',
                // 'Sec-Fetch-Dest': 'empty',
                // 'Sec-Fetch-Mode': 'cors',
                // 'Sec-Fetch-Site': 'cross-site'
            },
            method: "PUT",
            body: arrayBuffer,
        };
        await requestUrl(request);
        new Notice(`${locale.notice.imageUploadSuccess}`);
    } catch (error) {
        new Notice(`${locale.notice.imageUploadFailed},${error}`);
    }
}

async function fetchImgStatus(vault: Vault, id: string, imgId: string) {
    try {
        const data = await dataUtil.loadData(vault);
        const settings = await loadSettings(vault);
        const cookiesHeader = cookies.cookiesHeaderBuilder(data, [
            "_zap",
            "_xsrf",
            "BEC",
            "d_c0",
            "captcha_session_v2",
            "z_c0",
        ]);
        const response = await requestUrl({
            url: `https://api.zhihu.com/images/${imgId}`,
            headers: {
                "User-Agent": settings.user_agent,
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "accept-language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                // 'referer': `https://zhuanlan.zhihu.com/p/${id}/edit`,
                // 'content-type': 'application/json',
                // 'origin': 'https://zhuanlan.zhihu.com',
                // 'dnt': '1',
                // 'sec-gpc': '1',
                // 'sec-fetch-dest': 'empty',
                // 'sec-fetch-mode': 'cors',
                // 'sec-fetch-site': 'same-site',
                // 'priority': 'u=4',
                // 'te': 'trailers',
                Cookie: cookiesHeader,
            },
            method: "GET",
        });
        new Notice(`${locale.notice.getImageStatusSuccess}`);
        return response.json;
    } catch (error) {
        new Notice(`${locale.notice.getImageStatusFailed},${error}`);
    }
}

export async function getZhihuImgLink(vault: Vault, imgBuffer: Buffer) {
    const data = await dataUtil.loadData(vault);
    const fileType = await fileTypeFromBuffer(imgBuffer);
    if (!fileType) throw new Error(locale.error.recognizeFileTypeFailed);
    const hash = crypto.createHash("md5").update(imgBuffer).digest("hex");

    if (
        !data.cache ||
        Object.keys(data.cache).length === 0 ||
        !data.cache.includes(hash) // hash 不在data里面
    ) {
        const getImgIdRes = await getImgIdFromHash(vault, hash);
        // const imgId = getImgIdRes.upload_file.image_id;
        const imgState = getImgIdRes.upload_file.state;
        const uploadToken = getImgIdRes.upload_token;

        if (imgState === 2) {
            await uploadImg(vault, imgBuffer, uploadToken);
        }
        if (typeof data.cache !== "object" || data.cache === null) {
            await dataUtil.updateData(vault, { cache: [hash] });
        } else {
            await dataUtil.updateData(vault, {
                cache: [...data.cache, hash],
            });
        }
    }
    // const imgStatus = await new Promise<any>((resolve, reject) => {
    //   const interval = setInterval(async () => {
    //     try {
    //       const status = await fetchImgStatus(id, imgId);
    //       if (status.status === "success") {
    //         clearInterval(interval);
    //         resolve(status);
    //       }
    //     } catch (err) {
    //       clearInterval(interval);
    //       reject(err);
    //     }
    //   }, 1000);
    // });
    const imgOriginalPath = imgOriginalPathBuilder(hash, fileType.ext);
    return imgOriginalPath;
}

export async function getOnlineImg(vault: Vault, url: string) {
    try {
        const settings = await loadSettings(vault);
        const response = requestUrl({
            url: url,
            headers: {
                "User-Agent": settings.user_agent,
                "Accept-Encoding": "gzip, deflate, br, zstd",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "accept-language":
                    "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
            },
            method: "GET",
            contentType: undefined,
        });
        const arrayBuffer = await response.arrayBuffer;
        const imgBuffer = Buffer.from(arrayBuffer);

        return imgBuffer;
    } catch (err) {
        new Notice(`failed to fetch image:${err}`);
        return Buffer.from([]);
    }
}

function stringToSignBuilder(
    mimeType: string,
    date: string,
    securityToken: string,
    ua: string,
    imgHash: string,
): string {
    const stringToSign = `PUT\n\n${mimeType}\n${date}\nx-oss-date:${date}\nx-oss-security-token:${securityToken}\nx-oss-user-agent:${ua}\n/zhihu-pics/v2-${imgHash}`;
    return stringToSign;
}

async function calculateSignature(
    accessKeySecret: string,
    stringToSign: string,
): Promise<string> {
    const hmac = crypto.createHmac("sha1", accessKeySecret);
    hmac.update(stringToSign);
    const signature = hmac.digest("base64");
    return signature;
}

function imgOriginalPathBuilder(hash: string, ext: string) {
    return `https://picx.zhimg.com/v2-${hash}.${ext}`;
}
