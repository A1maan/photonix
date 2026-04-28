# Photonix Idea Evolution

Living note for the current Photonix product thesis. This file should evolve as the demo, pitch, technical assumptions, and aerospace feedback become clearer.

Last updated: April 29, 2026

## Current State

Photonix is a mission-control prototype for routing and optimizing many incoming AI jobs across orbital AI data centers, focused on Saudi Arabia and the GCC.

The original project framing emphasized one LLM inference mission for GCC users. That is useful as a judge-friendly demo scenario, but the stronger product framing is a queue of jobs from many companies, each with its own constraints. The current corrected framing is:

> Photonix assumes a LEO orbital compute network already exists, then decides how to split and assign many incoming jobs across available satellites based on each job's hardware needs, deadline, data volume, splittability, power, thermal margin, compute capacity, radiation or space-weather risk, link quality, queue load, and ground-station access.

This makes the product an orbital workload router and mission operations copilot, not primarily a tool for designing and launching a constellation from scratch.

## Main Thesis

AI infrastructure is becoming constrained by power, cooling, land, water, permitting, and grid availability. Space-based data centers are being explored because orbit may offer:

- Strong solar availability, especially in dawn-dusk sun-synchronous LEO.
- Potential water savings compared with terrestrial cooling.
- Radiative cooling potential, although thermal design remains difficult.
- Proximity to space-generated data, such as imagery, radar, weather, and defense sensing.
- Optical inter-satellite links that can move data between satellites without routing everything through the ground.

The strongest near-term reason to use AI in space is not ordinary consumer LLM serving. It is processing data that is already created in space.

## Core Product Assumption

Photonix should operate under this assumption:

```text
The orbital AI data center satellites are already in orbit.
Photonix is deciding how to split and place the current job queue right now.
```

This keeps the demo focused on an operational problem:

```text
Incoming company job queue
  -> inspect available orbital compute satellites
  -> read each job's constraints, such as deadline, data volume, GPU requirement, and downlink need
  -> compare thermal margin, power, compute capacity, GPU type, link quality, queue load, and space-weather risk
  -> split or assign jobs across the best eligible satellites
  -> reroute, delay, split further, or migrate jobs if conditions change
```

In this framing, constellation design becomes an advanced or future feature. The core demo is about operational scheduling, queue splitting, and failover across an existing LEO compute network.

Because multiple jobs can compete for the same orbital resources, Photonix needs a local search or optimization layer that can evaluate many possible job-to-satellite assignments before the AI planner explains the chosen plan. The exact algorithm is a later engineering decision; the product requirement is that Photonix must search locally over constraints instead of relying only on a single LLM response.

## Corrected Use Case Priority

### Primary Near-Term Use Case

Satellite imagery analysis and space-generated data processing.

Example:

```text
Earth-observation satellite captures raw imagery
  -> LEO AI compute node processes imagery in orbit
  -> system detects useful events or compresses/classifies data
  -> only high-value results are downlinked to Earth
```

This is stronger because raw satellite data can be large, downlink windows are limited, and not all data is worth sending to Earth unprocessed.

Good examples for Photonix:

- Disaster response.
- Flood, wildfire, dust storm, and oil spill detection.
- Maritime monitoring.
- Border/security sensing.
- Smart city and infrastructure monitoring.
- Remote sensing for energy, logistics, agriculture, and climate.

### Strategic Long-Term Use Case

Large-scale orbital AI compute using better solar availability and reduced terrestrial water/cooling constraints.

This supports the bigger "orbital AI data center" story, but it should be framed as a strategic direction rather than something the demo proves today.

### Secondary Demo Use Case

GCC LLM inference.

This can remain in the app because it is easy for judges to understand, but the pitch should not imply that serving normal ChatGPT-style traffic from orbit is the first obvious business case. Terrestrial data centers are still easier to operate, repair, regulate, and connect for most Earth-user LLM traffic.

## Architecture Pivot

Do not describe the system as:

```text
Ground station
  -> LEO relay
  -> higher geostationary satellite for processing
```

That creates avoidable technical problems and conflicts with the public direction of major orbital compute efforts, which mostly point toward LEO or sun-synchronous LEO compute clusters.

Use this architecture instead:

```text
Ground station
  -> LEO access or relay satellite
  -> optical inter-satellite links through LEO mesh
  -> LEO orbital AI data center cluster
  -> best available ground station for result downlink
```

Operationally, the planner should see this as a changing network of available compute options:

