# Trajectory: Audio Signal Processing - Double Clap State Machine

## Initial Understanding

When I first encountered the request to implement a "Clap-Switch" relay controller, I immediately recognized that this was not a simple amplitude detection problem. The prompt specifically positioned me as a "Lead Firmware Engineer" and emphasized "Noise Immunity via Temporal Constraints." This framing shifted my mindset from writing a simple script to designing a robust real-time system.

I started by breaking down the requirements into two distinct layers:

1.  **Signal Analysis Layer**: How do I distinguish a "clap" from other loud noises? The requirements gave me a specific envelope signature: a sharp rising edge (Attack < 10ms) followed by a quick exponential decay (Release < 100ms). This meant I couldn't just check `if (sample > threshold)`. I needed to track the _shape_ of the sound over time.
2.  **Logic Layer**: How do I handle the "Double Clap" sequence? This acts as a temporal password. I identified the need for a state machine that manages the sequence: `One Clap` -> `Silence (Debounce)` -> `Window Open` -> `Second Clap`.

A critical implicit requirement I identified was the handling of buffer boundaries. Since the audio stream comes in fixed-size buffers, a clap event essentially "lives" across the boundaries of these arrays. The state machine could not assume a clap starts and finishes within one function call. It had to be persistent, preserving its context (current state, samples processed, peak values) between calls. This ruled out any local variable-based logic and mandated a class-member state approach.

Regarding the "no external DSP libraries" constraint, I decided to implement a simple time-domain envelope follower. Calculating RMS (Root Mean Square) involves square roots which can be expensive in a hot loop, so I opted for absolute value tracking combined with state-based timing verification, which is efficient and sufficient for impulsive sounds like claps.

## Testing Strategy

My testing strategy focused heavily on "negative testing"—verifying what _doesn't_ trigger the system. It is easy to make a detector that triggers on a clap; it is hard to make one that ignores everything else.

I decided to map the requirements directly to specific test scenarios:

- **The "Amplitude Spike" (Req 8)**: This was crucial. A random digital glitch or a dropped book might create a massive spike. By feeding a block of zeros with a sudden square wave burst, I verified that my "Attack/Decay" envelope logic would reject signals that didn't have the natural exponential decay of a hand clap.
- **The "Noise Immunity" (Req 11)**: Sustained noise (like music) triggers the start threshold but fails the duration check. I decided to feed a continuous sine wave to ensure the detector eventually timed out or reset when the signal didn't decay, proving it wasn't a clap.
- **The "Timing Window" (Req 9 & implicit Too Slow)**: I needed to verify the bounds of the double-clap. A clap 100ms after the first is likely an echo, not a second command. A clap 2 seconds later is a new event, not a continuation. I wrote distinct tests for "Too Fast" and "Too Slow" to enforce the `[250ms, 800ms]` acceptance window strictly.

## Iterative Refinement

As I began implementing the state machine, I realized a complexity in the "Wait" state. Initially, I thought about just pausing for a duration. However, I realized the system needed to be "listening" constantly. Even during the debounce period, we are processing samples.

I also validated my assumption about the buffer splitting. I explicitly wrote the `Req7_SplitBufferTest` to simulate a scenario where the stream is chopped into tiny chunks (128 samples). This forced me to ensure that my member variables (`timerSamples`, `state`, etc.) were correctly incrementing across calls. If I had relied on loop indices relative to the current buffer, this test would have failed. It confirmed that my state machine was truly independent of the buffer size.

I also refined the "Clap" definition. I separated the logic into a nested `ClapDetector` class. This clean separation allowed the outer loop to just ask "Did a clap happen now?" without getting bogged down in the physics of attack and decay sample counting.

## Final Reflection

By the end of the implementation, I felt a high degree of confidence in the solution's robustness. The decision to use strict sample counting (derived from the 44.1kHz rate) rather than system time checks ensured the logic was deterministic and bit-perfectly reproducible—essential for firmware.

The tests confirmed that the system is selective. It ignores echoes, it ignores shouting (sustained noise), and it ignores digital glitches. The "Split Buffer" test, in particular, gave me the assurance that this code could be dropped into a real audio callback mechanism (like ALSA or CoreAudio) and function correctly regardless of latency settings. The strict adherence to the "no heap allocation" rule ensures the system remains fast and predictable, avoiding memory fragmentation in a long-running embedded context.
