import { NextResponse } from "next/server";
import { blobList, blobDelete } from "../../utils/blobCache";

const SIZE_LIMIT = 1_000_000_000;
const CLEANUP_THRESHOLD = 900_000_000;
const BLOB_PREFIXES = ["simulations/", "abis/", "signatures/"];

async function listAllBlobs() {
  const all = [];
  for (const prefix of BLOB_PREFIXES) {
    const blobs = await blobList(prefix);
    all.push(...blobs);
  }
  return all;
}

export async function GET(request) {
  if (request.headers.get("x-vercel-cron") !== "1") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blobs = await listAllBlobs();
  const totalSize = blobs.reduce((sum, b) => sum + b.size, 0);

  if (totalSize < CLEANUP_THRESHOLD) {
    return NextResponse.json({
      totalSize,
      deleted: 0,
      message: "Under threshold, no cleanup needed",
    });
  }

  blobs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));

  let remaining = totalSize;
  const toDelete = [];
  for (const blob of blobs) {
    if (remaining <= SIZE_LIMIT) break;
    toDelete.push(blob.url);
    remaining -= blob.size;
  }

  if (toDelete.length > 0) {
    await blobDelete(toDelete);
  }

  return NextResponse.json({
    totalSize,
    deleted: toDelete.length,
    remainingSize: remaining,
  });
}
