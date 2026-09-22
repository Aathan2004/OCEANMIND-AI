import { Link } from "@tanstack/react-router";
import { Github, Waves } from "lucide-react";

const groups = [
  { title: "Platform", items: ["Fish Identification", "Ocean Dashboard", "Marine AI", "Research"] },
  { title: "Company", items: ["About", "Contact", "Careers", "Press"] },
  { title: "Resources", items: ["Documentation", "API", "Changelog", "Status"] },
  { title: "Legal", items: ["Privacy", "Terms", "Licenses", "Security"] },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border/60 pb-24 pt-14 sm:pb-14">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="max-w-sm">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-[image:var(--gradient-ocean)] text-primary-foreground">
              <Waves className="size-5" />
            </span>
            <span className="font-display text-lg font-bold">OceanMind AI</span>
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            Ocean intelligence for researchers, fishers and students — species recognition, live
            marine conditions and an AI research assistant in one platform.
          </p>
          <a
            href="https://github.com"
            className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <Github className="size-4" /> GitHub
          </a>
        </div>

        {groups.map((g) => (
          <div key={g.title}>
            <h4 className="text-sm font-semibold">{g.title}</h4>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {g.items.map((i) => (
                <li key={i} className="cursor-pointer transition-colors hover:text-foreground">
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-10 max-w-7xl px-4 text-xs text-muted-foreground">
        © {new Date().getFullYear()} OceanMind AI. Species data from GBIF and WoRMS; conservation
        status from the IUCN Red List.
      </p>
    </footer>
  );
}
