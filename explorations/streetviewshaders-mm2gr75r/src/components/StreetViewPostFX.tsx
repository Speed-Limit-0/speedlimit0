/**
 * StreetViewPostFX
 *
 * Post-processing wrapper that attaches the custom god-rays effect
 * to the R3F scene. Updates the lightScreenPos uniform every frame
 * based on a world-space sun direction.
 */
import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from '@react-three/postprocessing';
import {
    StreetViewGodRaysEffectImpl,
    type StreetViewGodRaysOptions,
} from '../effects/StreetViewGodRaysEffect';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Project a world-space point into normalized screen-space UV (0-1).
 * UV origin is top-left:  x: 0 (left) → 1 (right), y: 0 (top) → 1 (bottom).
 */
function worldToScreenUV(
    camera: THREE.Camera,
    worldPos: THREE.Vector3,
    out = new THREE.Vector2()
): THREE.Vector2 {
    const clip = worldPos.clone().project(camera);
    out.set(
        0.5 * (clip.x + 1.0),   // clip.x  -1→1  mapped to  0→1
        0.5 * (1.0 - clip.y)    // clip.y  -1→1  mapped to  1→0  (flip Y for UV)
    );
    return out;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface StreetViewPostFXProps extends StreetViewGodRaysOptions {
    /**
     * Sun direction in world space (unit vector).
     * Defaults to "high and slightly left" — roughly a mid-morning sun.
     */
    sunDirection?: THREE.Vector3;
}

export function StreetViewPostFX({
    sunDirection,
    ...effectOptions
}: StreetViewPostFXProps) {
    const { camera } = useThree();

    // Memoize the effect so we don't recreate it every render
    const effect = useMemo(
        () => new StreetViewGodRaysEffectImpl(effectOptions),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    // Keep a stable reference to the sun direction vector
    const sunDirRef = useRef(
        sunDirection?.clone().normalize() ??
        new THREE.Vector3(-0.4, 0.6, -0.7).normalize()
    );

    // Update if the prop changes
    useEffect(() => {
        if (sunDirection) {
            sunDirRef.current.copy(sunDirection).normalize();
        }
    }, [sunDirection]);

    // Scratch objects (avoid per-frame allocation)
    const _sunPos = useMemo(() => new THREE.Vector3(), []);
    const _screenUV = useMemo(() => new THREE.Vector2(), []);

    /**
     * Every frame: project the "sun" (a point far away in sunDirection)
     * into screen-space and push it into the shader uniform.
     */
    useFrame(() => {
        // Build a far point representing the sun's position
        _sunPos
            .copy(camera.position)
            .addScaledVector(sunDirRef.current, 100);

        worldToScreenUV(camera, _sunPos, _screenUV);

        const lightPos = effect.uniforms.get('lightScreenPos')!
            .value as THREE.Vector2;
        lightPos.copy(_screenUV);
    });

    return (
        <EffectComposer>
            <primitive object={effect} />
        </EffectComposer>
    );
}
