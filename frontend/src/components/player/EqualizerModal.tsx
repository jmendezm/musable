import React, { useState } from 'react';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { usePlayerStore, AudioPreset } from '../../stores/playerStore';

const DEFAULT_AUDIO_PRESETS: AudioPreset[] = [
  {
    name: 'Flat',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    masterGain: 1.0,
    reverbEnabled: false,
    reverbRoomSize: 1.5,
    reverbDecay: 2.0,
    reverbWetDry: 0.3,
    reverbCutoff: 5000,
    limiterEnabled: false,
    limiterThreshold: -1.0,
    limiterRelease: 0.25,
  },
  {
    name: 'Bass Boost',
    gains: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
    masterGain: 0.8,
    reverbEnabled: false,
    reverbRoomSize: 1.5,
    reverbDecay: 2.0,
    reverbWetDry: 0.3,
    reverbCutoff: 5000,
    limiterEnabled: true,
    limiterThreshold: -1.0,
    limiterRelease: 0.25,
  },
  {
    name: 'Concert Hall',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    masterGain: 0.9,
    reverbEnabled: true,
    reverbRoomSize: 3.5,
    reverbDecay: 4.0,
    reverbWetDry: 0.5,
    reverbCutoff: 8000,
    limiterEnabled: true,
    limiterThreshold: -2.0,
    limiterRelease: 0.3,
  },
  {
    name: 'Club',
    gains: [6, 4, 2, 0, -2, -2, 0, 2, 4, 6],
    masterGain: 0.85,
    reverbEnabled: true,
    reverbRoomSize: 2.0,
    reverbDecay: 2.5,
    reverbWetDry: 0.35,
    reverbCutoff: 3000,
    limiterEnabled: true,
    limiterThreshold: -1.5,
    limiterRelease: 0.2,
  },
];

