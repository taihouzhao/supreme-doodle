#!/usr/bin/env node
/**
 * 把各游戏 dist/ 同步到 Cloudflare R2 公共桶。
 * 每个站点有独立 prefix；决战朝鲜仍在桶根，删除过期对象时会跳过其它游戏前缀。
 *
 * 需要的环境变量：
 *   CLOUDFLARE_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 *
 * 可选：
 *   R2_ENDPOINT        覆盖默认 endpoint
 *   DEPLOY_GAME=id     只同步 catalog 中的某一个站点
 *   DRY_RUN=1          只打印不上传
 */
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { GAMES } from "./catalog.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dryRun = process.env.DRY_RUN === "1";
const accountId = required("CLOUDFLARE_ACCOUNT_ID");
const accessKeyId = required("R2_ACCESS_KEY_ID");
const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
const bucket = required("R2_BUCKET_NAME");
const endpoint = process.env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`;
const onlyId = process.env.DEPLOY_GAME;

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
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function required(name) {
  const value = process.env[name];
  if (dryRun && !value) return "dry-run";
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

function objectKey(distDir, prefix, filePath) {
  const rel = relative(distDir, filePath).split("\\").join("/");
  return prefix ? `${prefix}/${rel}` : rel;
}

function uploadKeys(distDir, prefix, filePath) {
  const key = objectKey(distDir, prefix, filePath);
  if (!prefix || relative(distDir, filePath).split("\\").join("/") !== "index.html") return [key];
  // R2 custom domains do not apply an index document to virtual prefixes.
  // Uploading the same document at `prefix/` makes /<prefix>/ directly playable.
  return [key, `${prefix}/`];
}

function headersFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";
  const hashedAsset = /\/assets\/.+\.[a-f0-9]{8,}\./i.test(filePath.replace(/\\/g, "/"));
  const cacheControl =
    ext === ".html"
      ? "public, max-age=0, must-revalidate"
      : hashedAsset
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600";
  return { contentType, cacheControl };
}

async function listRemoteKeys(prefix) {
  if (dryRun) return [];
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

async function deleteKeys(keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    for (const key of chunk) console.log(`  DEL  ${key}`);
    if (dryRun) continue;
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

async function syncGame(game) {
  const distDir = resolve(repoRoot, game.dist);
  if (!existsSync(distDir)) {
    console.error(`目录 ${game.dist} 不存在，请先运行 npm run build`);
    process.exit(1);
  }
  const localFiles = walk(distDir);
  if (localFiles.length === 0) {
    console.error(`目录 ${game.dist} 为空，请先运行 npm run build`);
    process.exit(1);
  }

  const prefix = (game.prefix ?? "").replace(/^\/+|\/+$/g, "");
  const uploadEntries = localFiles.flatMap((file) => uploadKeys(distDir, prefix, file).map((key) => ({ file, key })));
  const localKeys = new Set(uploadEntries.map(({ key }) => key));
  const preserve = game.preservePrefixes ?? [];

  console.log(`\n==> ${game.name} (${game.id})`);
  console.log(`准备同步 ${uploadEntries.length} 个对象 → s3://${bucket}${prefix ? `/${prefix}` : ""}`);

  for (const { file, key } of uploadEntries) {
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

  const remoteKeys = await listRemoteKeys(prefix);
  const stale = remoteKeys.filter((key) => {
    if (localKeys.has(key)) return false;
    if (!prefix && preserve.some((keep) => key === keep.replace(/\/$/, "") || key.startsWith(keep))) {
      return false;
    }
    return true;
  });
  if (stale.length > 0) {
    console.log(`删除远端多余的 ${stale.length} 个对象`);
    await deleteKeys(stale);
  }
}

async function main() {
  const games = onlyId ? GAMES.filter((game) => game.id === onlyId) : GAMES;
  if (games.length === 0) {
    console.error(`DEPLOY_GAME=${onlyId} 不在 catalog 中：${GAMES.map((g) => g.id).join(", ")}`);
    process.exit(1);
  }

  console.log(`endpoint: ${endpoint}${dryRun ? " (DRY RUN)" : ""}`);
  for (const game of games) await syncGame(game);

  if (dryRun) {
    console.log("\nDRY RUN 完成，未写入远端。");
    return;
  }

  console.log("\n同步完成。");
  for (const game of games) console.log(`  ${game.name}: ${game.url}`);
  console.log("若尚未开启公共访问：R2 → 桶 → Settings → Public Development URL / Custom Domains");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
