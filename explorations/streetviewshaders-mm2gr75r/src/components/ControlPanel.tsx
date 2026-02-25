/**
 * ControlPanel
 *
 * A floating glassmorphism HUD that exposes all god-ray shader parameters
 * so you can tweak the effect in real time.
 */
import { useCallback, useState } from 'react';
import * as THREE from 'three';
import './ControlPanel.css';

export interface GodRayParams {
    exposure: number;
    decay: number;
    density: number;
    weight: number;
    maxSamples: number;
    luminanceThreshold: number;
    sunAzimuth: number;   // degrees, 0 = North
    sunElevation: number; // degrees, 0 = horizon
}

interface ControlPanelProps {
    params: GodRayParams;
    onChange: (params: GodRayParams) => void;
}

/**
 * Convert spherical angles (azimuth, elevation) in degrees to a unit direction vector.
 */
export function sunAnglesToDirection(
    azimuthDeg: number,
    elevationDeg: number
): THREE.Vector3 {
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    const el = THREE.MathUtils.degToRad(elevationDeg);
    return new THREE.Vector3(
        -Math.sin(az) * Math.cos(el),
        Math.sin(el),
        -Math.cos(az) * Math.cos(el)
    ).normalize();
}

export function ControlPanel({ params, onChange }: ControlPanelProps) {
    const [collapsed, setCollapsed] = useState(false);

    const set = useCallback(
        (key: keyof GodRayParams, value: number) => {
            onChange({ ...params, [key]: value });
        },
        [params, onChange]
    );

    return (
        <div className={`control-panel ${collapsed ? 'collapsed' : ''}`}>
            <button
                className="collapse-btn"
                onClick={() => setCollapsed((c) => !c)}
                title={collapsed ? 'Expand controls' : 'Collapse controls'}
            >
                {collapsed ? '◀' : '▶'}
            </button>

            {!collapsed && (
                <>
                    <h2 className="cp-title">☀️ God Rays</h2>

                    <label className="cp-label">
                        <span>Exposure</span>
                        <input
                            type="range"
                            min="0"
                            max="1.5"
                            step="0.01"
                            value={params.exposure}
                            onChange={(e) => set('exposure', +e.target.value)}
                        />
                        <span className="cp-value">{params.exposure.toFixed(2)}</span>
                    </label>

                    <label className="cp-label">
                        <span>Decay</span>
                        <input
                            type="range"
                            min="0.8"
                            max="1.0"
                            step="0.001"
                            value={params.decay}
                            onChange={(e) => set('decay', +e.target.value)}
                        />
                        <span className="cp-value">{params.decay.toFixed(3)}</span>
                    </label>

                    <label className="cp-label">
                        <span>Density</span>
                        <input
                            type="range"
                            min="0.1"
                            max="2.0"
                            step="0.01"
                            value={params.density}
                            onChange={(e) => set('density', +e.target.value)}
                        />
                        <span className="cp-value">{params.density.toFixed(2)}</span>
                    </label>

                    <label className="cp-label">
                        <span>Weight</span>
                        <input
                            type="range"
                            min="0"
                            max="1.5"
                            step="0.01"
                            value={params.weight}
                            onChange={(e) => set('weight', +e.target.value)}
                        />
                        <span className="cp-value">{params.weight.toFixed(2)}</span>
                    </label>

                    <label className="cp-label">
                        <span>Samples</span>
                        <input
                            type="range"
                            min="8"
                            max="128"
                            step="1"
                            value={params.maxSamples}
                            onChange={(e) => set('maxSamples', +e.target.value)}
                        />
                        <span className="cp-value">{params.maxSamples}</span>
                    </label>

                    <label className="cp-label">
                        <span>Lum. Threshold</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={params.luminanceThreshold}
                            onChange={(e) => set('luminanceThreshold', +e.target.value)}
                        />
                        <span className="cp-value">
                            {params.luminanceThreshold.toFixed(2)}
                        </span>
                    </label>

                    <hr className="cp-divider" />

                    <label className="cp-label">
                        <span>Sun Azimuth</span>
                        <input
                            type="range"
                            min="0"
                            max="360"
                            step="1"
                            value={params.sunAzimuth}
                            onChange={(e) => set('sunAzimuth', +e.target.value)}
                        />
                        <span className="cp-value">{params.sunAzimuth}°</span>
                    </label>

                    <label className="cp-label">
                        <span>Sun Elevation</span>
                        <input
                            type="range"
                            min="-10"
                            max="90"
                            step="1"
                            value={params.sunElevation}
                            onChange={(e) => set('sunElevation', +e.target.value)}
                        />
                        <span className="cp-value">{params.sunElevation}°</span>
                    </label>
                </>
            )}
        </div>
    );
}
