/**
 * OpenTelemetry setup for LLM apps — one place to choose WHERE spans go. (Post 01 explains it;
 * posts 02–06 and the capstone import it as `@learn/07-observability/tracing`.)
 *
 *   TRACE_EXPORTER=console      (default) compact one-line-per-span printer (below)
 *   TRACE_EXPORTER=console-raw  the stock ConsoleSpanExporter (full span objects)
 *   TRACE_EXPORTER=otlp         OTLP/HTTP protobuf → Jaeger, Tempo, Honeycomb, Grafana, Phoenix...
 *                                     (endpoint from OTEL_EXPORTER_OTLP_ENDPOINT, default http://localhost:4318)
 *   TRACE_EXPORTER=langfuse     Langfuse (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL)
 *   TRACE_EXPORTER=memory       in-memory, for tests (returned so you can assert on spans)
 *
 * Key idea: instrumentation (spans + attributes) is vendor-neutral; the backend is a deployment choice.
 */
import { type Tracer } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { optional } from '@learn/shared';

/** Prints each finished span on one line with its duration and the gen_ai.* attributes that matter. */
export class CompactConsoleExporter implements SpanExporter {
  export(spans: ReadableSpan[], done: (r: ExportResult) => void) {
    for (const s of spans) {
      const ms = s.duration[0] * 1e3 + s.duration[1] / 1e6;
      const a = s.attributes;
      const pick = Object.entries(a)
        .filter(([k]) =>
          /^gen_ai\.(operation\.name|provider\.name|request\.model|response\.model|usage\.\w+_tokens|response\.finish_reasons|tool\.name)$|^error\.type$|^app\./.test(k),
        )
        .map(([k, v]) => `${k.replace(/^gen_ai\./, '')}=${JSON.stringify(v)}`)
        .join(' ');
      const depth = s.parentSpanContext ? '  └─ ' : '';
      const status = s.status.code === 2 ? ' ❌' : '';
      console.log(`[span] ${depth}${s.name} (${ms.toFixed(0)} ms)${status} ${pick}`);
    }
    done({ code: ExportResultCode.SUCCESS });
  }
  async shutdown() {}
}

export interface Tracing {
  tracer: Tracer;
  memory?: InMemorySpanExporter;
  shutdown(): Promise<void>;
}

export function setupTracing(serviceName: string, exporter = optional('TRACE_EXPORTER', 'console')!): Tracing {
  let processor: SpanProcessor;
  let memory: InMemorySpanExporter | undefined;
  switch (exporter) {
    case 'console':
      processor = new SimpleSpanProcessor(new CompactConsoleExporter());
      break;
    case 'console-raw':
      processor = new SimpleSpanProcessor(new ConsoleSpanExporter());
      break;
    case 'memory':
      memory = new InMemorySpanExporter();
      processor = new SimpleSpanProcessor(memory);
      break;
    case 'otlp':
      // Batch in production: spans are buffered and sent in the background.
      processor = new BatchSpanProcessor(new OTLPTraceExporter()); // reads OTEL_EXPORTER_OTLP_* env vars
      break;
    case 'langfuse':
      processor = new LangfuseSpanProcessor(); // reads LANGFUSE_* env vars
      break;
    default:
      throw new Error(`Unknown TRACE_EXPORTER "${exporter}"`);
  }
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName, [ATTR_SERVICE_VERSION]: '1.0.0' }),
    spanProcessors: [processor],
  });
  // register() installs the global provider AND an AsyncLocalStorage context manager,
  // which is what makes spans created inside `await`ed code nest under their parent.
  provider.register();
  return {
    tracer: provider.getTracer(serviceName), // from THIS provider, even if another one was registered first
    memory,
    // Always flush on exit, or the last batch of spans is lost (classic serverless/CLI bug).
    shutdown: () => provider.shutdown(),
  };
}
