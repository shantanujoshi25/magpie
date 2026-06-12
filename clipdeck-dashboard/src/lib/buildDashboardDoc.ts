export interface DashboardData {
  notebooks: { notebook: string; n: string }[];
  timeline: { minute: string; n: string }[];
  topics: { notebook: string; snippet_type: string; n: string }[];
  recent: {
    event_id: string;
    captured_at: string;
    snippet: string;
    snippet_type: string;
    notebook: string;
    tokens: string;
  }[];
}

export const SNIPPET_TYPE_VARIANT: Record<string, "info" | "warning" | "success" | "neutral" | "danger"> = {
  definition: "info",
  formula: "warning",
  example: "success",
  quote: "neutral",
  image: "danger",
};

function formatMinuteLabel(clickhouseTs: string): string {
  const parts = clickhouseTs.split(" ");
  if (parts.length < 2) return clickhouseTs;
  const t = parts[1].split(":");
  return `${t[0]}:${t[1]}`;
}

function q(s: string): string {
  return s.replace(/"/g, "'").replace(/\\/g, "").replace(/\n/g, " ").trim();
}

/** Generates the OpenUI Lang doc for the analytics charts section only. */
export function buildChartsDoc(data: DashboardData): string {
  if (data.timeline.length === 0 && data.topics.length === 0) return "";

  const lines: string[] = [];
  const nbLabels = data.notebooks.map((n) => n.notebook);
  const snippetTypes = [...new Set(data.topics.map((t) => t.snippet_type))];

  lines.push("root = Stack([chartsRow])");
  lines.push(`chartsRow = Stack([timelineCard, topicsCard], "row")`);

  // Timeline
  const tLabels = data.timeline.map((t) => formatMinuteLabel(t.minute));
  const tCounts = data.timeline.map((t) => parseInt(t.n));
  lines.push(`timelineCard = Card([CardHeader("Capture Timeline"), tlChart])`);
  lines.push(`tlChart = LineChart(tlLabels, [tlSeries])`);
  lines.push(`tlLabels = [${tLabels.map((l) => `"${l}"`).join(", ")}]`);
  lines.push(`tlSeries = Series("Captures", [${tCounts.join(", ")}])`);

  // Stacked bar: type breakdown per notebook
  const barSeriesIds = snippetTypes.map((_, i) => `bs${i}`);
  lines.push(`topicsCard = Card([CardHeader("Type Breakdown by Notebook"), bChart])`);
  lines.push(`bChart = BarChart(bLabels, [${barSeriesIds.join(", ")}], "stacked")`);
  lines.push(`bLabels = [${nbLabels.map((l) => `"${q(l)}"`).join(", ")}]`);
  snippetTypes.forEach((type, i) => {
    const counts = nbLabels.map((nb) => {
      const found = data.topics.find(
        (t) => t.notebook === nb && t.snippet_type === type
      );
      return found ? parseInt(found.n) : 0;
    });
    lines.push(`bs${i} = Series("${type}", [${counts.join(", ")}])`);
  });

  return lines.join("\n");
}

/** Generates OpenUI Lang doc for a notebook detail page (all snippets). */
export function buildNotebookDoc(
  notebook: string,
  snippets: { snippet: string; snippet_type: string; source_window: string; captured_at: string }[],
  types: { snippet_type: string; n: string }[]
): string {
  if (snippets.length === 0) {
    return [
      "root = Stack([msg])",
      `msg = TextContent("No snippets in this notebook yet.", "default")`,
    ].join("\n");
  }

  const lines: string[] = [];
  const snippetTypes = [...new Set(snippets.map((s) => s.snippet_type))];
  const tagIds = types.map((_, i) => `tag${i}`).join(", ");
  const rowIds = snippets.map((_, i) => `r${i}`).join(", ");

  lines.push("root = Stack([statsRow, sep, snipList])");
  lines.push(`statsRow = Stack([totalCard, tagsCard], "row", "m", "start")`);
  lines.push(`totalCard = Card([CardHeader("Total Snippets"), totalVal])`);
  lines.push(`totalVal = TextContent("${snippets.length}", "large-heavy")`);
  lines.push(`tagsCard = Card([CardHeader("By Type"), tagRow])`);
  lines.push(`tagRow = TagBlock([${tagIds}])`);
  types.forEach((t, i) => {
    const variant = SNIPPET_TYPE_VARIANT[t.snippet_type] ?? "neutral";
    lines.push(`tag${i} = Tag("${t.snippet_type} ×${t.n}", null, "sm", "${variant}")`);
  });
  lines.push(`sep = Separator()`);
  lines.push(`snipList = Stack([${rowIds}], "column", "s")`);

  snippets.forEach((s, i) => {
    const variant = SNIPPET_TYPE_VARIANT[s.snippet_type] ?? "neutral";
    const text = s.snippet.replace(/"/g, "'").replace(/\\/g, "").replace(/\n/g, " ").trim();
    const src = s.source_window.replace(/"/g, "'").trim();
    lines.push(`r${i} = Card([r${i}row, r${i}src])`);
    lines.push(`r${i}row = Stack([r${i}badge, r${i}txt], "row", "xs")`);
    lines.push(`r${i}badge = Tag("${s.snippet_type}", null, "sm", "${variant}")`);
    lines.push(`r${i}txt = TextContent("${text}", "default")`);
    lines.push(`r${i}src = TextContent("— ${src}", "small")`);
  });

  return lines.join("\n");
}
