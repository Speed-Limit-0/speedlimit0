/**
 * StreetViewSphere
 *
 * Renders an equirectangular panorama texture on the inside of a large sphere
 * so the camera (at the origin) sees the panorama surrounding it on all sides.
 */
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';

interface StreetViewSphereProps {
    /** URL of the equirectangular panorama image */
    url: string;
    /** Radius of the enclosing sphere. Large value so clipping isn't an issue. */
    radius?: number;
    /** Width/height segments for sphere geometry detail. */
    segments?: number;
}

export function StreetViewSphere({
    url,
    radius = 50,
    segments = 64,
}: StreetViewSphereProps) {
    const texture = useLoader(THREE.TextureLoader, url);

    // Use equirectangular mapping for a 360° panorama
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    return (
        <mesh>
            <sphereGeometry args={[radius, segments, segments]} />
            {/* BackSide renders the inside of the sphere so we see the texture from within */}
            <meshBasicMaterial map={texture} side={THREE.BackSide} />
        </mesh>
    );
}
