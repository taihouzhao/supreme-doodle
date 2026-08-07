#!/usr/bin/env node
/**
 * 把 dist/ 同步到 Cloudflare R2 公共桶。
 *
 * 需要的环境变量：
 *   CLOUDFLARE_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 *
 * 可选：
 *   R2_PREFIX          上传到桶内子目录（默认空，即桶根）
 *   R2_ENDPOINT        覆盖默认 endpoint
 *   DRY_RUN=1          只打印不上传
 */
import { createReadStream, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const accountId = required("CLOUDFLARE_ACCOUNT_ID");
const accessKeyId = required("R2_ACCESS_KEY_ID");
const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
const bucket = required("R2_BUCKET_NAME");
const prefix = (process.env.R2_PREFIX ?? "").replace(/^\/+|\/+$/g, "");
const endpoint = process.env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`;
const distDir = process.env.DIST_DIR ?? "dist";
const dryRun = process.env.DRY_RUN === "1";

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`缺少环境变量 ${name}`);
    process.exit(1);
  }
  return value;
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function objectKey(filePath) {
  const rel = relative(distDir, filePath).split("\\").join("/");
  return prefix ? `${prefix}/${rel}` : rel;
}

function headersFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";
  // HTML 必须随时能拿到新版本；带 hash 的静态资源可以长缓存
  const hashedAsset = /\/assets\/.+\.[a-f0-9]{8,}\./i.test(filePath.replace(/\\/g, "/"));
  const cacheControl =
    ext === ".html"
      ? "public, max-age=0, must-revalidate"
      : hashedAsset
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600";
  return { contentType, cacheControl };
}

async function listRemoteKeys() {
  const keys = [];
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix ? `${prefix}/` : undefined,
        ContinuationToken: token,
      }),
    );
    for (const item of page.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function main() {
  const localFiles = walk(distDir);
  if (localFiles.length === 0) {
    console.error(`目录 ${distDir}/ 为空，请先运行 npm run build`);
    process.exit(1);
  }

  const localKeys = new Set(localFiles.map(objectKey));
  console.log(`准备同步 ${localFiles.length} 个文件 → s3://${bucket}${prefix ? `/${prefix}` : ""}`);
  console.log(`endpoint: ${endpoint}${dryRun ? " (DRY RUN)" : ""}`);

  for (const file of localFiles) {
    const key = objectKey(file);
    const { contentType, cacheControl } = headersFor(file);
    console.log(`  PUT  ${key}  (${contentType})`);
    if (dryRun) continue;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(file),
        ContentType: contentType,
        CacheControl: cacheControl,
      }),
    );
  }

  if (dryRun) {
    console.log("DRY RUN 完成，未写入远端。");
    return;
  }

  const remoteKeys = await listRemoteKeys();
  const stale = remoteKeys.filter((key) => !localKeys.has(key));
  if (stale.length > 0) {
    console.log(`删除远端多余的 ${stale.length} 个对象`);
    for (let i = 0; i < stale.length; i += 1000) {
      const chunk = stale.slice(i, i + 1000);
      for (const key of chunk) console.log(`  DEL  ${key}`);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  console.log("同步完成。");
  console.log("若尚未开启公共访问：R2 → 桶 → Settings → Public Development URL / Custom Domains");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
