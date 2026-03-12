const MAX_LENGTH = 50;

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    return "issue";
  }

  if (slug.length <= MAX_LENGTH) {
    return slug;
  }

  const truncated = slug.slice(0, MAX_LENGTH);
  const lastHyphen = truncated.lastIndexOf("-");
  return lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
}
