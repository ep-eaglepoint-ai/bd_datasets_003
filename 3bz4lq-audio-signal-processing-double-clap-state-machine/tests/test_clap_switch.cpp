#include <gtest/gtest.h>
#include "../repository_after/ClapSwitch.h"
#include <vector>
#include <cmath>

// Helper to generate silence
std::vector<int16_t> generateSilence(int count) {
    return std::vector<int16_t>(count, 0);
}

// Helper to generate a clap-like envelope
// Rise in 10 samples (<10ms), decay over length
std::vector<int16_t> generateClap(int peak = 20000, int length = 2000) {
    std::vector<int16_t> s;
    // Sharp attack (5 samples)
    for(int i=0; i<5; ++i) s.push_back((int16_t)(peak * ((float)i/5.0f)));
    s.push_back(peak);
    // Exponential decay
    for(int i=0; i<length; ++i) {
        s.push_back((int16_t)(peak * std::exp(-0.005 * i))); 
    }
    // Pad slightly
    for(int i=0; i<100; ++i) s.push_back(0);
    return s;
}

TEST(ClapSwitchTest, Req8_AmplitudeTest_Spike) {
    AudioProcessor proc;
    std::vector<int16_t> input = generateSilence(1000);
    
    // 10 samples spike - should be rejected as too short or invalid profile
    // Logic requires decay for detected clap. 
    // And "Attack < 10ms" is max limit. 
    // "Release < 100ms".
    // A square spike of 10 samples (all high) mimics infinite sustain for short time then drop.
    // My code checks "samplesProcessed > MAX_DECAY_SAMPLES" for sustain.
    // 10 samples is short. BUT does it decay "exponentially"?
    // 30000, 30000 ... 30000, 0.
    // Detection: Attack trigger -> Peek 30000. 
    // Fall to 0. 0 < 0.8*30000 -> DECAY state.
    // Next sample 0 < THRESHOLD_RESET -> Valid Clap?
    // Technially a spike IS a short impulse.
    // Requirement 8 says "Trigger a single high-amplitude spike... Verify state does NOT change."
    // This implies single clap doesn't toggle.
    // Testing logic:
    for(int i=0; i<10; ++i) input.push_back(30000);
    
    auto tail = generateSilence(1000);
    input.insert(input.end(), tail.begin(), tail.end());

    proc.processBuffer(input);
    EXPECT_FALSE(proc.getLightState());
}

TEST(ClapSwitchTest, Req4_TimingTest_TooSlow) {
    AudioProcessor proc;
    // First clap
    proc.processBuffer(generateClap());
    
    // Wait > 800ms (e.g. 900ms = 39690 samples)
    proc.processBuffer(generateSilence(39690));
    
    // Second clap
    proc.processBuffer(generateClap());
    
    // Should timeout (reset to IDLE), so no toggle
    EXPECT_FALSE(proc.getLightState());
}

TEST(ClapSwitchTest, Req7_SplitBufferTest) {
    AudioProcessor proc;
    
    // Create a full sequence that SHOULD toggle: Clap -> Wait -> Clap
    std::vector<int16_t> fullSequence;
    
    // Clap 1
    auto c1 = generateClap();
    fullSequence.insert(fullSequence.end(), c1.begin(), c1.end());
    
    // Wait 400ms
    auto s = generateSilence(17640);
    fullSequence.insert(fullSequence.end(), s.begin(), s.end());
    
    // Clap 2
    auto c2 = generateClap();
    fullSequence.insert(fullSequence.end(), c2.begin(), c2.end());
    
    // Process in small chunks (e.g. 128 samples, typical buffer size)
    // ensuring we split right in the middle of claps and silence
    size_t chunkSize = 128;
    for(size_t i=0; i < fullSequence.size(); i += chunkSize) {
        size_t end = std::min(i + chunkSize, fullSequence.size());
        std::vector<int16_t> chunk(fullSequence.begin() + i, fullSequence.begin() + end);
        proc.processBuffer(chunk);
    }
    
    EXPECT_TRUE(proc.getLightState());
}

TEST(ClapSwitchTest, Req9_TimingTest_TooFast) {
    AudioProcessor proc;
    
    // First clap
    proc.processBuffer(generateClap());
    
    // Wait 100ms (at 44.1kHz = 4410 samples)
    // Gap < 250ms (Debounce)
    proc.processBuffer(generateSilence(4410));
    
    // Second clap
    proc.processBuffer(generateClap());
    
    // Should be ignored/reset
    EXPECT_FALSE(proc.getLightState());
}

TEST(ClapSwitchTest, Req10_SuccessTest) {
    AudioProcessor proc;
    
    // First clap
    proc.processBuffer(generateClap());
    
    // Wait 400ms (approx 17640 samples)
    proc.processBuffer(generateSilence(17640));
    
    // Second clap
    proc.processBuffer(generateClap());
    
    // Toggle
    EXPECT_TRUE(proc.getLightState());
}

TEST(ClapSwitchTest, Req11_NoiseTest) {
    AudioProcessor proc;
    
    // 2 seconds of loud sine wave
    std::vector<int16_t> noise;
    for(int i=0; i<44100*2; ++i) {
        noise.push_back(20000 * sin(i * 0.1));
    }
    
    proc.processBuffer(noise);
    EXPECT_FALSE(proc.getLightState());
}

int main(int argc, char **argv) {
    testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
