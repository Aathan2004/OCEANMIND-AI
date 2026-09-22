import type { IdentificationResult } from "@/lib/identify-server";

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("least concern") || s.includes("lc")) return "#22c55e";
  if (s.includes("near threatened") || s.includes("nt")) return "#facc15";
  if (s.includes("vulnerable") || s.includes("vu")) return "#f97316";
  if (s.includes("endangered") || s.includes("en")) return "#ef4444";
  if (s.includes("critically") || s.includes("cr")) return "#dc2626";
  return "#6b7280";
}

export function generateFishReport(
  result: IdentificationResult,
  imageDataUrl: string | null,
): string {
  const pred = result.prediction;
  // Species facts now come from GBIF/WoRMS via the backend, not a local table.
  const taxonomy = result.taxonomy;
  const details = result.details;
  const now = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // A report is only generated for a confident identification, so these are
  // present; nothing is substituted with the word "Unknown".
  const topCandidate = result.top_candidates?.[0];
  const commonName = pred?.common_name ?? topCandidate?.scientific_name ?? "";
  const sciName = pred?.scientific_name ?? topCandidate?.scientific_name ?? "";
  const confidence = pred?.confidence ?? topCandidate?.confidence ?? 0;
  const iucn = result.conservation?.iucn_status ?? "";
  const conservationColor = statusColor(iucn);

  const rows = (
    [
      ["Kingdom", taxonomy?.kingdom],
      ["Phylum", taxonomy?.phylum],
      ["Class", taxonomy?.class],
      ["Order", taxonomy?.order],
      ["Family", taxonomy?.family],
      ["Genus", taxonomy?.genus],
      ["Description", details?.description],
      ["Habitat", details?.habitat],
      ["Distribution", details?.distribution],
      ["Diet", details?.diet],
      ["Behavior", details?.behavior],
      ["Average Size", details?.size],
      ["Lifespan", details?.lifespan],
      ["Reproduction", details?.reproduction],
    ] as [string, string | undefined][]
  )
    .filter(([, v]) => v && v !== "Unknown")
    .map(
      ([label, val]) => `
    <tr>
      <td style="padding:8px 12px;font-weight:600;color:#94a3b8;font-size:13px;white-space:nowrap;border-bottom:1px solid #1e2d3d;">${label}</td>
      <td style="padding:8px 12px;color:#e2e8f0;font-size:13px;border-bottom:1px solid #1e2d3d;">${val}</td>
    </tr>`,
    )
    .join("");

  const alts = (result.alternatives || [])
    .map(
      (a: { scientific_name: string; confidence: number }) => `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span style="color:#cbd5e1;font-size:13px;">${a.scientific_name}</span>
      <div style="flex:1;margin:0 12px;height:6px;background:#1e2d3d;border-radius:3px;overflow:hidden;">
        <div style="width:${a.confidence}%;height:100%;background:linear-gradient(90deg,#06b6d4,#0ea5e9);border-radius:3px;"></div>
      </div>
      <span style="color:#06b6d4;font-size:13px;font-weight:600;">${a.confidence}%</span>
    </div>`,
    )
    .join("");

  // Sources replace the old hardcoded "fun facts" list: real citations only.
  const facts = (result.sources || [])
    .map(
      (source: { name: string; url: string }) =>
        `<li style="margin-bottom:8px;color:#94a3b8;font-size:13px;line-height:1.6;"><a href="${source.url}" style="color:#06b6d4;">${source.name}</a></li>`,
    )
    .join("");

  const imageHtml = imageDataUrl
    ? `<img src="${imageDataUrl}" alt="Identified fish" style="width:100%;max-height:320px;object-fit:cover;border-radius:12px;margin-bottom:20px;" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OceanMind AI — Fish Identification Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0f1a; color: #e2e8f0; font-family: 'DM Sans', sans-serif; padding: 40px 32px; max-width: 820px; margin: 0 auto; }
    h1, h2, h3 { font-family: 'Space Grotesk', sans-serif; }
    .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px; margin-bottom: 20px; }
    @media print {
      body { padding: 20px; background: #0a0f1a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
    <div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#06b6d4,#0ea5e9);border-radius:10px;display:flex;align-items:center;justify-content:center;">
          <span style="color:white;font-size:18px;">🌊</span>
        </div>
        <span style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;color:white;">OceanMind AI</span>
      </div>
      <p style="color:#64748b;font-size:12px;">Fish Species Identification Report</p>
    </div>
    <div style="text-align:right;">
      <p style="color:#64748b;font-size:12px;">Generated on</p>
      <p style="color:#94a3b8;font-size:13px;font-weight:500;">${now}</p>
      <p style="color:#64748b;font-size:11px;margin-top:4px;">Engine: ${result.engine || "OceanMind AI"}</p>
    </div>
  </div>

  <!-- Fish Image -->
  ${imageHtml}

  <!-- Primary Result -->
  <div class="card" style="border-color:rgba(6,182,212,0.3);background:linear-gradient(135deg,rgba(6,182,212,0.06),rgba(14,165,233,0.04));">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
      <div>
        <h1 style="font-size:26px;font-weight:700;color:white;margin-bottom:6px;">${commonName}</h1>
        <p style="font-style:italic;color:#64748b;font-size:15px;">${sciName}</p>
      </div>
      <div style="text-align:right;">
        <div style="background:linear-gradient(135deg,#06b6d4,#0ea5e9);border-radius:12px;padding:8px 16px;">
          <p style="color:white;font-size:22px;font-weight:700;">${confidence}%</p>
          <p style="color:rgba(255,255,255,0.8);font-size:11px;">Confidence</p>
        </div>
      </div>
    </div>
    <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px;">
      <span style="background:rgba(${
        conservationColor
          .replace("#", "")
          .match(/../g)
          ?.map((h) => parseInt(h, 16))
          .join(",") || "34,197,94"
      },0.15);color:${conservationColor};border:1px solid ${conservationColor}40;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:500;">
        IUCN: ${iucn}
      </span>
      ${result.identified ? '<span style="background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid #22c55e40;border-radius:20px;padding:4px 12px;font-size:12px;">✓ Positively Identified</span>' : '<span style="background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid #f59e0b40;border-radius:20px;padding:4px 12px;font-size:12px;">⚠ Low Confidence</span>'}
    </div>
  </div>

  <!-- Species Details -->
  <div class="card">
    <h2 style="font-size:15px;font-weight:600;color:white;margin-bottom:16px;">Species Profile</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tbody>${rows}</tbody>
    </table>
  </div>

  <!-- Interesting Facts -->
  ${
    facts
      ? `<div class="card">
    <h2 style="font-size:15px;font-weight:600;color:white;margin-bottom:14px;">Interesting Facts</h2>
    <ul style="list-style:none;padding:0;">
      ${facts}
    </ul>
  </div>`
      : ""
  }

  <!-- Alternative Candidates -->
  ${
    alts
      ? `<div class="card">
    <h2 style="font-size:15px;font-weight:600;color:white;margin-bottom:16px;">Top Alternative Candidates</h2>
    ${alts}
  </div>`
      : ""
  }

  <!-- Footer -->
  <div style="border-top:1px solid #1e2d3d;padding-top:20px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
    <p style="color:#475569;font-size:12px;">Powered by OceanMind AI · EfficientNet-B0 PyTorch + Vision AI</p>
    <p style="color:#475569;font-size:12px;">aquaintel.ai · Research Use Only</p>
  </div>

  <script>
    // Auto-trigger print dialog for PDF export
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;
}

export function downloadFishReport(
  result: IdentificationResult,
  imageDataUrl: string | null,
): void {
  const html = generateFishReport(result, imageDataUrl);
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Please allow pop-ups to download the PDF report.");
    return;
  }
  win.document.write(html);
  win.document.close();
}