```text
Job queue arrives
  -> Dawn-1 is cool, powered, and has a Riyadh link soon
  -> Dawn-2 has a B200 and can satisfy a customer that requires that hardware
  -> Gulf Nano can handle only compressed metadata or degraded-mode inference
  -> split jobs across Dawn-1, Dawn-2, and Gulf Nano according to constraints
  -> keep backup paths ready if link, power, or radiation conditions change
```

Key correction:

- A LEO satellite is not stationary over one region.
- LEO satellites move quickly and have limited ground visibility windows.
- Geostationary satellites appear fixed from Earth, but they are much higher and should not be the default compute architecture for Photonix.

## Communication Model

The aerospace feedback remains important after pivoting fully to LEO.

The issue is not "we need GEO." The issue is "do not rely on one fragile direct link."

Weak model:

```text
Riyadh ground station -> Dawn-1 compute satellite
```

Better model:

```text
Riyadh -> LEO access node -> Dawn-1
Dubai -> LEO access node -> Dawn-1
Abu Dhabi -> LEO access node -> Dawn-2
Dawn-1 <-> Dawn-2 over optical inter-satellite links
```

Photonix should eventually score:

- Line-of-sight availability.
- Ground weather risk.
- Optical link availability.
- RF fallback readiness.
- Bandwidth pressure.
- Pass-window limits.
- Store-and-forward buffering.
- Multi-ground-station failover.

## What The AI Planner Should Do

The AI should not only generate generic text for the current configuration. It should behave like an orbital job router and mission planning copilot.

The deterministic simulator should produce metrics. The AI should interpret the metrics, explain tradeoffs, and warn against weak assumptions.

### 1. Workload Suitability

The planner should classify whether a workload belongs in orbit.

Example:

```text
Satellite Imagery Analysis: Strong fit
Reason: data is created in orbit, raw downlink is expensive, and in-orbit filtering reduces bandwidth.

LLM Inference for GCC Users: Medium / experimental fit
Reason: solar and water benefits matter, but terrestrial latency, repairability, and regulation are stronger today.

Large Model Training: Long-term fit
Reason: high power demand may benefit from orbital solar, but launch mass, thermal design, repairability, and cost are unresolved.
```

### 2. Multi-Job Assignment

The planner should choose the best available satellite or satellite group for each job already waiting to be processed.

It should consider:

- Company or customer constraints.
- Required GPU or accelerator type, such as B200-class hardware.
- Thermal margin.
- Available solar power and battery state.
- Compute capacity and GPU type.
- Current queue load.
- Radiation or space-weather exposure.
- Ground-station visibility.
- Link quality and bandwidth.
- Whether each task is urgent, delay-tolerant, splittable, or compressible.

Example:

```text
Recommendation:
Send disaster-response imagery triage to Dawn-1 now.
Send the B200-required customer inference job to Dawn-2 if its radiation and thermal margins remain acceptable.
Send metadata extraction and compressed previews to Gulf Nano only.

Reason:
Dawn-1 has the best thermal margin, enough compute headroom, and a Riyadh downlink window soon.
Dawn-2 has the required hardware for the B200-constrained job, but its radiation risk must be watched.
Gulf Nano should only receive compressed metadata extraction because it lacks enough power for full inference.
```

### 3. Mission Architecture Context

The planner can still describe the architecture, but as context for workload routing rather than as the main product action.

It should summarize:

- Orbit shell.
- Compute nodes.
- Ground stations.
- Relay strategy.
- Optical link strategy.
- Fallback routing.
- Which assumptions are modeled versus real.

Example:

```text
Current architecture context:
Use a 550-650 km dawn-dusk sun-synchronous LEO shell.
Treat Dawn-1 and Dawn-2 as primary orbital compute nodes.
Use Riyadh and Dubai as primary ground stations, Abu Dhabi as overflow.
Route through a LEO optical mesh when direct downlink is unavailable.
Buffer low-priority data during link gaps.
```

### 4. Communication Risk Planner

The planner should explicitly handle communication fragility.

It should answer:

- What happens if Riyadh loses the link?
- What happens if Dawn-2 is degraded?
- Which station receives the result if the primary station is unavailable?
- Which jobs should pause, migrate, split, or buffer?
- Which path is best for urgent data?

### 5. Simulation Response

In Simulate mode, the AI should explain operational actions when something goes wrong.

Example:

```text
Event: Dawn-2 radiation risk detected.

Recommended response:
1. Pause non-critical batch jobs on Dawn-2.
2. Migrate urgent imagery triage to Dawn-1.
3. Buffer low-priority raw imagery until the next stable link.
4. Route urgent alerts through Dubai if Riyadh link quality drops.
5. Keep Gulf Nano as degraded-mode reserve for metadata extraction only.
```

