import { supabase } from "../../lib/supabase";

const BADGE_ICON_BUCKET = "badges";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function getBadgeIconFileExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (!["png", "jpg", "jpeg"].includes(extension)) {
    throw new Error("Badge icons must be PNG or JPEG images.");
  }

  return extension;
}

function buildBadgeIconFileName(file: File) {
  const extension = getBadgeIconFileExtension(file);
  return `${crypto.randomUUID()}.${extension}`;
}

export async function uploadBadgeIcon(file: File) {
  const fileName = buildBadgeIconFileName(file);

  const { error } = await supabase.storage
    .from(BADGE_ICON_BUCKET)
    .upload(fileName, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload badge icon: ${error.message}`);
  }

  return fileName;
}

export async function deleteBadgeIcon(iconPath: string) {
  if (!iconPath) {
    return;
  }

  const { error } = await supabase.storage
    .from(BADGE_ICON_BUCKET)
    .remove([iconPath]);

  if (error) {
    throw new Error(`Failed to delete badge icon: ${error.message}`);
  }
}

export async function getBadgeIconSignedUrl(iconPath: string) {
  if (!iconPath) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(BADGE_ICON_BUCKET)
    .createSignedUrl(iconPath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    return null;
  }

  return data?.signedUrl ?? null;
}
