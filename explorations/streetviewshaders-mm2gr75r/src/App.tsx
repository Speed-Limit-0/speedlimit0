import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer } from '@react-three/postprocessing';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ASCIIEffect } from './effects/ASCIIEffect';
import { DitherEffect } from './effects/DitherEffect';
import { WaterEffect } from './effects/WaterEffect';
import { PaintingEffect } from './effects/PaintingEffect';
import { HalftoneEffect } from './effects/HalftoneEffect';
import './App.css';

const API_KEY = 'AIzaSyADnfI6UlAfHKyDuFqwFTGF-b0E5vCfGQY';

type FilterType = 'none' | 'dither' | 'ascii' | 'water' | 'painting' | 'halftone';

const FILTERS: { id: FilterType; label: string; icon: string }[] = [
    { id: 'none', label: 'None', icon: '○' },
    { id: 'dither', label: 'Dither', icon: '◆' },
    { id: 'ascii', label: 'ASCII', icon: '▤' },
    { id: 'water', label: 'Water', icon: '〜' },
    { id: 'painting', label: 'Painting', icon: '🖌' },
    { id: 'halftone', label: 'Halftone', icon: '◉' },
];

// Palette / gradient-map presets for the painting effect (LUT-style). id 0 = no palette. 9 = Custom (user colors).
const PAINTING_PALETTES: { id: number; label: string }[] = [
    { id: 0, label: 'None' },
    { id: 1, label: 'Sepia' },
    { id: 2, label: 'Noir' },
    { id: 3, label: 'Teal & Orange' },
    { id: 4, label: 'Golden Hour' },
    { id: 5, label: 'Cool Film' },
    { id: 6, label: 'Vintage' },
    { id: 7, label: 'Muted' },
    { id: 8, label: 'Warm Film' },
    { id: 9, label: 'Custom' },
];

// ─── Google Maps JS API loader (Street View metadata only) ────────────────────

const GOOGLE_MAPS_API_URL =
    `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&v=weekly`;

let googleMapsLoadingPromise: Promise<void> | null = null;

const loadGoogleMapsApi = (): Promise<void> => {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('Window is not available'));
    }

    if (googleMapsLoadingPromise) {
        return googleMapsLoadingPromise;
    }

    const maybeGoogle = (window as any).google;
    if (maybeGoogle && maybeGoogle.maps && maybeGoogle.maps.StreetViewService) {
        googleMapsLoadingPromise = Promise.resolve();
        return googleMapsLoadingPromise;
    }

    googleMapsLoadingPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = GOOGLE_MAPS_API_URL;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            const loadedGoogle = (window as any).google;
            if (loadedGoogle && loadedGoogle.maps && loadedGoogle.maps.StreetViewService) {
                resolve();
                return;
            }
            reject(
                new Error('Google Maps JS API loaded but Street View Service is unavailable.'),
            );
        };
        script.onerror = () => reject(new Error('Failed to load Google Maps JS API'));
        document.head.appendChild(script);
    });

    return googleMapsLoadingPromise;
};

// ─── Street View cube stitched from Static API ────────────────────────────────

interface StreetViewCubeProps {
    panoId: string | null;
    rotationX?: number;
    rotationY?: number;
    rotationZ?: number;
    onClickHeading?: (headingDeg: number, screenPos: { x: number; y: number }) => void;
}

