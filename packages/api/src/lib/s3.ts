import "./load-env.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isLocalMode } from "./mode.js";

const local = isLocalMode();
const dataDir = process.env.DATA_DIR || "./data";

function localRoot(): string {
  return resolve(dataDir, "uploads");
}

function localPath(key: string): string {
  const root = localRoot();
  const target = resolve(root, key);
  if (target !== root && !target.startsWith(root + "/")) {
    throw new Error("Invalid storage key");
  }
  return target;
}

const s3 = local
  ? null
  : new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "",
        secretAccessKey: process.env.S3_SECRET_KEY || "",
      },
      forcePathStyle: true,
    });

const bucket = process.env.S3_BUCKET || "receipts";

export async function getUploadUrl(key: string): Promise<string> {
  if (local) {
    return `/api/local-uploads?key=${encodeURIComponent(key)}`;
  }
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: "image/png",
  });
  return getSignedUrl(s3!, command, { expiresIn: 300 });
}

export async function getDownloadUrl(key: string): Promise<string> {
  if (local || key.startsWith("text:")) {
    return `/api/local-files?key=${encodeURIComponent(key)}`;
  }
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(s3!, command, { expiresIn: 3600 });
}

export async function putObject(key: string, body: Buffer): Promise<void> {
  const path = localPath(key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

export async function getObject(key: string): Promise<Buffer> {
  if (local || key.startsWith("text:")) {
    return readFileSync(localPath(key));
  }
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  const response = await s3!.send(command);
  const stream = response.Body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function readLocalObject(key: string): Buffer {
  return readFileSync(localPath(key));
}

export { bucket };
