import { createServerFn } from "@tanstack/react-start";

/**
 * Real marine-science literature search via the Crossref REST API.
 *
 * This replaces a hardcoded list of invented paper titles and author names.
 * Every record returned here is a genuine registered publication with a DOI.
 */

export interface ResearchPaper {
  title: string;
  authors: string;
  journal: string;
  year: number | null;
  doi: string;
  url: string;
  abstract: string | null;
}

const CROSSREF = "https://api.crossref.org/works";

/** Crossref returns JATS-flavoured XML inside `abstract`; strip it to plain text. */
function cleanAbstract(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^Abstract\s*/i, "")
    .trim();
  return text.length > 40 ? text : null;
}

interface CrossrefItem {
  title?: string[];
  author?: Array<{ given?: string; family?: string }>;
  "container-title"?: string[];
  issued?: { "date-parts"?: number[][] };
  DOI?: string;
  URL?: string;
  abstract?: string;
}

export const searchResearchFn = createServerFn({ method: "GET" })
  .validator((data: { query?: string; topic?: string }) => data)
  .handler(async ({ data }): Promise<{ papers: ResearchPaper[]; error?: string }> => {
    // Always keep the search inside marine science, whatever the user typed.
    const terms = [data.query?.trim(), data.topic?.trim(), "marine fish"].filter(Boolean).join(" ");

    const params = new URLSearchParams({
      query: terms,
      rows: "24",
      select: "title,author,abstract,DOI,URL,issued,container-title",
      sort: "relevance",
    });

    try {
      const response = await fetch(`${CROSSREF}?${params}`, {
        headers: {
          // Crossref asks for a contactable UA and rewards it with better service.
          "User-Agent": "OceanMindAI/1.0 (academic project; mailto:noreply@example.com)",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        return { papers: [], error: "The literature service returned an error." };
      }

      const body = (await response.json()) as { message?: { items?: CrossrefItem[] } };
      const items = body.message?.items ?? [];

      const papers = items
        .map((item): ResearchPaper | null => {
          const title = item.title?.[0]?.trim();
          const doi = item.DOI;
          if (!title || !doi) return null;

          const authors =
            (item.author ?? [])
              .slice(0, 4)
              .map((a) => [a.given, a.family].filter(Boolean).join(" "))
              .filter(Boolean)
              .join(", ") || "Authors not listed";

          return {
            title,
            authors,
            journal: item["container-title"]?.[0] ?? "",
            year: item.issued?.["date-parts"]?.[0]?.[0] ?? null,
            doi,
            url: item.URL ?? `https://doi.org/${doi}`,
            abstract: cleanAbstract(item.abstract),
          };
        })
        .filter((paper): paper is ResearchPaper => paper !== null);

      return { papers };
    } catch {
      return { papers: [], error: "Could not reach the literature service." };
    }
  });