function StreetViewCube({
    panoId,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
    onClickHeading,
}: StreetViewCubeProps) {
    const [materials, setMaterials] = useState<THREE.MeshBasicMaterial[] | null>(null);
    const [loading, setLoading] = useState(false);
    const pointerDownRef = useRef<{ clientX: number; clientY: number; point: THREE.Vector3 } | null>(null);

    const DRAG_THRESHOLD_PX = 6;

    useEffect(() => {
        let active = true;

        if (!panoId) {
            setMaterials(null);
            setLoading(false);
            return () => {
                active = false;
            };
        }

        setLoading(true);
        setMaterials(null);

        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');

        const faces = [
            { h: 90, p: 0 },
            { h: 270, p: 0 },
            { h: 0, p: 90 },
            { h: 0, p: -90 },
            { h: 0, p: 0 },
            { h: 180, p: 0 },
        ];

        const loadFaces = async () => {
            try {
                const textures = await Promise.all(
                    faces.map(({ h, p }) => {
                        const params = new URLSearchParams({
                            size: '640x640',
                            pano: panoId,
                            heading: String(h),
                            pitch: String(p),
                            fov: '90',
                            key: API_KEY,
                        });
                        const url = `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
                        return new Promise<THREE.Texture>((resolve) => {
                            loader.load(url, (tex) => {
                                tex.colorSpace = THREE.SRGBColorSpace;
                                tex.minFilter = THREE.LinearFilter;
                                tex.generateMipmaps = false;
                                resolve(tex);
                            });
                        });
                    }),
                );

                if (!active) return;

                setMaterials(
                    textures.map(
                        (tex) =>
                            new THREE.MeshBasicMaterial({
                                map: tex,
                                side: THREE.BackSide,
                            }),
                    ),
                );
                setLoading(false);
            } catch (error) {
                console.error('StreetView cube load failed', error);
                if (active) {
                    setLoading(false);
                }
            }
        };

        loadFaces();

        return () => {
            active = false;
        };
    }, [panoId]);

    if (!panoId) {
        return (
            <Html center>
                <div className="loading-indicator">
                    <p>Enter an address to start exploring Street View.</p>
                </div>
            </Html>
        );
    }

    if (loading || !materials) {
        return (
            <Html center>
                <div className="loading-indicator">
                    <div className="spinner" />
                    <p>Stitching panorama…</p>
                </div>
            </Html>
        );
    }

    const handlePointerDown = (event: any) => {
        pointerDownRef.current = {
            clientX: event.nativeEvent.clientX,
            clientY: event.nativeEvent.clientY,
            point: event.point.clone(),
        };
    };

    const handlePointerUp = (event: any) => {
        const down = pointerDownRef.current;
        pointerDownRef.current = null;
        if (!down || !onClickHeading) return;

        const dx = event.nativeEvent.clientX - down.clientX;
        const dy = event.nativeEvent.clientY - down.clientY;
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) return;

        const point = down.point.clone().normalize();
        const headingRad = Math.atan2(point.x, -point.z);
        let headingDeg = THREE.MathUtils.radToDeg(headingRad);
        if (headingDeg < 0) headingDeg += 360;

        onClickHeading(headingDeg, { x: down.clientX, y: down.clientY });
    };

    return (
        <mesh
            material={materials}
            scale={[-1, 1, 1]}
            rotation={[rotationX, rotationY, rotationZ]}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
        >
            <boxGeometry args={[100, 100, 100]} />
        </mesh>
    );
}

// ─── Effect Passes ────────────────────────────────────────────────────────────

function DitherPass({
    levels,
    bayerSize,
    strength,
    foregroundColor,
    backgroundColor,
}: {
    levels: number;
    bayerSize: number;
    strength: number;
    foregroundColor: string;
    backgroundColor: string;
}) {
    const effect = useMemo(
        () =>
            new DitherEffect({
                levels,
                bayerSize,
                strength,
                foregroundColor,
                backgroundColor,
            }),
        [],
    );

    useEffect(() => {
        effect.levels = levels;
    }, [levels, effect]);
    useEffect(() => {
        effect.bayerSize = bayerSize;
    }, [bayerSize, effect]);
    useEffect(() => {
        effect.strength = strength;
    }, [strength, effect]);
    useEffect(() => {
        effect.foregroundColor = foregroundColor;
    }, [foregroundColor, effect]);
    useEffect(() => {
        effect.backgroundColor = backgroundColor;
    }, [backgroundColor, effect]);

    return <primitive object={effect} />;
}

function AsciiPass({
    cellSize,
    color,
    bgColor,
    invert,
    useOriginalColor,
}: {
    cellSize: number;
    color: string;
    bgColor: string;
    invert: boolean;
    useOriginalColor: boolean;
}) {
    const effect = useMemo(
        () =>
            new ASCIIEffect({
                cellSize,
                color,
                bgColor,
                invert,
                useOriginalColor,
            }),
        [],
    );

    useEffect(() => {
        effect.cellSize = cellSize;
    }, [cellSize, effect]);
    useEffect(() => {
        effect.color = color;
    }, [color, effect]);
    useEffect(() => {
        effect.bgColor = bgColor;
    }, [bgColor, effect]);
    useEffect(() => {
        effect.invert = invert;
    }, [invert, effect]);
    useEffect(() => {
        effect.useOriginalColor = useOriginalColor;
    }, [useOriginalColor, effect]);

    return <primitive object={effect} />;
}

function WaterPass({
    speed,
    strength,
    frequency,
}: {
    speed: number;
    strength: number;
    frequency: number;
}) {
    const effect = useMemo(
        () =>
            new WaterEffect({
                speed,
                strength,
                frequency,
            }),
        [],
    );

    useEffect(() => {
        effect.speed = speed;
    }, [speed, effect]);
    useEffect(() => {
        effect.strength = strength;
    }, [strength, effect]);
    useEffect(() => {
        effect.frequency = frequency;
    }, [frequency, effect]);

    return <primitive object={effect} />;
}

function PaintingPass({
    scale,
    sharpness,
    saturation,
    contrast,
    brightness,
    vignetteStrength,
    vignetteFeather,
    temperature,
    palette,
    paletteAmount,
    customShadowHex,
    customMidHex,
    customHighlightHex,
}: {
    scale: number;
    sharpness: number;
    saturation: number;
    contrast: number;
    brightness: number;
    vignetteStrength: number;
    vignetteFeather: number;
    temperature: number;
    palette: number;
    paletteAmount: number;
    customShadowHex: string;
    customMidHex: string;
    customHighlightHex: string;
}) {
    const customShadow = useMemo(() => new THREE.Color(customShadowHex), [customShadowHex]);
    const customMid = useMemo(() => new THREE.Color(customMidHex), [customMidHex]);
    const customHighlight = useMemo(() => new THREE.Color(customHighlightHex), [customHighlightHex]);

    const effect = useMemo(
        () =>
            new PaintingEffect({
                scale,
                sharpness,
                saturation,
                contrast,
                brightness,
                vignetteStrength,
                vignetteFeather,
                temperature,
                palette,
                paletteAmount,
                customShadow,
                customMid,
                customHighlight,
            }),
        [],
    );

    useEffect(() => {
        effect.scale = scale;
    }, [scale, effect]);
    useEffect(() => {
        effect.sharpness = sharpness;
    }, [sharpness, effect]);
    useEffect(() => {
        effect.saturation = saturation;
    }, [saturation, effect]);
    useEffect(() => {
        effect.contrast = contrast;
    }, [contrast, effect]);
    useEffect(() => {
        effect.brightness = brightness;
    }, [brightness, effect]);
    useEffect(() => {
        effect.vignetteStrength = vignetteStrength;
    }, [vignetteStrength, effect]);
    useEffect(() => {
        effect.vignetteFeather = vignetteFeather;
    }, [vignetteFeather, effect]);
    useEffect(() => {
        effect.temperature = temperature;
    }, [temperature, effect]);
    useEffect(() => {
        effect.palette = palette;
    }, [palette, effect]);
    useEffect(() => {
        effect.paletteAmount = paletteAmount;
    }, [paletteAmount, effect]);
    useEffect(() => {
        effect.customShadow = customShadow;
    }, [customShadow, effect]);
    useEffect(() => {
        effect.customMid = customMid;
    }, [customMid, effect]);
    useEffect(() => {
        effect.customHighlight = customHighlight;
    }, [customHighlight, effect]);

    return <primitive object={effect} />;
}

function HalftonePass({
    dotSize,
    angle,
    softness,
    dotColor,
    bgColor,
}: {
    dotSize: number;
    angle: number;
    softness: number;
    dotColor: string;
    bgColor: string;
}) {
    const effect = useMemo(
        () =>
            new HalftoneEffect({
                dotSize,
                angle,
                softness,
                dotColor,
                bgColor,
            }),
        [],
    );

    useEffect(() => {
        effect.dotSize = dotSize;
    }, [dotSize, effect]);
    useEffect(() => {
        effect.angle = angle;
    }, [angle, effect]);
    useEffect(() => {
        effect.softness = softness;
    }, [softness, effect]);
    useEffect(() => {
        effect.dotColor = dotColor;
    }, [dotColor, effect]);
    useEffect(() => {
        effect.bgColor = bgColor;
    }, [bgColor, effect]);

    return <primitive object={effect} />;
}

// ─── Slider + Colour helpers ──────────────────────────────────────────────────

function Slider({
    label,
    min,
    max,
    step = 0.01,
    value,
    fmt,
    onChange,
}: {
    label: string;
    min: number;
    max: number;
    step?: number;
    value: number;
    fmt?: (v: number) => string;
    onChange: (v: number) => void;
}) {
    return (
        <label className="row">
            <span>{label}</span>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(+event.target.value)}
            />
            <span className="val">
                {fmt ? fmt(value) : value.toFixed(2)}
            </span>
        </label>
    );
}

function ColorPicker({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <label className="row">
            <span>{label}</span>
            <input
                type="color"
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
            <span className="val">{value}</span>
        </label>
    );
}

// ─── Types for Street View navigation ─────────────────────────────────────────

interface StreetViewLink {
    heading: number;
    description: string;
    pano: string;
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
    const [filter, setFilter] = useState<FilterType>('dither');
    const [horizon, setHorizon] = useState(0);

    // Dither
    const [levels, setLevels] = useState(8);
    const [bayerSize, setBayerSize] = useState(2.0);
    const [strength, setStrength] = useState(1.0);
    const [ditherFg, setDitherFg] = useState('#ffffff');
    const [ditherBg, setDitherBg] = useState('#000000');

    // ASCII
    const [cellSize, setCellSize] = useState(11);
    const [asciiColor, setAsciiColor] = useState('#00ff41');
    const [asciiBg, setAsciiBg] = useState('#000000');
    const [invert, setInvert] = useState(false);
    const [useOriginalColor, setUseOriginalColor] = useState(false);

    // Water
    const [waterSpeed, setWaterSpeed] = useState(0.6);
    const [waterStrength, setWaterStrength] = useState(4.0);
    const [waterFrequency, setWaterFrequency] = useState(3.0);

    // Painting
    const [paintScale, setPaintScale] = useState(3.0);
    const [paintSharpness, setPaintSharpness] = useState(0.0);
    const [paintSaturation, setPaintSaturation] = useState(1.0);
    const [paintContrast, setPaintContrast] = useState(1.0);
    const [paintBrightness, setPaintBrightness] = useState(1.0);
    const [paintVignetteStrength, setPaintVignetteStrength] = useState(0.0);
    const [paintVignetteFeather, setPaintVignetteFeather] = useState(0.5);
    const [paintTemperature, setPaintTemperature] = useState(0.0);
    const [paintPalette, setPaintPalette] = useState(0);
    const [paintPaletteAmount, setPaintPaletteAmount] = useState(1.0);
    const [paintPaletteShadow, setPaintPaletteShadow] = useState('#1f150d');
    const [paintPaletteMid, setPaintPaletteMid] = useState('#806b52');
    const [paintPaletteHighlight, setPaintPaletteHighlight] = useState('#ebd1a6');

    // Halftone
    const [dotSize, setDotSize] = useState(6.0);
    const [dotAngle, setDotAngle] = useState(0.26);
    const [dotSoftness, setDotSoftness] = useState(1.0);
    const [dotColor, setDotColor] = useState('#000000');
    const [dotBg, setDotBg] = useState('#ffffff');

    // Street View control
    const [isApiReady, setIsApiReady] = useState(false);
    const [addressInput, setAddressInput] = useState('San Francisco, CA');
    const [searchError, setSearchError] = useState<string | null>(null);
    const [isLoadingPano, setIsLoadingPano] = useState(false);
    const [currentPanoId, setCurrentPanoId] = useState<string | null>(null);
    const [links, setLinks] = useState<StreetViewLink[]>([]);
    const [clickIndicator, setClickIndicator] = useState<{ x: number; y: number } | null>(null);

    const streetViewServiceRef = useRef<any | null>(null);
    const geocoderRef = useRef<any | null>(null);

    useEffect(() => {
        if (!clickIndicator) return;
        const t = setTimeout(() => setClickIndicator(null), 400);
        return () => clearTimeout(t);
    }, [clickIndicator]);

    // Load JS API once
    useEffect(() => {
        let cancelled = false;

        loadGoogleMapsApi()
            .then(() => {
                if (cancelled) return;
                setIsApiReady(true);
            })
            .catch((error) => {
                console.error(error);
                if (!cancelled) {
                    setSearchError('Failed to load Google Maps. Please refresh.');
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    // Initialise Street View service and load initial SF pano
    useEffect(() => {
        if (!isApiReady) return;
        if (streetViewServiceRef.current || geocoderRef.current) return;

        const g = (window as any).google;
        if (!g || !g.maps || !g.maps.StreetViewService || !g.maps.Geocoder) {
            setSearchError('Google Maps Street View is unavailable for this API key.');
            return;
        }

        streetViewServiceRef.current = new g.maps.StreetViewService();
        geocoderRef.current = new g.maps.Geocoder();

        // Load an initial panorama around San Francisco
        setIsLoadingPano(true);
        geocoderRef.current.geocode(
            { address: addressInput },
            (results: any, status: string) => {
                if (status !== 'OK' || !results || !results[0]) {
                    setIsLoadingPano(false);
                    setSearchError('Could not find an initial Street View location.');
                    return;
                }

                const location = results[0].geometry.location;
                streetViewServiceRef.current.getPanorama(
                    {
                        location,
                        radius: 100,
                    },
                    (data: any, svStatus: string) => {
                        setIsLoadingPano(false);
                        if (svStatus !== 'OK' || !data || !data.location) {
                            setSearchError('No Street View available at that location.');
                            return;
                        }

                        setCurrentPanoId(data.location.pano);
                        setLinks(
                            (data.links || []).map((link: any) => ({
                                heading: link.heading,
                                description: link.description,
                                pano: link.pano,
                            })),
                        );
                    },
                );
            },
        );
    }, [isApiReady, addressInput]);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();

        if (!addressInput.trim()) {
            setSearchError('Please enter an address.');
            return;
        }

        if (!streetViewServiceRef.current || !geocoderRef.current) {
            setSearchError('Maps is still loading. Please wait a moment.');
            return;
        }

        setSearchError(null);
        setIsLoadingPano(true);

        geocoderRef.current.geocode(
            { address: addressInput.trim() },
            (results: any, status: string) => {
                if (status !== 'OK' || !results || !results[0]) {
                    setIsLoadingPano(false);
                    setSearchError('Address not found. Try a different place.');
                    return;
                }

                const location = results[0].geometry.location;
                streetViewServiceRef.current.getPanorama(
                    {
                        location,
                        radius: 100,
                    },
                    (data: any, svStatus: string) => {
                        setIsLoadingPano(false);
                        if (svStatus !== 'OK' || !data || !data.location) {
                            setSearchError('No Street View available at that address.');
                            return;
                        }

                        setCurrentPanoId(data.location.pano);
                        setLinks(
                            (data.links || []).map((link: any) => ({
                                heading: link.heading,
                                description: link.description,
                                pano: link.pano,
                            })),
                        );
                    },
                );
            },
        );
    };

    const handleClickLink = (link: StreetViewLink) => {
        if (!streetViewServiceRef.current) {
            return;
        }

        setSearchError(null);
        setIsLoadingPano(true);

        streetViewServiceRef.current.getPanorama(
            {
                pano: link.pano,
            },
            (data: any, svStatus: string) => {
                setIsLoadingPano(false);
                if (svStatus !== 'OK' || !data || !data.location) {
                    setSearchError('Failed to move to that Street View location.');
                    return;
                }

                setCurrentPanoId(data.location.pano);
                setLinks(
                    (data.links || []).map((l: any) => ({
                        heading: l.heading,
                        description: l.description,
                        pano: l.pano,
                    })),
                );
            },
        );
    };

    const handleClickHeading = (headingDeg: number, screenPos: { x: number; y: number }) => {
        if (!links.length) return;

        let bestLink: StreetViewLink | null = null;
        let bestScore = Number.POSITIVE_INFINITY;

        for (const link of links) {
            const rawDiff = link.heading - headingDeg;
            const wrappedDiff = ((rawDiff + 540) % 360) - 180;
            const score = Math.abs(wrappedDiff);
            if (score < bestScore) {
                bestScore = score;
                bestLink = link;
            }
        }

        if (!bestLink || bestScore > 35) return;

        setClickIndicator(screenPos);
        handleClickLink(bestLink);
    };

    return (
        <div className="app-root">
            <Canvas
                camera={{
                    fov: 80,
                    near: 0.1,
                    far: 500,
                    position: [0, 0, 0.1],
                }}
            >
                <Suspense fallback={null}>
                    <StreetViewCube
                        panoId={currentPanoId}
                        rotationZ={THREE.MathUtils.degToRad(horizon)}
                        onClickHeading={handleClickHeading}
                    />
                </Suspense>

                <EffectComposer disableNormalPass>
                    {filter === 'dither' && (
                        <DitherPass
                            levels={levels}
                            bayerSize={bayerSize}
                            strength={strength}
                            foregroundColor={ditherFg}
                            backgroundColor={ditherBg}
                        />
                    )}
                    {filter === 'ascii' && (
                        <AsciiPass
                            cellSize={cellSize}
                            color={asciiColor}
                            bgColor={asciiBg}
                            invert={invert}
                            useOriginalColor={useOriginalColor}
                        />
                    )}
                    {filter === 'water' && (
                        <WaterPass
                            speed={waterSpeed}
                            strength={waterStrength}
                            frequency={waterFrequency}
                        />
                    )}
                    {filter === 'painting' && (
                        <PaintingPass
                            scale={paintScale}
                            sharpness={paintSharpness}
                            saturation={paintSaturation}
                            contrast={paintContrast}
                            brightness={paintBrightness}
                            vignetteStrength={paintVignetteStrength}
                            vignetteFeather={paintVignetteFeather}
                            temperature={paintTemperature}
                            palette={paintPalette}
                            paletteAmount={paintPaletteAmount}
                            customShadowHex={paintPaletteShadow}
                            customMidHex={paintPaletteMid}
                            customHighlightHex={paintPaletteHighlight}
                        />
                    )}
                    {filter === 'halftone' && (
                        <HalftonePass
                            dotSize={dotSize}
                            angle={dotAngle}
                            softness={dotSoftness}
                            dotColor={dotColor}
                            bgColor={dotBg}
                        />
                    )}
                </EffectComposer>

                <OrbitControls
                    enableZoom={false}
                    enablePan={false}
                    rotateSpeed={-0.4}
                />
            </Canvas>

            {/* ── Top bar ─────────────────────────────────────────────────── */}
            <header className="top-bar">
                <div className="top-controls">
                    <div className="filter-tabs">
                        {FILTERS.map(({ id, label, icon }) => (
                            <button
                                key={id}
                                className={`tab ${
                                    filter === id ? 'active' : ''
                                }`}
                                onClick={() => setFilter(id)}
                                title={label}
                            >
                                {icon} {label}
                            </button>
                        ))}
                    </div>
                </div>

                <form className="address-form" onSubmit={handleSubmit}>
                    <input
                        type="text"
                        className="address-input"
                        value={addressInput}
                        onChange={(event) =>
                            setAddressInput(event.target.value)
                        }
                        placeholder="Enter an address or place"
                        aria-label="Street View address search"
                    />
                    <button type="submit" className="address-button">
                        Go
                    </button>
                </form>
            </header>

            {/* ── Side panel ──────────────────────────────────────────────── */}
            <aside className="panel">
                <h2 className="panel-title">VIEW</h2>
                <Slider
                    label="Horizon"
                    min={-5}
                    max={5}
                    step={0.1}
                    value={horizon}
                    fmt={(value) => `${value}°`}
                    onChange={setHorizon}
                />

                {filter !== 'none' && (
                    <>
                        <div className="divider" />
                        <h2 className="panel-title">
                            {
                                FILTERS.find(
                                    (f) => f.id === filter,
                                )!.icon
                            }{' '}
                            {filter.toUpperCase()}
                        </h2>

                        {filter === 'dither' && (
                            <>
                                <Slider
                                    label="Levels"
                                    min={2}
                                    max={32}
                                    step={1}
                                    value={levels}
                                    fmt={(value) => String(value)}
                                    onChange={setLevels}
                                />
                                <Slider
                                    label="Pattern"
                                    min={0.5}
                                    max={8}
                                    step={0.1}
                                    value={bayerSize}
                                    fmt={(value) => value.toFixed(1)}
                                    onChange={setBayerSize}
                                />
                                <Slider
                                    label="Strength"
                                    min={0}
                                    max={3}
                                    step={0.05}
                                    value={strength}
                                    onChange={setStrength}
                                />
                                <ColorPicker
                                    label="FG Color"
                                    value={ditherFg}
                                    onChange={setDitherFg}
                                />
                                <ColorPicker
                                    label="BG Color"
                                    value={ditherBg}
                                    onChange={setDitherBg}
                                />
                            </>
                        )}

                        {filter === 'ascii' && (
                            <>
                                <Slider
                                    label="Cell Size"
                                    min={4}
                                    max={32}
                                    step={1}
                                    value={cellSize}
                                    fmt={(value) => `${value}px`}
                                    onChange={setCellSize}
                                />
                                <ColorPicker
                                    label="ASCII Color"
                                    value={asciiColor}
                                    onChange={setAsciiColor}
                                />
                                <ColorPicker
                                    label="Background"
                                    value={asciiBg}
                                    onChange={setAsciiBg}
                                />
                                <label className="row clickable">
                                    <span>Invert</span>
                                    <input
                                        type="checkbox"
                                        checked={invert}
                                        onChange={(event) =>
                                            setInvert(
                                                event.target.checked,
                                            )
                                        }
                                    />
                                    <span className="val">
                                        {invert ? 'ON' : 'OFF'}
                                    </span>
                                </label>
                                <label className="row clickable">
                                    <span>Scene Color</span>
                                    <input
                                        type="checkbox"
                                        checked={useOriginalColor}
                                        onChange={(event) =>
                                            setUseOriginalColor(
                                                event.target.checked,
                                            )
                                        }
                                    />
                                    <span className="val">
                                        {useOriginalColor
                                            ? 'ON'
                                            : 'OFF'}
                                    </span>
                                </label>
                            </>
                        )}

                        {filter === 'water' && (
                            <>
                                <Slider
                                    label="Speed"
                                    min={0.1}
                                    max={3}
                                    step={0.05}
                                    value={waterSpeed}
                                    onChange={setWaterSpeed}
                                />
                                <Slider
                                    label="Strength"
                                    min={0.5}
                                    max={15}
                                    step={0.5}
                                    value={waterStrength}
                                    onChange={setWaterStrength}
                                />
                                <Slider
                                    label="Frequency"
                                    min={0.5}
                                    max={10}
                                    step={0.25}
                                    value={waterFrequency}
                                    onChange={setWaterFrequency}
                                />
                            </>
                        )}

                        {filter === 'painting' && (
                            <>
                                <Slider
                                    label="Brush Size"
                                    min={0.5}
                                    max={8}
                                    step={0.25}
                                    value={paintScale}
                                    fmt={(value) => `${value}×`}
                                    onChange={setPaintScale}
                                />
                                <Slider
                                    label="Sharpness"
                                    min={0}
                                    max={2}
                                    step={0.1}
                                    value={paintSharpness}
                                    onChange={setPaintSharpness}
                                />
                                <div className="divider" />
                                <h3 className="panel-subtitle">Filters</h3>
                                <Slider
                                    label="Saturation"
                                    min={0}
                                    max={2}
                                    step={0.05}
                                    value={paintSaturation}
                                    fmt={(v) => (v === 1 ? '1 (off)' : v.toFixed(2))}
                                    onChange={setPaintSaturation}
                                />
                                <Slider
                                    label="Contrast"
                                    min={0.5}
                                    max={2}
                                    step={0.05}
                                    value={paintContrast}
                                    fmt={(v) => (v === 1 ? '1 (off)' : v.toFixed(2))}
                                    onChange={setPaintContrast}
                                />
                                <Slider
                                    label="Brightness"
                                    min={0.5}
                                    max={1.5}
                                    step={0.05}
                                    value={paintBrightness}
                                    fmt={(v) => (v === 1 ? '1 (off)' : v.toFixed(2))}
                                    onChange={setPaintBrightness}
                                />
                                <Slider
                                    label="Temperature"
                                    min={-1}
                                    max={1}
                                    step={0.05}
                                    value={paintTemperature}
                                    fmt={(v) => (v === 0 ? '0 (neutral)' : (v > 0 ? '+' : '') + v.toFixed(2))}
                                    onChange={setPaintTemperature}
                                />
                                <Slider
                                    label="Vignette"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={paintVignetteStrength}
                                    fmt={(v) => (v === 0 ? 'off' : v.toFixed(2))}
                                    onChange={setPaintVignetteStrength}
                                />
                                <Slider
                                    label="Vignette Softness"
                                    min={0.2}
                                    max={1}
                                    step={0.05}
                                    value={paintVignetteFeather}
                                    onChange={setPaintVignetteFeather}
                                />
                                <div className="divider" />
                                <h3 className="panel-subtitle">Palette / gradient map</h3>
                                <label className="row">
                                    <span>Theme</span>
                                    <select
                                        className="panel-select"
                                        value={paintPalette}
                                        onChange={(e) =>
                                            setPaintPalette(Number(e.target.value))
                                        }
                                        aria-label="Painting palette theme"
                                    >
                                        {PAINTING_PALETTES.map(({ id, label }) => (
                                            <option key={id} value={id}>
                                                {label}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="val" />
                                </label>
                                <Slider
                                    label="Palette strength"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={paintPaletteAmount}
                                    fmt={(v) => (v === 0 ? 'off' : `${Math.round(v * 100)}%`)}
                                    onChange={setPaintPaletteAmount}
                                />
                                {paintPalette === 9 && (
                                    <>
                                        <ColorPicker
                                            label="Shadow"
                                            value={paintPaletteShadow}
                                            onChange={setPaintPaletteShadow}
                                        />
                                        <ColorPicker
                                            label="Mid"
                                            value={paintPaletteMid}
                                            onChange={setPaintPaletteMid}
                                        />
                                        <ColorPicker
                                            label="Highlight"
                                            value={paintPaletteHighlight}
                                            onChange={setPaintPaletteHighlight}
                                        />
                                    </>
                                )}
                            </>
                        )}

                        {filter === 'halftone' && (
                            <>
                                <Slider
                                    label="Dot Size"
                                    min={2}
                                    max={20}
                                    step={0.5}
                                    value={dotSize}
                                    fmt={(value) => `${value}px`}
                                    onChange={setDotSize}
                                />
                                <Slider
                                    label="Angle"
                                    min={0}
                                    max={1.57}
                                    step={0.01}
                                    value={dotAngle}
                                    fmt={(value) =>
                                        `${Math.round(
                                            value * 57.3,
                                        )}°`
                                    }
                                    onChange={setDotAngle}
                                />
                                <Slider
                                    label="Softness"
                                    min={0}
                                    max={4}
                                    step={0.1}
                                    value={dotSoftness}
                                    onChange={setDotSoftness}
                                />
                                <ColorPicker
                                    label="Dot Color"
                                    value={dotColor}
                                    onChange={setDotColor}
                                />
                                <ColorPicker
                                    label="BG Color"
                                    value={dotBg}
                                    onChange={setDotBg}
                                />
                            </>
                        )}
                    </>
                )}
            </aside>

            {(isLoadingPano || !currentPanoId) && (
                <div className="hint">
                    {isLoadingPano
                        ? 'Loading Street View…'
                        : 'Enter an address to jump into Street View.'}
                </div>
            )}

            {searchError && (
                <div className="search-error">
                    {searchError}
                </div>
            )}

            {clickIndicator && (
                <div
                    className="click-indicator"
                    style={{ left: clickIndicator.x, top: clickIndicator.y }}
                    aria-hidden
                />
            )}
        </div>
    );
}
