## Oscillator recreated using AudioWorkletProcessor
Build as an extension of [OscillatorNode](https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode) which by default doesn't allow user to manipulate all its attributes. By using [AudioWorkletProcessor](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor) one can use any of the [AudioParam methods](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam#methods) to change Oscillator type or any other exposed parameter. This Oscillator implements (in addition to the original node) [pulse wave](https://en.wikipedia.org/wiki/Pulse_wave), [vibrato](https://en.wikipedia.org/wiki/Vibrato), naïve [hard sync](https://en.wikipedia.org/wiki/Oscillator_sync), amplitude, white, pink and brown noise.

## Exposed parameters
````javascript
{
    name: "signalType",
    description: "Types of waveform. 
        0: triangle, 
        1: pulse, 
        2: sawtooth, 
        3: sine, 
        4: white noise, 
        5: pink noise, 
        6: brown noise",
    defaultValue: 1,
    minValue: 0,
    maxValue: 6,
},
{
    name: "frequency",
    description: "Number of waveform cycles per second [Hz]",
    defaultValue: 400,
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
    defaultValue: 0,
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

````
Hence this Oscillator expands the processor by adding a static [parameterDescriptors getter](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/parameterDescriptors) all listed parameters can be accessed via [parameters](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode/parameters) property of AudioWorkletNode like so: 
````javascript
const oscillator = new AudioWorkletNode(audioContext, "oscillator");
const type = oscillator.parameters.get("signalType");
````

## Example
Let's create sound similar to acceleration and gear shifting in classical Amiga game like Crazy Cars 3 🏎️
```javascript
try {
    audioContext = new AudioContext();
} catch (e) {
    alert("The Web Audio API is not supported in this browser.");
}

audioContext.audioWorklet.addModule("./oscillator.js").then(() => {
    const oscillator = new AudioWorkletNode(audioContext, "oscillator");
    oscillator.connect(audioContext.destination);

    const type = oscillator.parameters.get("signalType");
    const sync = oscillator.parameters.get("sync");
    const duty = oscillator.parameters.get("duty");
    const vibrato = oscillator.parameters.get("vibrato");
    const amplitude = oscillator.parameters.get("amplitude");
    const phaseOffset = oscillator.parameters.get("phaseOffset");

    const time = audioContext.currentTime;

    // changing type from default (pulse), to sawtooth and then to triangle
    type.setValueAtTime(2, time + 0.5);
    type.setValueAtTime(0, time + 3);

    sync.linearRampToValueAtTime(440, time + 1);
    sync.linearRampToValueAtTime(0, time + 4);

    duty.linearRampToValueAtTime(1, time + 2);
    duty.linearRampToValueAtTime(0.2, time + 4);

    vibrato.exponentialRampToValueAtTime(0.8, time + 2);
    vibrato.linearRampToValueAtTime(0, time + 3);

    amplitude.setValueAtTime(0, time);
    amplitude.linearRampToValueAtTime(0.8, time + 2);
    amplitude.setValueAtTime(0.4, time + 2.5);
    amplitude.linearRampToValueAtTime(0.2, time + 4);

    phaseOffset.linearRampToValueAtTime(0.01, time + 1);
    phaseOffset.linearRampToValueAtTime(0, time + 1.5);

    setTimeout(() => audioContext.close(), 4000);
});
````

## Technology & limitation
Currently AudioWorkletProcessor works fine in [all major browsers except Safari](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor#browser_compatibility).

Thanks to [Flarp](https://github.com/Flarp) for creating [inital idea](https://github.com/Flarp/better-oscillator). 
