#ifndef CLAP_SWITCH_H
#define CLAP_SWITCH_H

#include <vector>
#include <cstdint>

class AudioProcessor {
public:
    AudioProcessor();
    bool getLightState() const;
    void processBuffer(const std::vector<int16_t>& samples);

private:
    struct ClapDetector {
        enum State { IDLE, ATTACK, DECAY };
        State state;
        int32_t samplesProcessed;
        int32_t peakAmplitude;
        int32_t peakPosition;
        
        ClapDetector();
        bool process(int16_t sample);
        void reset();
    };

    enum class MachineState {
        IDLE,
        WAIT_FOR_SECOND_CLAP
    };

    MachineState mainState;
    bool lightState;
    int32_t timerSamples;
    
    ClapDetector detector;
};

#endif // CLAP_SWITCH_H
