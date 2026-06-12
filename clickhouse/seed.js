import { createClient } from "@clickhouse/client";
import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: "default",
});

// Spread 30 rows across the last 10 minutes so the timeline widget has shape.
const now = Date.now();
const minuteMs = 60_000;

const rows = [
  // Neural Networks notebook
  {
    snippet: "A perceptron computes a weighted sum of inputs then applies an activation function to produce an output.",
    snippet_type: "definition",
    notebook: "Neural Networks",
    source_window: "Deep Learning Textbook.pdf",
    tokens: 22,
    latency_ms: 210,
    offset_ms: 0,
  },
  {
    snippet: "ReLU(x) = max(0, x)",
    snippet_type: "formula",
    notebook: "Neural Networks",
    source_window: "Lecture Slides - Week 4",
    tokens: 7,
    latency_ms: 95,
    offset_ms: 45_000,
  },
  {
    snippet: "Training a 3-layer MLP on MNIST achieves ~98% test accuracy with dropout=0.3.",
    snippet_type: "example",
    notebook: "Neural Networks",
    source_window: "Lab Notebook",
    tokens: 19,
    latency_ms: 180,
    offset_ms: 2 * minuteMs,
  },
  {
    snippet: "Backpropagation is just the chain rule applied recursively through computation graphs.",
    snippet_type: "definition",
    notebook: "Neural Networks",
    source_window: "Deep Learning Textbook.pdf",
    tokens: 16,
    latency_ms: 155,
    offset_ms: 3 * minuteMs + 10_000,
  },
  {
    snippet: "Dropout randomly zeros activations at rate p during training to reduce co-adaptation.",
    snippet_type: "definition",
    notebook: "Neural Networks",
    source_window: "Deep Learning Textbook.pdf",
    tokens: 18,
    latency_ms: 130,
    offset_ms: 4 * minuteMs,
  },
  {
    snippet: "Without weight decay, our network overfit to the training set at epoch 12.",
    snippet_type: "example",
    notebook: "Neural Networks",
    source_window: "Lab Notebook",
    tokens: 17,
    latency_ms: 200,
    offset_ms: 5 * minuteMs + 30_000,
  },

  // Linear Algebra notebook
  {
    snippet: "The rank of a matrix is the dimension of the column space (= row space).",
    snippet_type: "definition",
    notebook: "Linear Algebra",
    source_window: "Gilbert Strang - Introduction to Linear Algebra",
    tokens: 18,
    latency_ms: 140,
    offset_ms: 30_000,
  },
  {
    snippet: "det(AB) = det(A) * det(B)",
    snippet_type: "formula",
    notebook: "Linear Algebra",
    source_window: "Gilbert Strang - Introduction to Linear Algebra",
    tokens: 9,
    latency_ms: 88,
    offset_ms: minuteMs + 20_000,
  },
  {
    snippet: "SVD: every m×n matrix A = UΣVᵀ where U, V are orthogonal and Σ is diagonal.",
    snippet_type: "definition",
    notebook: "Linear Algebra",
    source_window: "Numerical Methods Notes",
    tokens: 21,
    latency_ms: 175,
    offset_ms: 2 * minuteMs + 40_000,
  },
  {
    snippet: "PCA projects data onto the top-k eigenvectors of the covariance matrix.",
    snippet_type: "example",
    notebook: "Linear Algebra",
    source_window: "CS229 Lecture Notes",
    tokens: 16,
    latency_ms: 195,
    offset_ms: 4 * minuteMs + 15_000,
  },
  {
    snippet: "Gram-Schmidt orthonormalizes a set of linearly independent vectors.",
    snippet_type: "definition",
    notebook: "Linear Algebra",
    source_window: "Gilbert Strang - Introduction to Linear Algebra",
    tokens: 13,
    latency_ms: 112,
    offset_ms: 6 * minuteMs,
  },
  {
    snippet: "A matrix is positive definite iff all its eigenvalues are strictly positive.",
    snippet_type: "definition",
    notebook: "Linear Algebra",
    source_window: "Gilbert Strang - Introduction to Linear Algebra",
    tokens: 17,
    latency_ms: 120,
    offset_ms: 7 * minuteMs + 5_000,
  },

  // Thermodynamics notebook
  {
    snippet: "The first law of thermodynamics: ΔU = Q − W (energy is conserved).",
    snippet_type: "formula",
    notebook: "Thermodynamics",
    source_window: "Cengel & Boles - Thermodynamics",
    tokens: 16,
    latency_ms: 105,
    offset_ms: minuteMs + 50_000,
  },
  {
    snippet: "Entropy always increases in an isolated system — the second law.",
    snippet_type: "definition",
    notebook: "Thermodynamics",
    source_window: "Cengel & Boles - Thermodynamics",
    tokens: 14,
    latency_ms: 99,
    offset_ms: 3 * minuteMs + 30_000,
  },
  {
    snippet: "A Carnot engine operating between 300 K and 600 K has efficiency η = 1 - 300/600 = 50%.",
    snippet_type: "example",
    notebook: "Thermodynamics",
    source_window: "Problem Set 3",
    tokens: 22,
    latency_ms: 210,
    offset_ms: 5 * minuteMs + 10_000,
  },
  {
    snippet: "Ideal gas law: PV = nRT",
    snippet_type: "formula",
    notebook: "Thermodynamics",
    source_window: "Cengel & Boles - Thermodynamics",
    tokens: 8,
    latency_ms: 80,
    offset_ms: 6 * minuteMs + 20_000,
  },
  {
    snippet: "Enthalpy H = U + PV makes it convenient to track energy in open systems.",
    snippet_type: "definition",
    notebook: "Thermodynamics",
    source_window: "Cengel & Boles - Thermodynamics",
    tokens: 17,
    latency_ms: 115,
    offset_ms: 7 * minuteMs + 40_000,
  },
  {
    snippet: "In an adiabatic process, Q = 0, so ΔU = −W.",
    snippet_type: "formula",
    notebook: "Thermodynamics",
    source_window: "Lecture Slides - Week 7",
    tokens: 13,
    latency_ms: 102,
    offset_ms: 8 * minuteMs + 30_000,
  },
  // A few more Neural Networks rows later in timeline
  {
    snippet: "Batch normalization normalizes layer inputs to zero mean and unit variance per mini-batch.",
    snippet_type: "definition",
    notebook: "Neural Networks",
    source_window: "Deep Learning Textbook.pdf",
    tokens: 18,
    latency_ms: 145,
    offset_ms: 6 * minuteMs + 50_000,
  },
  {
    snippet: "Adam optimizer: combines momentum and RMSProp, works well out of the box.",
    snippet_type: "quote",
    notebook: "Neural Networks",
    source_window: "Fast.ai Notes",
    tokens: 14,
    latency_ms: 130,
    offset_ms: 8 * minuteMs,
  },
  {
    snippet: "Convolution: (f * g)(t) = ∫ f(τ)g(t−τ)dτ",
    snippet_type: "formula",
    notebook: "Neural Networks",
    source_window: "Signal Processing Review",
    tokens: 12,
    latency_ms: 90,
    offset_ms: 9 * minuteMs,
  },
];

