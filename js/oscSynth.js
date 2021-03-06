/*exported OscSynth*/
/*globals window, console, Note */
'use strict';

function OscSynth(numOscillators, startNote, startOctave, musicalScale, numOctaves,
  volume, delayTime, delayFeedbackGain, delayWetGain, waveShape, isSynthPlaying) {


  var createAudioContext = function() {
    if (window.AudioContext) {
      return new window.AudioContext();
    } else {
      throw new Error("Web Audio not supported (could not create audio context");
    }
  };

  function bindParameterToProperty(parameter, property) {
    parameter.value = property.get();
    property.addChangeListener(function(value) {
      parameter.value = value;
      console.log('set Parameter value', property.name, parameter.value);

    });
  }

  // from http://www.html5rocks.com/en/tutorials/casestudies/jamwithchrome-audio/

  function SlapbackDelayNode(audioContext, delayTime, delayFeedbackGain, delayWetGain) {
    //create the nodes we’ll use
    this.input = audioContext.createGain();
    var output = audioContext.createGain(),
      delay = audioContext.createDelay(),
      feedback = audioContext.createGain(),
      wetLevel = audioContext.createGain();

    bindParameterToProperty(delay.delayTime, delayTime);
    bindParameterToProperty(feedback.gain, delayFeedbackGain);
    bindParameterToProperty(wetLevel.gain, delayWetGain);

    //set up the routing
    this.input.connect(delay);
    this.input.connect(output);
    delay.connect(feedback);
    delay.connect(wetLevel);
    feedback.connect(delay);
    wetLevel.connect(output);

    this.connect = function(target) {
      output.connect(target);
    };
  }

  var oscillators = [];
  var context = createAudioContext();
  var initializedOnUserInteraction = false;

  var masterGain = context.createGain();
  //bindParameterToProperty(masterGain.gain, volume);
  masterGain.gain.value = 0;
  masterGain.connect(context.destination);

  var compressor = context.createDynamicsCompressor();
  compressor.connect(masterGain);

  var delayNode = new SlapbackDelayNode(context, delayTime, delayFeedbackGain, delayWetGain);
  delayNode.connect(compressor);

  var inputForOscillators = delayNode.input;

  var init = function() {
    volume.addChangeListener(function(val) {
      if (isSynthPlaying.get()) {
        masterGain.gain.value = val;
      }
    });
    startNote.addChangeListener(rebuildOscillators);
    startOctave.addChangeListener(rebuildOscillators);
    musicalScale.addChangeListener(rebuildOscillators);
    numOctaves.addChangeListener(rebuildOscillators);
    waveShape.addChangeListener(setOscillatorsType);
    isSynthPlaying.addChangeListener(isSynthPlayingChange);
    createOscillators();

  };

  // Ugly hack for iOS devices, which require a note played by user interaction to enable audio.
  // It seems like it requires an start (noteOn) triggered by a click.
  var initializeFromUserInteraction = function() {
    if (!initializedOnUserInteraction) {
      console.log('initializing from user interaction');
      var oscillator = context.createOscillator();
      var gainNode = context.createGain();
      gainNode.gain.value = 0.0;
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(0);
      initializedOnUserInteraction = true;
      setTimeout(function() {
        gainNode.disconnect();
        oscillator.disconnect();

      }, 100);
    }
  };

  var rebuildOscillators = function() {
    console.log('rebuildOscillators');
    var i = oscillators.length;
    while (i > 0) {
      i--;
      oscillators[i].gainNode.disconnect();
      oscillators[i].oscillator.disconnect();
    }

    oscillators = [];

    createOscillators();
  };

  var createOscillators = function() {
    console.log("createOscillators");
    var frequencies = getFrequencies(startNote.get(), startOctave.get(), musicalScale.get(), numOctaves.get());
    var i = frequencies.length;
    while (i > 0) {
      i--;
      oscillators.push(createOscillator(frequencies[i]));
    }
    numOscillators.set(frequencies.length);
  };

  var isSynthPlayingChange = function(value) {
    if (value) {
      initializeFromUserInteraction();
      masterGain.gain.value = volume.get();
    } else {
      masterGain.gain.value = 0;
    }
  };


  var createOscillator = function(frequency) {
    //console.log('createOscillator', frequency);

    // Create oscillator and gain node.
    var oscillator = context.createOscillator(),
      gainNode = context.createGain();

    // Set the type and frequency of the oscillator.
    oscillator.type = waveShape.get();
    oscillator.frequency.value = frequency.value;

    // Set volume of the oscillator.
    gainNode.gain.value = 0;

    // Route oscillator through gain node to speakers.
    oscillator.connect(gainNode);
    gainNode.connect(inputForOscillators);

    // Start oscillator playing.
    oscillator.start(0);

    return {
      oscillator: oscillator,
      gain: gainNode.gain,
      gainNode: gainNode,
      frequency: frequency.value,
      name: frequency.name
    };
  };

  function setOscillatorsType() {
    for (var i = 0; i < oscillators.length; i++) {
      var osc = oscillators[i].oscillator;
      // Hack for the webkit shim
      if (osc.typeByName) {
        osc.typeByName(waveShape.get());
      } else {
        osc.type = waveShape.get();
      }
    }
  }


  function getFrequency(n, startFrequency) {
    // http://www.phy.mtu.edu/~suits/NoteFreqCalcs.html
    //var f0 = 440;
    var f0 = startFrequency;
    var a = Math.pow(2, 1 / 12.0);
    var freq = f0 * Math.pow(a, n);
    return freq;
  }


  function getFrequencies(startNote, startOctave, scale, numOctaves) {
    var frequencies = [];
    for (var octave = startOctave; octave < startOctave + numOctaves; octave++) {
      var noteLatin = startNote + octave;
      var n = Note.fromLatin(noteLatin);
      if (scale === 'quarter notes') {
        for (var quarterIndex = 0; quarterIndex < 12; quarterIndex++) {
          frequencies.push({
            value: getFrequency(quarterIndex, n.frequency()),
            name: n.latin() + octave + '_' + (quarterIndex + 1)
          });
        }
      } else {
        var majorScale = n.scale(scale);
        // then loop through scale array for each note object 
        for (var noteIndex = 0; noteIndex < majorScale.length - 1; noteIndex++) {
          frequencies.push({
            value: majorScale[noteIndex].frequency(),
            name: majorScale[noteIndex].latin() + octave
          });
        }
      }
    }

    return frequencies;
  }

  function getOscillatorData(oscillatorNum) {
    //console.log('getOscillatorData', oscillatorNum)
    var oscillator = oscillators[oscillatorNum];
    return {
      frequency: oscillator.frequency,
      name: oscillator.name
    };
  }



  var gainThreshold = 0.001;
  var play = function(step) {
    for (var i = 0; i < oscillators.length; i++) {
      // TODO: better gain normalization (perhaps based on the number of active oscillators?)
      var normalizedGain = step[i] * 0.1;
      if (Math.abs(oscillators[i].gain.value - normalizedGain) > gainThreshold) {
        //console.log('set gain', oscillators[i].frequency, normalizedGain, oscillators[i].gain.value);
        oscillators[i].gain.value = normalizedGain;
      }
    }
  };

  init();

  return {
    play: play,
    setOscillatorsType: setOscillatorsType,
    compressor: compressor,
    getOscillatorData: getOscillatorData
  };
}

