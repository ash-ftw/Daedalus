import type { NextFunction, Request, Response } from "express";

const startedAt = Date.now();
const counters = new Map<string, number>();
const latencyMs: number[] = [];

export function metricsMiddleware(request: Request, response: Response, next: NextFunction) {
  const started = Date.now();

  response.on("finish", () => {
    increment(`http_requests_total{method="${request.method}",status="${response.statusCode}"}`);
    latencyMs.push(Date.now() - started);
    if (latencyMs.length > 500) {
      latencyMs.shift();
    }
  });

  next();
}

export function increment(metric: string) {
  counters.set(metric, (counters.get(metric) ?? 0) + 1);
}

export function metricsText() {
  const lines = [
    "# HELP daedalus_uptime_seconds Process uptime in seconds.",
    "# TYPE daedalus_uptime_seconds gauge",
    `daedalus_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`,
    "# HELP daedalus_http_requests_total HTTP requests by method and status.",
    "# TYPE daedalus_http_requests_total counter",
    ...Array.from(counters.entries()).map(([metric, count]) => `daedalus_${metric} ${count}`),
    "# HELP daedalus_http_latency_p95_ms Approximate p95 request latency.",
    "# TYPE daedalus_http_latency_p95_ms gauge",
    `daedalus_http_latency_p95_ms ${percentile(latencyMs, 0.95)}`
  ];

  return `${lines.join("\n")}\n`;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