const insertRows = rows.map((r) => ({
  snippet: r.snippet,
  snippet_type: r.snippet_type,
  notebook: r.notebook,
  source_window: r.source_window,
  tokens: r.tokens,
  latency_ms: r.latency_ms,
  // Place rows in the recent past for a realistic timeline
  captured_at: new Date(now - 10 * minuteMs + r.offset_ms)
    .toISOString()
    .replace("T", " ")
    .replace("Z", ""),
}));

await client.insert({
  table: "clipboard_events",
  values: insertRows,
  format: "JSONEachRow",
});

console.log(`Inserted ${insertRows.length} rows.`);

// Verify: print counts per notebook
const result = await client.query({
  query: "SELECT notebook, count() AS n FROM clipboard_events GROUP BY notebook ORDER BY n DESC",
  format: "JSONEachRow",
});
const counts = await result.json();
console.log("\nCounts per notebook:");
counts.forEach((r) => console.log(`  ${r.notebook}: ${r.n}`));

// Print timeline shape
const timeline = await client.query({
  query: `SELECT toStartOfMinute(captured_at) AS minute, count() AS n
          FROM clipboard_events GROUP BY minute ORDER BY minute`,
  format: "JSONEachRow",
});
const tRows = await timeline.json();
console.log("\nTimeline (per minute):");
tRows.forEach((r) => console.log(`  ${r.minute}: ${r.n}`));

await client.close();