const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EqualizerModal: React.FC<EqualizerModalProps> = ({ isOpen, onClose }) => {
  const {
    eqEnabled,
    toggleEQ,
    eqGains,
    setEQGains,
    masterGain,
    setMasterGain,
    reverbEnabled,
    toggleReverb,
    reverbRoomSize,
    setReverbRoomSize,
    reverbDecay,
    setReverbDecay,
    reverbWetDry,
    setReverbWetDry,
    reverbCutoff,
    setReverbCutoff,
    limiterEnabled,
    toggleLimiter,
    limiterThreshold,
    setLimiterThreshold,
    limiterRelease,
    setLimiterRelease,
    customPresets,
    savePreset,
    deletePreset,
  } = usePlayerStore();

  const [selectedPreset, setSelectedPreset] = useState<string>('Custom');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [activeTab, setActiveTab] = useState<'eq' | 'effects'>('eq');

  const allPresets = [...DEFAULT_AUDIO_PRESETS, ...customPresets];

  const applyPreset = (preset: AudioPreset) => {
    setEQGains(preset.gains);
    setMasterGain(preset.masterGain);
    if (preset.reverbEnabled !== reverbEnabled) toggleReverb();
    setReverbRoomSize(preset.reverbRoomSize);
    setReverbDecay(preset.reverbDecay);
    setReverbWetDry(preset.reverbWetDry);
    setReverbCutoff(preset.reverbCutoff);
    if (preset.limiterEnabled !== limiterEnabled) toggleLimiter();
    setLimiterThreshold(preset.limiterThreshold);
    setLimiterRelease(preset.limiterRelease);
    setSelectedPreset(preset.name);
  };

  const handleGainChange = (index: number, value: number) => {
    const newGains = [...eqGains];
    newGains[index] = value;
    setEQGains(newGains);
    setSelectedPreset('Custom');
  };

  const handleSavePreset = () => {
    if (presetName.trim()) {
      savePreset(presetName.trim());
      setPresetName('');
      setShowSaveDialog(false);
    }
  };

  const handleDeletePreset = (name: string) => {
    if (window.confirm(`Delete preset "${name}"?`)) {
      deletePreset(name);
      if (selectedPreset === name) {
        setSelectedPreset('Custom');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800 rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden shadow-2xl border border-gray-700/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700/50 bg-gray-900/50">
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <span className="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">Audio</span>
            <span className="text-white">Effects</span>
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-all"
          >
            <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700/50">
          <button
            onClick={() => setActiveTab('eq')}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'eq'
                ? 'border-blue-500 text-blue-400 bg-gray-800/50'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
            }`}
          >
            Equalizer
          </button>
          <button
            onClick={() => setActiveTab('effects')}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'effects'
                ? 'border-blue-500 text-blue-400 bg-gray-800/50'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
            }`}
          >
            Effects
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-180px)]">
          {/* EQ Tab */}
          {activeTab === 'eq' && (
            <div className="space-y-4">
              {/* EQ Toggle and Presets */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <button
                  onClick={toggleEQ}
                  className={`px-6 py-2 rounded-full text-sm font-bold transition-all shadow-lg ${
                    eqEnabled
                      ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-blue-500/30'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {eqEnabled ? '✓ EQ On' : '✕ EQ Off'}
                </button>

                <div className="flex-1 w-full">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Presets</label>
                    <button
                      onClick={() => setShowSaveDialog(!showSaveDialog)}
                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700/50 rounded-lg transition-all"
                      title="Save current as preset"
                    >
                      <PlusIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {showSaveDialog && (
                    <div className="mb-3 p-3 bg-gray-800/80 rounded-xl border border-gray-700/50">
                      <input
                        type="text"
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="Preset name"
                        className="w-full px-3 py-2 bg-gray-900/50 text-white text-sm rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                        onKeyPress={(e) => e.key === 'Enter' && handleSavePreset()}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSavePreset}
                          className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold rounded-lg hover:from-blue-500 hover:to-blue-400 transition-all"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {setShowSaveDialog(false); setPresetName('');}}
                          className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {allPresets.map((preset) => {
                      const isCustom = !DEFAULT_AUDIO_PRESETS.find(p => p.name === preset.name);
                      return (
                        <div key={preset.name} className="flex items-center gap-1">
                          <button
                            onClick={() => applyPreset(preset)}
                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-center ${
                              selectedPreset === preset.name
                                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30'
                                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 border border-gray-700/50'
                            }`}
                          >
                            {preset.name}
                          </button>
                          {isCustom && (
                            <button
                              onClick={() => handleDeletePreset(preset.name)}
                              className="p-2 bg-gray-800/50 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/30 transition-all border border-gray-700/50"
                              title="Delete preset"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Master Gain */}
              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-300">Master Gain</label>
                  <span className={`text-sm font-bold ${masterGain > 1.2 ? 'text-yellow-400' : 'text-blue-400'}`}>
                    {masterGain > 1 ? '+' : ''}{((masterGain - 1) * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.01"
                  value={masterGain}
                  onChange={(e) => {setMasterGain(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                  className="w-full h-2.5 bg-gray-700 rounded-full appearance-none cursor-pointer slider-thumb"
                />
                {masterGain > 1.2 && (
                  <p className="text-xs text-yellow-500 mt-2 flex items-center gap-1">
                    <span>⚠️</span> High gain may cause clipping
                  </p>
                )}
              </div>

              {/* 10-Band EQ */}
              <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-700/50">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-gray-300">10-Band Equalizer</label>
                  <button
                    onClick={() => {
                      setEQGains([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
                      setSelectedPreset('Custom');
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                  >
                    Reset EQ
                  </button>
                </div>

                {/* Compact EQ for mobile, detailed for desktop */}
                <div className="overflow-x-auto pb-2">
                  <div className="flex items-end justify-between gap-2 sm:gap-3 min-w-[300px] sm:min-w-[600px]">
                    {EQ_BANDS.map((freq, index) => (
                      <div key={freq} className="flex flex-col items-center flex-1 min-w-[30px] sm:min-w-[50px]">
                        <div className="h-32 sm:h-40 mb-2 flex items-center justify-center relative">
                          <input
                            type="range"
                            min="-12"
                            max="12"
                            step="0.5"
                            value={eqGains[index]}
                            onChange={(e) => handleGainChange(index, parseFloat(e.target.value))}
                            className="eq-slider"
                            disabled={!eqEnabled}
                            style={{
                              transform: 'rotate(-90deg)',
                              width: '140px',
                              height: '40px'
                            }}
                          />
                        </div>
                        <span className={`text-xs font-bold mb-1 min-w-[2.5rem] text-center ${eqGains[index] > 0 ? 'text-green-400' : eqGains[index] < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                          {eqGains[index] > 0 ? '+' : ''}{eqGains[index].toFixed(1)}
                        </span>
                        <span className="text-[10px] sm:text-xs text-gray-500 font-semibold whitespace-nowrap">
                          {freq >= 1000 ? `${freq / 1000}k` : freq}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Effects Tab */}
          {activeTab === 'effects' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Reverb */}
              <div className="p-5 bg-gray-800/50 rounded-2xl border border-gray-700/50 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Reverb
                  </h3>
                  <button
                    onClick={() => {toggleReverb(); setSelectedPreset('Custom');}}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-md ${
                      reverbEnabled
                        ? 'bg-gradient-to-r from-green-600 to-green-500 text-white shadow-green-500/30'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {reverbEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Room Size */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase">Room Size</span>
                      <span className="text-xs font-bold text-blue-400">{reverbRoomSize.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="5"
                      step="0.1"
                      value={reverbRoomSize}
                      onChange={(e) => {setReverbRoomSize(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                      disabled={!reverbEnabled}
                      className="w-full h-2 bg-gray-700 rounded-full appearance-none cursor-pointer slider-thumb"
                    />
                  </div>

                  {/* Decay */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase">Decay</span>
                      <span className="text-xs font-bold text-blue-400">{reverbDecay.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={reverbDecay}
                      onChange={(e) => {setReverbDecay(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                      disabled={!reverbEnabled}
                      className="w-full h-2 bg-gray-700 rounded-full appearance-none cursor-pointer slider-thumb"
                    />
                  </div>

                  {/* Mix */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase">Mix</span>
                      <span className="text-xs font-bold text-blue-400">{(reverbWetDry * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={reverbWetDry}
                      onChange={(e) => {setReverbWetDry(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                      disabled={!reverbEnabled}
                      className="w-full h-2 bg-gray-700 rounded-full appearance-none cursor-pointer slider-thumb"
                    />
                  </div>

                  {/* Cutoff */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase">Cutoff</span>
                      <span className="text-xs font-bold text-blue-400">{reverbCutoff >= 1000 ? `${(reverbCutoff / 1000).toFixed(1)}k` : reverbCutoff}Hz</span>
                    </div>
                    <input
                      type="range"
                      min="200"
                      max="20000"
                      step="100"
                      value={reverbCutoff}
                      onChange={(e) => {setReverbCutoff(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                      disabled={!reverbEnabled}
                      className="w-full h-2 bg-gray-700 rounded-full appearance-none cursor-pointer slider-thumb"
                    />
                  </div>
                </div>
              </div>

              {/* Limiter */}
              <div className="p-5 bg-gray-800/50 rounded-2xl border border-gray-700/50 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                    Limiter
                  </h3>
                  <button
                    onClick={() => {toggleLimiter(); setSelectedPreset('Custom');}}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-md ${
                      limiterEnabled
                        ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-orange-500/30'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {limiterEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Threshold */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase">Threshold</span>
                      <span className="text-xs font-bold text-blue-400">{limiterThreshold.toFixed(1)} dB</span>
                    </div>
                    <input
                      type="range"
                      min="-60"
                      max="0"
                      step="0.5"
                      value={limiterThreshold}
                      onChange={(e) => {setLimiterThreshold(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                      disabled={!limiterEnabled}
                      className="w-full h-2 bg-gray-700 rounded-full appearance-none cursor-pointer slider-thumb"
                    />
                  </div>

                  {/* Release */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase">Release</span>
                      <span className="text-xs font-bold text-blue-400">{(limiterRelease * 1000).toFixed(0)}ms</span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="1"
                      step="0.01"
                      value={limiterRelease}
                      onChange={(e) => {setLimiterRelease(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                      disabled={!limiterEnabled}
                      className="w-full h-2 bg-gray-700 rounded-full appearance-none cursor-pointer slider-thumb"
                    />
                  </div>

                  {/* Info Box */}
                  <div className="p-3 bg-blue-900/20 rounded-xl border border-blue-700/30">
                    <p className="text-xs text-blue-300 leading-relaxed">
                      <span className="font-bold">Limiter</span> prevents audio clipping by reducing volume when it exceeds the threshold. Useful for EQ and bass boost.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end items-center p-4 sm:p-6 border-t border-gray-700/50 bg-gray-900/50">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/30"
          >
            Done
          </button>
        </div>
      </div>

      <style>{`
        .slider-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
          transition: transform 0.2s;
        }

        .slider-thumb::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }

        .slider-thumb::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
          transition: transform 0.2s;
        }

        .slider-thumb::-moz-range-thumb:hover {
          transform: scale(1.2);
        }

        .eq-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 140px;
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(to right, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #8b5cf6);
          outline: none;
          cursor: pointer;
        }

        .eq-slider:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .eq-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
          transition: transform 0.2s;
        }

        .eq-slider::-webkit-slider-thumb:hover {
          transform: scale(1.3);
        }

        .eq-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
          transition: transform 0.2s;
        }

        .eq-slider::-moz-range-thumb:hover {
          transform: scale(1.3);
        }
      `}</style>
    </div>
  );
};

export default EqualizerModal;
