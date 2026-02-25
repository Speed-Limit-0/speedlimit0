import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { extend } from '@react-three/fiber';
import App from './App';
import { ASCIIEffect }    from './effects/ASCIIEffect';
import { DitherEffect }   from './effects/DitherEffect';
import { WaterEffect }    from './effects/WaterEffect';
import { PaintingEffect } from './effects/PaintingEffect';
import { HalftoneEffect } from './effects/HalftoneEffect';

// Extend R3F with our custom effects so we can use them as JSX tags
extend({ ASCIIEffect, DitherEffect, WaterEffect, PaintingEffect, HalftoneEffect });

// Declaration for TS
declare global {
    namespace JSX {
        interface IntrinsicElements {
            asciiEffect:    any;
            ditherEffect:   any;
            waterEffect:    any;
            paintingEffect: any;
            halftoneEffect: any;
        }
    }
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