### 6. Judge-Friendly Mission Brief

After a plan is generated, the AI should output a concise brief:

- Workload fit.
- Recommended satellite assignment.
- Communication plan.
- Ground comparison.
- Risks and assumptions.
- Next action.

## Faults In The Previous Framing

1. The first use case was too centered on LLM inference for GCC users.
   - Better: make satellite imagery analysis and space-generated data processing the primary near-term use case.

2. The communication architecture sounded like it might require a higher-orbit processing satellite.
   - Better: keep compute in LEO and model redundant LEO routing with optical inter-satellite links.

3. The system risked implying LEO satellites can be stationary.
   - Better: clearly say LEO satellites move quickly and require pass-window planning.

4. The cost, water, and solar claims could sound too certain.
   - Better: present them as modeled scenario estimates, not proof that orbit always beats terrestrial data centers.

5. "Cooling in space" can sound too easy.
   - Better: say radiative cooling potential exists, but heat rejection remains a major engineering challenge.

6. The product was too close to constellation design.
   - Better: assume the satellites already exist and focus Photonix on assigning, rerouting, delaying, splitting, or migrating workloads across the active orbital compute network.

## Updated Pitch Direction

Short version:

> Photonix is mission-control software for routing many AI jobs across LEO orbital data centers. It assumes the orbital compute network already exists, then decides how to split and assign each job based on hardware requirements, deadlines, power, temperature, compute capacity, link quality, space-weather risk, and ground-station access.

Longer version:

> As AI infrastructure runs into power, cooling, land, water, and grid constraints, companies are exploring compute in orbit. But once orbital compute satellites exist, operators still need to decide where many competing jobs should run minute by minute. Photonix turns that into a mission-control workspace: ingest a queue of company jobs, inspect the live state of each LEO compute satellite, split work across eligible nodes, route results through GCC ground stations and optical inter-satellite links, and simulate failures such as heat, radiation, link loss, or overloaded queues.

## Product Implications

The app should gradually move from a "pretty globe plus generated text" toward a structured planning tool.

Recommended UI/product additions:

- Rename or reprioritize the default scenario from "GCC LLM Inference" to "GCC Satellite Imagery Analysis" or "Disaster Response Imagery Triage."
- Add an Auto workload mode for a mixed queue of jobs from many companies.
- Add job constraints such as required accelerator, deadline, data volume, splittability, compression preference, and downlink target.
- Add a local search or optimization layer that proposes a feasible split of jobs across satellites before the AI planner explains the result.
- Add a workload-fit score.
- Add satellite health cards with temperature, thermal margin, power state, compute headroom, queue load, and radiation/weather risk.
- Add a job assignment recommendation that selects the best eligible satellite or satellite group now and explains why.
- Add a communication-resilience score.
- Add explicit routing paths, not just downlink arcs.
- Add primary, backup, and degraded communication modes.
- Add actions such as assign now, delay, split jobs, compress results, migrate jobs, or downlink raw data.
- Add AI-generated simulation responses for storm, link-loss, and node-failure events.
- Keep LLM inference as a secondary scenario or advanced workload.

## Open Questions

- Should the demo default to imagery analysis instead of LLM inference?
- Should the demo default to Auto multi-job queue instead of a single imagery or LLM workload?
- What is the minimum job constraint schema needed for the first local assignment search?
- Should the pitch mention Google/Starcloud/NVIDIA directly or keep sources in backup notes?
- Should Photonix show a LEO optical mesh as visible links between compute satellites?
- Should the system include a "bad fit" warning when the user selects a workload that is better served on Earth?
- Should the DOCX be rewritten around this corrected thesis before the hackathon demo?
- Which satellite-health inputs should be shown in the first demo: temperature, power, link quality, queue load, radiation risk, or all of them?

## Next Doc Update Candidate

The project DOCX should eventually be updated so:

- Executive Summary leads with LEO orbital workload routing and optimization.
- Primary use case becomes satellite imagery analysis / in-space data processing.
- LLM inference becomes secondary or demo-only.
- Architecture mentions LEO optical mesh and redundant ground stations.
- Planner assumes satellites are already in orbit and recommends how to split and assign the current job queue.
- Known limitations mention line-of-sight, link budget, weather, optical link availability, thermal design, and production pass-window computation.
- Pitch script avoids implying that Photonix proves orbital compute beats terrestrial compute for all workloads.
