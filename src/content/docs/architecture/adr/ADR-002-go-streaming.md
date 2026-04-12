---
title: "ADR-002 — Use Go for Streaming Microservices"
---

# ADR-002: Use Go for Streaming Microservices

## Status

Accepted

## Date

2022-06-20

## Context

The Streaming Platform needed to handle high-throughput, low-latency video packaging and playback session management. At peak load during live events, the platform serves approximately 150,000 concurrent streams, generating tens of thousands of HLS/DASH segment requests per second. The previous implementation used Node.js, which encountered specific performance limitations:

- Garbage collection pauses during high concurrency caused intermittent latency spikes in segment serving
- Memory usage per connection was higher than desired, limiting the number of concurrent sessions per pod
- The single-threaded event loop model required careful management to avoid blocking operations during CPU-intensive packaging tasks

Java was evaluated as an alternative but its memory footprint per service instance was a concern given the number of microservices planned for the Streaming Platform (six services, each horizontally scaled).

The platform required a language that could handle thousands of concurrent connections efficiently, with predictable latency, small binary sizes for fast container startup, and a simple concurrency model for the team to adopt.

## Decision

Adopt Go 1.21 as the primary language for all Streaming Platform microservices: Ingest Service, Transcoding Orchestrator, Packaging Service, Playback Service, Live Service, and Catalog Service.

Key technical choices:

- **Standard library `net/http`** for HTTP servers — avoids framework dependency and provides efficient connection handling
- **Goroutines** for concurrency — lightweight green threads managed by the Go runtime, enabling thousands of concurrent request handlers
- **`context` package** for request lifecycle management — enables timeouts, cancellation, and value propagation across goroutine boundaries
- **Static binary compilation** — single binary deployments with no runtime dependencies, enabling minimal container images (Alpine-based, typically < 20 MB)

## Consequences

### Positive

- **3x reduction in p99 latency** for segment serving compared to the Node.js implementation, measured under equivalent load conditions
- **~60% reduction in memory usage** per pod, enabling higher density per AKS node and reducing infrastructure costs
- Go's built-in concurrency model (goroutines + channels) handles thousands of concurrent connections efficiently without callback complexity
- Small binary sizes (< 20 MB) reduce container image sizes and startup times, improving deployment speed and autoscaling responsiveness
- Static type system catches a category of errors at compile time that previously appeared at runtime in Node.js
- The standard library is comprehensive — the team found that most infrastructure needs (HTTP, JSON, testing, benchmarking) were covered without third-party dependencies

### Negative

- The Streaming team (6 engineers at the time) required Go training. The ramp-up period was approximately 3 weeks of dedicated learning, including pair programming on initial services.
- Smaller pool of Go developers in the Los Angeles job market compared to Node.js and Java, making hiring slightly more challenging.
- Error handling patterns (explicit error returns rather than exceptions) required a cultural shift. The team initially found the verbosity frustrating but grew to appreciate the explicitness.
- At the time of the decision, Go lacked generics. This has since been resolved with Go 1.18+ generics, and the team has begun adopting them for shared utility code.

### Mitigations

- Established Go coding standards and shared libraries within the first month of adoption, providing a consistent foundation across all six services
- Pair programming between experienced Go developers (hired externally) and existing team members during the initial development phase
- Built internal Go training materials and a curated reading list, now maintained as onboarding resources for new team members
- Invested in benchmarking infrastructure early, enabling the team to validate performance improvements quantitatively
