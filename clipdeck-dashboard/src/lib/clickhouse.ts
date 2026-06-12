import { createClient } from "@clickhouse/client";

/** Shared ClickHouse client factory. Callers must `await client.close()`. */
export function getClient() {
  return createClient({
    url: process.env.CLICKHOUSE_HOST,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    database: "default",
  });
}
