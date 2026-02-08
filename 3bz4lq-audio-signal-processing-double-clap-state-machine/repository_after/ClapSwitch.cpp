#include "ClapSwitch.h"
#include <cmath>
#include <algorithm>

// Constants
static constexpr int SAMPLE_RATE = 44100;
// Thresholds
static constexpr int16_t THRESHOLD_TRIGGER = 10000;
static constexpr int16_t THRESHOLD_RESET = 2000;
// Timing in samples
static constexpr int MAX_ATTACK_SAMPLES = 441;   // 10ms
static constexpr int MAX_DECAY_SAMPLES = 4410;   // 100ms
static constexpr int WINDOW_START = 11025;       // 250ms
static constexpr int WINDOW_END = 35280;         // 800ms

AudioProcessor::ClapDetector::ClapDetector() 
    : state(IDLE), samplesProcessed(0), peakAmplitude(0), peakPosition(0) 
{}

bool AudioProcessor::ClapDetector::process(int16_t sample) {
    int16_t absSample = std::abs(sample);
    bool isClap = false;
    
    switch (state) {
        case IDLE:
            if (absSample > THRESHOLD_TRIGGER) {
                state = ATTACK;
                samplesProcessed = 0;
                peakAmplitude = absSample;
                peakPosition = 0;
            }
            break;
            
        case ATTACK:
            samplesProcessed++;
            if (absSample > peakAmplitude) {
                peakAmplitude = absSample;
                peakPosition = samplesProcessed;
            }
            
            // If attack time exceeded 10ms
            if (samplesProcessed >= MAX_ATTACK_SAMPLES) {
                if (peakPosition <= MAX_ATTACK_SAMPLES) {
                    state = DECAY;
                } else {
                    state = IDLE; 
                }
            }
            // Early drop check 
            if (peakAmplitude > 0 && absSample < peakAmplitude * 0.8) {
                if (peakPosition < MAX_ATTACK_SAMPLES) {
                     state = DECAY;
                }
            }
            break;

        case DECAY:
            samplesProcessed++;
            if (samplesProcessed > MAX_DECAY_SAMPLES) {
                state = IDLE;
            } else if (absSample < THRESHOLD_RESET) {
                isClap = true;
                state = IDLE;
            }
            break;
    }
    return isClap;
}

void AudioProcessor::ClapDetector::reset() {
    state = IDLE;
    samplesProcessed = 0; 
    peakAmplitude = 0; 
    peakPosition = 0;
}

AudioProcessor::AudioProcessor() 
    : mainState(MachineState::IDLE), lightState(false), timerSamples(0) 
{}

bool AudioProcessor::getLightState() const {
    return lightState;
}

void AudioProcessor::processBuffer(const std::vector<int16_t>& samples) {
    for (int16_t sample : samples) {
        bool clapFound = detector.process(sample);

        switch (mainState) {
            case MachineState::IDLE:
                if (clapFound) {
                    mainState = MachineState::CLAP1_DETECTED;
                }
                break;

            case MachineState::CLAP1_DETECTED:
                timerSamples = 0;
                mainState = MachineState::WAIT_INTERVAL;
                break;

            case MachineState::WAIT_INTERVAL:
                timerSamples++;
                
                if (clapFound) {
                    if (timerSamples >= WINDOW_START && timerSamples <= WINDOW_END) {
                        mainState = MachineState::CLAP2_DETECTED;
                    } else {
                        // Too fast or invalid timing (implicit too slow handled by timer check below, 
                        // but if clap arrives inside window bounds logic is cleaner)
                        mainState = MachineState::IDLE;
                    }
                } else if (timerSamples > WINDOW_END) {
                    mainState = MachineState::IDLE;
                }
                break;

            case MachineState::CLAP2_DETECTED:
                lightState = !lightState;
                mainState = MachineState::IDLE;
                break;
        }
    }
}
