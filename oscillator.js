/*
    outputs structure:
        - output_0
            - channel_0
                - block with samples [0-127]
                - block with samples [0-127]
                (...)
            - channel_1
            (...)
        - output_1
        (...)

    currently samples blocks are 128 frames long, see note: 
    https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process

    normalizing frequencies:
    https://www.physik.uzh.ch/local/teaching/SPI301/LV-2015-Help/lvanlsconcepts.chm/Normalized_Frequency.html

    inside processs() one can't use forEach as it doesn't wait for promises which process() seems to be using, 
    see note: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach

    sawtooth signal chart with hard sync and its leader cycle, follower cycler, 
    samples block (‹B›), follower cycle hard cut by leader cycle (‹fHC›) 
        ꞈ                     
        │‹─────leader cycle─────›‹─────leader cycle─────›   (...)
        │‹follower cycle›  ‹fHC› ‹follower cycle›  ‹fHC›    (...)
     1  ┤‹B›‹B›‹B›‹B›‹B›‹B›‹B›‹B›‹B›‹B›‹B›‹B›‹B›‹B›‹B›‹B›   (...)
        │` · ¸           │` · ¸ │` · ¸           │` · ¸ │`    
        │      ` · ¸     │      │      ` · ¸     │      │   (...)
        │            ` · │      │            ` · │      │                       
    -1  ┼────────────────────────time───────────────────────┬› 
        0                                                ∞ sec
*/
class Oscillator extends AudioWorkletProcessor {
    constructor() {
        super();
        // used by hard sync. Read: https://www.cs.cmu.edu/~eli/papers/icmc01-hardsync.pdf
        this.leaderPhase = 0; // leader's cycle phase [0-1]
        this.followerPhase = 0; // follower's cycle phase [0-1]

        // used by pink noise. See: https://noisehack.com/generate-noise-web-audio-api/
        this.b0 = 0;
        this.b1 = 0;
        this.b2 = 0;
        this.b3 = 0;
        this.b4 = 0;
        this.b5 = 0;
        this.b6 = 0;
        
        // used by brown noise
        this.lastOut = 0.0;
    }
    static get parameterDescriptors() {
        return [
            {
                name: "signalType",
                description: "Types of waveform. 0: triangle, 1: pulse, 2: sawtooth, 3: sine, 4: white noise, 5: pink noise, 6: brown noise",
                defaultValue: 1,
                minValue: 0,
                maxValue: 6,
            },
            {
                name: "frequency",
                description: "Number of waveform cycles per second [Hz]",
                defaultValue: 440,
                minValue: 0,
                maxValue: 0.5 * sampleRate,
            },
            {
                name: "phaseOffset",
                description: "Phase offset of the waveform",
                defaultValue: 0,
                minValue: 0,
                maxValue: 1,
            },
            {
                name: "vibrato",
                description: "Amount of pulsating change of pitch",
                defaultValue: 0.8,
                minValue: 0,
                maxValue: 1,
            },
            {
                name: "duty",
                description: "Duty cycle of the pulse wave. Not working with other waves",
                defaultValue: 0.5,
                minValue: 0,
                maxValue: 1,
            },
            {
                name: "sync",
                description: "Frequency to hard sync to in Hz",
                defaultValue: 0,
                minValue: 0,
            },
            {
                name: "amplitude",
                description: "Amplitude of generated waveform",
                defaultValue: 1,
                minValue: 0,
            },
        ];
    }
    /* returns value in range [0,1] */
    saw(value) {
        return value - Math.floor(value);
    }
    /* if parameter.length is 1, it's a k-rate parameter, so apply the first entry to every frame. 
    Otherwise it's a-rate parameter thus apply each entry to the corresponding frame */
    getRateValue(parameter, index) {
        if (parameter.length > 1) return parameter[index]; // a-rate
        if (parameter.length === 1) return parameter[0]; // k-rate
    }
    /* if signal value if over range [-1,1] hard clip it */
    clipValue(value) {
        if (value > 1) return 1;
        if (value < -1) return -1;
        return value;
    }
    /*  for each connected output go to its first channel and modify all its samples */
    process(_input, outputs, parameters) {
        for (let outputNumber = 0; outputNumber < outputs.length; outputNumber++) {
            const firstChannel = outputs[outputNumber][0];
            const samplesBlockLength = firstChannel.length;

            for (let index = 0; index < samplesBlockLength; index++) {
                // get the parameters value based on their rate value
                const wave = Math.floor(this.getRateValue(parameters["signalType"], index));
                const duty = this.getRateValue(parameters["duty"], index);
                const vibrato = this.getRateValue(parameters["vibrato"], index);
                const amplitude = this.getRateValue(parameters["amplitude"], index);
                const phaseOffset = this.getRateValue(parameters["phaseOffset"], index);
                const leaderFrequency = this.getRateValue(parameters["sync"], index);
                const followerFrequency = this.getRateValue(parameters["frequency"], index);

                // normalize frequencies from [cycles per second] to [cycles per sample] to know how many
                // cycles were made during this sample. sampleRate is a property of BaseAudioContext
                const leaderNFrequency = leaderFrequency / sampleRate;
                const followerNFrequency = followerFrequency / sampleRate;

                // move leader's phase by the number of cycles in this sample
                this.leaderPhase += leaderNFrequency;

                // when leader oscillator's cycle repeats, the follower is retriggered, regardless of its position
                if (leaderFrequency !== 0 && this.leaderPhase >= 1) {
                    this.leaderPhase %= 1; // don't overrun leader cycle
                    this.followerPhase = 0; // reset the follower
                } else {
                    // move follower's phase by the number of cycles in this sample
                    this.followerPhase += followerNFrequency;
                }

                // add offset and vibrato but don't overrun follower cycle
                this.followerPhase += phaseOffset;
                this.followerPhase += Math.sin((this.followerPhase * 2 * Math.PI * vibrato) / 500) * 2;
                this.followerPhase %= 1;

                let sampleValue = 0; // keep current sample's value. Range: [-1,1]
                
                // brown noise
                if (wave === 6) {
                    const white = Math.random() * 2 - 1;
                    sampleValue = (this.lastOut + 0.02 * white) / 1.02;
                    this.lastOut = sampleValue;
                    sampleValue *= 3.5; // (roughly) compensate for gain
                } // pink noise
                if (wave === 5) {
                    const white = Math.random() * 2 - 1;
                    this.b0 = 0.99886 * this.b0 + white * 0.0555179;
                    this.b1 = 0.99332 * this.b1 + white * 0.0750759;
                    this.b2 = 0.969 * this.b2 + white * 0.153852;
                    this.b3 = 0.8665 * this.b3 + white * 0.3104856;
                    this.b4 = 0.55 * this.b4 + white * 0.5329522;
                    this.b5 = -0.7616 * this.b5 - white * 0.016898;
                    sampleValue = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
                    sampleValue *= 0.11; // (roughly) compensate for gain
                    this.b6 = white * 0.115926;
                } // white noise
                if (wave === 4) {
                    sampleValue = Math.random() * 2 - 1;
                } // sine wave
                if (wave === 3) {
                    sampleValue = Math.sin(this.followerPhase * 2 * Math.PI);
                } // sawtooth wave
                if (wave === 2) {
                    sampleValue = this.saw(this.followerPhase) * 2 - 1;
                } // pulse wave
                if (wave === 1) {
                    sampleValue = this.saw(this.followerPhase) - this.saw(this.followerPhase + duty);
                    sampleValue = sampleValue > 0 ? 1 : -1; // scale from [duty-1, duty] to [-1, 1]
                } // triangle wave
                if (wave === 0) {
                    sampleValue = Math.abs(this.saw(this.followerPhase) - 1 / 2) * 4 - 1;
                }

                // multiply by amplitude and clip the value if they exceed normal range
                firstChannel[index] = this.clipValue(amplitude * sampleValue);
            }
            return true;
        }
    }
}

registerProcessor("oscillator", Oscillator);
