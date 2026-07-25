import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

/** Max images stored on a category. */
export const CATEGORY_IMAGES_MAX_COUNT = 20;

/** Max length of a single image URL / path string. */
export const CATEGORY_IMAGE_URL_MAX_LENGTH = 2048;

/** Max upload size (2 MiB). */
export const CATEGORY_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const CATEGORY_IMAGE_ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/**
 * Validate a category image reference (absolute http(s) URL or /uploads/... path).
 * Rejects path traversal and unsafe extensions on upload paths.
 */
export function assertSafeCategoryImageRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException('Image URL must not be empty');
  }
  if (trimmed.length > CATEGORY_IMAGE_URL_MAX_LENGTH) {
    throw new BadRequestException(
      `Image URL must be at most ${CATEGORY_IMAGE_URL_MAX_LENGTH} characters`,
    );
  }
  if (/[\0\r\n]/.test(trimmed)) {
    throw new BadRequestException('Image URL contains invalid characters');
  }

  if (trimmed.startsWith('/uploads/')) {
    if (trimmed.includes('..') || trimmed.includes('\\')) {
      throw new BadRequestException('Unsafe image path');
    }
    const ext = extname(trimmed).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      throw new BadRequestException(
        'Image path must end with .jpg, .jpeg, .png, .webp or .gif',
      );
    }
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestException(
      'Image must be an http(s) URL or a /uploads/... path',
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('Image URL must use http or https');
  }
  if (url.username || url.password) {
    throw new BadRequestException('Image URL must not include credentials');
  }

  return trimmed;
}

export function assertSafeCategoryImages(
  images: string[] | undefined,
): string[] | undefined {
  if (images === undefined) {
    return undefined;
  }
  if (images.length > CATEGORY_IMAGES_MAX_COUNT) {
    throw new BadRequestException(
      `At most ${CATEGORY_IMAGES_MAX_COUNT} images allowed`,
    );
  }
  return images.map((img) => assertSafeCategoryImageRef(img));
}

/** Build a non-guessable, extension-safe filename (never reuse client name). */
export function buildSafeCategoryImageFilename(mime: string): string {
  const ext = CATEGORY_IMAGE_ALLOWED_MIME[mime];
  if (!ext) {
    throw new BadRequestException('Unsupported image type');
  }
  return `${randomUUID()}.${ext}`;
}

export function assertAllowedImageMime(mime: string | undefined): string {
  const key = (mime ?? '').toLowerCase();
  if (!CATEGORY_IMAGE_ALLOWED_MIME[key]) {
    throw new BadRequestException(
      'Only JPEG, PNG, WebP and GIF images are allowed',
    );
  }
  return key;
}
