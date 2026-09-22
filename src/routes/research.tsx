import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Bookmark, ExternalLink, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { searchResearchFn } from "@/lib/research-server";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "Marine Research Library — OceanMind AI" },
      {
        name: "description",
        content:
          "Search and bookmark peer-reviewed marine science studies by species, location, climate and ecosystem.",
      },
      { property: "og:title", content: "Marine Research Library — OceanMind AI" },
      {
        property: "og:description",
        content: "A curated, filterable index of ocean and fisheries research publications.",
      },
    ],
  }),
  component: GuardedResearch,
});

const topics = ["All", "Species", "Conservation", "Climate", "Ecosystem", "Fisheries"] as const;

function Research() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<(typeof topics)[number]>("All");
  const [saved, setSaved] = useState<string[]>([]);
  // Debounced so typing doesn't fire a Crossref request per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 450);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useQuery({
    queryKey: ["research", debouncedQuery, topic],
    queryFn: () =>
      searchResearchFn({
        data: { query: debouncedQuery, topic: topic === "All" ? "" : topic },
      }),
    staleTime: 5 * 60 * 1000,
  });

  const papers = search.data?.papers ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-12">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Marine Research Library</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Live search over registered publications via{" "}
        <a
          href="https://www.crossref.org"
          target="_blank"
          rel="noreferrer"
          className="text-ocean-cyan hover:underline"
        >
          Crossref
        </a>
        . Every result is a real paper with a DOI.
      </p>

      <div className="glass mt-8 rounded-2xl p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, authors, topics…"
            className="pl-9"
            aria-label="Search marine research"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {topics.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={topic === item ? "ocean" : "ghost"}
              onClick={() => setTopic(item)}
            >
              {item}
            </Button>
          ))}
        </div>
      </div>

      {search.isPending ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : search.data?.error ? (
        <p className="glass mt-6 flex items-center justify-center gap-2 rounded-2xl p-8 text-center text-sm text-muted-foreground">
          <AlertCircle className="size-4" />
          {search.data.error}
        </p>
      ) : papers.length === 0 ? (
        <p className="glass mt-6 rounded-2xl p-8 text-center text-sm text-muted-foreground">
          No publications match that search.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {papers.map((paper) => (
            <article key={paper.doi} className="glass glass-hover flex flex-col rounded-2xl p-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold leading-snug">{paper.title}</h2>
                <button
                  aria-label={saved.includes(paper.doi) ? "Remove bookmark" : "Bookmark"}
                  onClick={() =>
                    setSaved((current) =>
                      current.includes(paper.doi)
                        ? current.filter((doi) => doi !== paper.doi)
                        : [...current, paper.doi],
                    )
                  }
                  className="shrink-0 text-muted-foreground transition-colors hover:text-ocean-cyan"
                >
                  <Bookmark
                    className={`size-4 ${saved.includes(paper.doi) ? "fill-ocean-cyan text-ocean-cyan" : ""}`}
                  />
                </button>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">{paper.authors}</p>

              {paper.abstract && (
                <p className="mt-3 line-clamp-5 flex-1 text-sm text-muted-foreground">
                  {paper.abstract}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
                {paper.journal && (
                  <Badge variant="secondary" className="max-w-[60%] truncate">
                    {paper.journal}
                  </Badge>
                )}
                {paper.year && <Badge variant="outline">{paper.year}</Badge>}
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-ocean-cyan hover:underline"
                >
                  DOI <ExternalLink className="size-3" />
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/** Route entry point. The page itself is only mounted for a verified session. */
function GuardedResearch() {
  return (
    <ProtectedRoute>
      <Research />
    </ProtectedRoute>
  );
}
