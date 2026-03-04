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
        className="bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800 rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden shadow-2xl border border-gray-700/50"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'fadeIn 0.2s ease-out' }}
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
              {/* EQ Toggle and Master Gain - Row */}
              <div className="flex gap-3">
                {/* EQ Toggle */}
                <button
                  onClick={toggleEQ}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    eqEnabled
                      ? 'bg-primary text-white hover:bg-primary/90'
                      : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 border border-gray-600/50'
                  }`}
                >
                  {eqEnabled ? '✓ EQ On' : '✕ EQ Off'}
                </button>

                {/* Master Gain */}
                <div className={`flex-1 px-3 rounded-lg border transition-all duration-300 flex items-center gap-3 ${masterGain > 1.2 ? 'bg-red-900/20 border-red-700/50 clipping-indicator' : 'bg-gray-800/50 border-gray-700/50'}`}>
                  <label className="text-xs font-semibold text-gray-400 whitespace-nowrap">Master</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={masterGain}
                    onChange={(e) => {setMasterGain(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                    className="flex-1 slider-thumb"
                  />
                  <span className={`text-xs font-bold transition-colors min-w-[3rem] text-right ${masterGain > 1.2 ? 'text-red-400 clipping-warning' : 'text-blue-400'}`}>
                    {masterGain > 1 ? '+' : ''}{((masterGain - 1) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Presets */}
              <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Presets</label>
                  <button
                    onClick={() => setShowSaveDialog(!showSaveDialog)}
                    className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-700/50 rounded transition-all"
                    title="Save current as preset"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                {showSaveDialog && (
                  <div className="mb-2 p-2 bg-gray-900/50 rounded-lg border border-gray-700/50">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="Preset name"
                        className="flex-1 px-2 py-1.5 bg-gray-800 text-white text-xs rounded border border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        onKeyPress={(e) => e.key === 'Enter' && handleSavePreset()}
                        autoFocus
                      />
                      <button
                        onClick={handleSavePreset}
                        className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded hover:bg-primary/90 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {allPresets.map((preset) => {
                    const isCustom = !DEFAULT_AUDIO_PRESETS.find(p => p.name === preset.name);
                    return (
                      <div key={preset.name} className="relative group">
                        <button
                          onClick={() => applyPreset(preset)}
                          className={`preset-btn w-full px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            selectedPreset === preset.name
                              ? 'bg-primary text-white'
                              : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700 border border-gray-600/50'
                          }`}
                        >
                          {preset.name}
                        </button>
                        {isCustom && (
                          <button
                            onClick={() => handleDeletePreset(preset.name)}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            title="Delete preset"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
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

                {/* EQ Bands */}
                <div className="flex items-end justify-between gap-1 sm:gap-2">
                  {EQ_BANDS.map((freq, index) => (
                    <div key={freq} className="flex flex-col items-center flex-1">
                      {/* Value display */}
                      <div className="h-6 flex items-center justify-center mb-1">
                        <span className={`text-xs font-bold transition-colors ${!eqEnabled ? 'text-gray-600' : eqGains[index] > 0 ? 'text-green-400' : eqGains[index] < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                          {eqGains[index] > 0 ? '+' : ''}{eqGains[index].toFixed(1)}
                        </span>
                      </div>

                      {/* Vertical slider container */}
                      <div className="relative h-32 w-5 flex items-center justify-center">
                        {/* Track background */}
                        <div className={`absolute w-1 h-full rounded-full ${!eqEnabled ? 'bg-gray-700' : 'bg-gray-700'}`}></div>

                        {/* Fill (positive values) */}
                        {eqGains[index] > 0 && (
                          <div
                            className="absolute bottom-1/2 w-1 bg-gradient-to-t from-blue-500 to-blue-400 rounded-full transition-all duration-100"
                            style={{ height: `${(eqGains[index] / 12) * 50}%` }}
                          ></div>
                        )}

                        {/* Fill (negative values) */}
                        {eqGains[index] < 0 && (
                          <div
                            className="absolute top-1/2 w-1 bg-gradient-to-b from-blue-500 to-blue-400 rounded-full transition-all duration-100"
                            style={{ height: `${(Math.abs(eqGains[index]) / 12) * 50}%` }}
                          ></div>
                        )}

                        {/* Center line */}
                        <div className="absolute w-2 h-0.5 bg-gray-500 rounded-full"></div>

                        {/* Thumb/Handle */}
                        <div
                          className={`absolute w-3 h-3 rounded-full shadow-lg transition-all duration-100 cursor-grab active:cursor-grabbing ${
                            !eqEnabled ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-400 hover:scale-125'
                          }`}
                          style={{
                            bottom: `${50 + (eqGains[index] / 12) * 50}%`,
                            transform: 'translateY(50%)'
                          }}
                          onMouseDown={(e) => {
                            if (!eqEnabled) return;
                            const container = e.currentTarget.parentElement;
                            const containerRect = container.getBoundingClientRect();
                            const centerY = containerRect.top + containerRect.height / 2;

                            const handleMouseMove = (moveEvent: MouseEvent) => {
                              const newY = moveEvent.clientY - centerY;
                              const percentage = (newY / (containerRect.height / 2)) * -12;
                              const clampedValue = Math.max(-12, Math.min(12, percentage));
                              const steppedValue = Math.round(clampedValue * 2) / 2;
                              handleGainChange(index, steppedValue);
                            };

                            const handleMouseUp = () => {
                              document.removeEventListener('mousemove', handleMouseMove);
                              document.removeEventListener('mouseup', handleMouseUp);
                            };

                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                          }}
                        ></div>
                      </div>

                      {/* Frequency label */}
                      <span className={`text-[10px] font-semibold mt-2 ${!eqEnabled ? 'text-gray-600' : 'text-gray-500'}`}>
                        {freq >= 1000 ? `${freq / 1000}k` : freq}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Effects Tab */}
          {activeTab === 'effects' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Reverb */}
              <div className="p-5 bg-gray-800/50 rounded-2xl border border-gray-700/50 shadow-lg transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full transition-all ${reverbEnabled ? 'bg-green-500 animate-pulse shadow-lg shadow-green-500/50' : 'bg-gray-500'}`}></span>
                    Reverb
                  </h3>
                  <button
                    onClick={() => {toggleReverb(); setSelectedPreset('Custom');}}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                      reverbEnabled
                        ? 'bg-primary text-white hover:bg-primary/90'
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {reverbEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Room Size */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className={`text-xs font-semibold uppercase transition-colors ${reverbEnabled ? 'text-gray-400' : 'text-gray-600'}`}>Room Size</span>
                      <span className={`text-xs font-bold transition-colors ${reverbEnabled ? 'text-blue-400' : 'text-gray-600'}`}>{reverbRoomSize.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="5"
                      step="0.1"
                      value={reverbRoomSize}
                      onChange={(e) => {setReverbRoomSize(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                      disabled={!reverbEnabled}
                      className="w-full slider-thumb"
                    />
                  </div>

                  {/* Decay */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className={`text-xs font-semibold uppercase transition-colors ${reverbEnabled ? 'text-gray-400' : 'text-gray-600'}`}>Decay</span>
                      <span className={`text-xs font-bold transition-colors ${reverbEnabled ? 'text-blue-400' : 'text-gray-600'}`}>{reverbDecay.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={reverbDecay}
                      onChange={(e) => {setReverbDecay(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                      disabled={!reverbEnabled}
                      className="w-full slider-thumb"
                    />
                  </div>

                  {/* Mix */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className={`text-xs font-semibold uppercase transition-colors ${reverbEnabled ? 'text-gray-400' : 'text-gray-600'}`}>Mix</span>
                      <span className={`text-xs font-bold transition-colors ${reverbEnabled ? 'text-blue-400' : 'text-gray-600'}`}>{(reverbWetDry * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={reverbWetDry}
                      onChange={(e) => {setReverbWetDry(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                      disabled={!reverbEnabled}
                      className="w-full slider-thumb"
                    />
                  </div>

                  {/* Cutoff */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className={`text-xs font-semibold uppercase transition-colors ${reverbEnabled ? 'text-gray-400' : 'text-gray-600'}`}>Cutoff</span>
                      <span className={`text-xs font-bold transition-colors ${reverbEnabled ? 'text-blue-400' : 'text-gray-600'}`}>{reverbCutoff >= 1000 ? `${(reverbCutoff / 1000).toFixed(1)}k` : reverbCutoff}Hz</span>
                    </div>
                    <input
                      type="range"
                      min="200"
                      max="20000"
                      step="100"
                      value={reverbCutoff}
                      onChange={(e) => {setReverbCutoff(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                      disabled={!reverbEnabled}
                      className="w-full slider-thumb"
                    />
                  </div>
                </div>
              </div>

              {/* Limiter */}
              <div className="p-5 bg-gray-800/50 rounded-2xl border border-gray-700/50 shadow-lg transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full transition-all ${limiterEnabled ? 'bg-orange-500 animate-pulse shadow-lg shadow-orange-500/50' : 'bg-gray-500'}`}></span>
                    Limiter
                  </h3>
                  <button
                    onClick={() => {toggleLimiter(); setSelectedPreset('Custom');}}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                      limiterEnabled
                        ? 'bg-primary text-white hover:bg-primary/90'
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {limiterEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Threshold */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className={`text-xs font-semibold uppercase transition-colors ${limiterEnabled ? 'text-gray-400' : 'text-gray-600'}`}>Threshold</span>
                      <span className={`text-xs font-bold transition-colors ${limiterEnabled ? 'text-blue-400' : 'text-gray-600'}`}>{limiterThreshold.toFixed(1)} dB</span>
                    </div>
                    <input
                      type="range"
                      min="-60"
                      max="0"
                      step="0.5"
                      value={limiterThreshold}
                      onChange={(e) => {setLimiterThreshold(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                      disabled={!limiterEnabled}
                      className="w-full slider-thumb"
                    />
                  </div>

                  {/* Release */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className={`text-xs font-semibold uppercase transition-colors ${limiterEnabled ? 'text-gray-400' : 'text-gray-600'}`}>Release</span>
                      <span className={`text-xs font-bold transition-colors ${limiterEnabled ? 'text-blue-400' : 'text-gray-600'}`}>{(limiterRelease * 1000).toFixed(0)}ms</span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="1"
                      step="0.01"
                      value={limiterRelease}
                      onChange={(e) => {setLimiterRelease(parseFloat(e.target.value)); setSelectedPreset('Custom');}}
                      disabled={!limiterEnabled}
                      className="w-full slider-thumb"
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
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-semibold"
          >
            Done
          </button>
        </div>
      </div>

      <style>{`
        /* Smooth animations for the entire modal */
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        @keyframes pulse-warning {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 5px rgba(239, 68, 68, 0.5); }
          50% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.8), 0 0 30px rgba(239, 68, 68, 0.4); }
        }

        /* Horizontal slider styles */
        .slider-thumb::-webkit-slider-runnable-track {
          width: 100%;
          height: 8px;
          border-radius: 4px;
          background: linear-gradient(90deg, #1e3a5f 0%, #2d4a6f 50%, #3b5a8f 100%);
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .slider-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #60a5fa, #3b82f6);
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.5), 0 0 0 3px rgba(59, 130, 246, 0.1);
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          margin-top: -6px;
        }

        .slider-thumb::-webkit-slider-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.6), 0 0 0 5px rgba(59, 130, 246, 0.15);
          background: linear-gradient(135deg, #93c5fd, #60a5fa);
        }

        .slider-thumb::-webkit-slider-thumb:active {
          transform: scale(1.05);
          box-shadow: 0 2px 6px rgba(59, 130, 246, 0.5);
        }

        .slider-thumb::-moz-range-track {
          width: 100%;
          height: 8px;
          border-radius: 4px;
          background: linear-gradient(90deg, #1e3a5f 0%, #2d4a6f 50%, #3b5a8f 100%);
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .slider-thumb::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(135deg, #60a5fa, #3b82f6);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.5), 0 0 0 3px rgba(59, 130, 246, 0.1);
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .slider-thumb::-moz-range-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.6), 0 0 0 5px rgba(59, 130, 246, 0.15);
          background: linear-gradient(135deg, #93c5fd, #60a5fa);
        }

        /* Disabled state for sliders */
        .slider-thumb:disabled::-webkit-slider-thumb {
          background: linear-gradient(135deg, #6b7280, #4b5563);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
          cursor: not-allowed;
        }

        .slider-thumb:disabled::-moz-range-thumb {
          background: linear-gradient(135deg, #6b7280, #4b5563);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
          cursor: not-allowed;
        }

        /* Clipping warning animation */
        .clipping-warning {
          animation: pulse-warning 1s ease-in-out infinite;
        }

        .clipping-indicator {
          animation: glow-pulse 1.5s ease-in-out infinite;
        }

        /* Preset button hover glow */
        .preset-btn {
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .preset-btn:hover {
          transform: translateY(-1px);
        }

        .preset-btn:active {
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
};

export default EqualizerModal;
