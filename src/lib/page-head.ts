import { brandTitle } from "@/lib/brand";

export function pageHead(title: string, description: string) {
  return {
    meta: [
      { title: brandTitle(title) },
      { name: "description", content: description },
      { property: "og:title", content: brandTitle(title) },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
