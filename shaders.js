// Custom GLSL Shaders for Animo 3D Card Tunnel, Orbital Ring & Floating Gallery
// Exact SDF Rounded-Corner Architectural Framing + Aspect-Preserving Cover UVs

export const cardVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vViewZ;

  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewZ = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const cardFragmentShader = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec2 uCardSize;       // Physical width & height of this panel
  uniform float uTexAspect;     // Width / Height aspect ratio of the loaded photo
  uniform float uIsPhoto;       // 1.0 = Photo Card, 0.0 = Matte Slate Architectural Card
  uniform vec3 uSlateColor;     // Base slate color for non-photo tunnel panels
  uniform vec3 uFrameColor;     // Dark structural border color (#0c0d11)
  uniform float uBorderSize;    // Physical border margin thickness
  uniform float uCornerRadius;  // Physical rounded corner radius
  uniform float uHover;         // 0..1 hover state for interactive photo cards
  uniform float uOpacity;       // Fade in/out opacity
  uniform int uUvOrientation;   // 0 = normal, 1 = ceiling flip, 2 = floor flip

  varying vec2 vUv;
  varying float vViewZ;

  // Signed Distance Field for a 2D Box with rounded corners
  float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  void main() {
    // Convert UV (0..1) to physical centered coordinates (-uCardSize/2 .. +uCardSize/2)
    vec2 p = (vUv - 0.5) * uCardSize;

    // Half-size of the inner rounded card after subtracting the black structural border
    vec2 innerHalfSize = max(vec2(0.1), uCardSize * 0.5 - vec2(uBorderSize));
    float r = min(uCornerRadius, min(innerHalfSize.x, innerHalfSize.y) * 0.45);

    float d = sdRoundedBox(p, innerHalfSize, r);

    // Crisp anti-aliased edge between the inner card and the dark structural frame
    float aa = fwidth(d);
    float innerMask = 1.0 - smoothstep(-aa, aa, d);

    vec3 innerColor = uSlateColor;

    if (uIsPhoto > 0.5) {
      vec2 uv = vUv;

      // Compute object-fit: cover UV so the portrait never stretches or squashes
      float cardAspect = innerHalfSize.x / innerHalfSize.y;
      vec2 coverScale = vec2(1.0);
      if (cardAspect > uTexAspect) {
        coverScale.y = uTexAspect / cardAspect;
      } else {
        coverScale.x = cardAspect / uTexAspect;
      }

      // Subtle interactive zoom when hovered
      coverScale *= (1.0 - uHover * 0.045);

      // Bias vertical crop slightly upward (0.58) so portrait faces are nicely framed
      vec2 centerBias = vec2(0.5, 0.56);
      vec2 sampleUv = (uv - centerBias) * coverScale + centerBias;
      sampleUv = clamp(sampleUv, 0.001, 0.999);

      vec4 texColor = texture2D(uTex, sampleUv);
      innerColor = texColor.rgb;

      // Subtle hover illumination & border accent
      innerColor += vec3(0.06, 0.06, 0.08) * uHover;
    } else {
      // Subtle architectural gradient on slate cards matching animo-card-tunnel-720p.mp4
      float vGrad = 0.94 + 0.12 * vUv.y;
      innerColor = uSlateColor * vGrad;
    }

    // Subtle hover highlight ring along the rounded border for photo cards
    float borderGlow = exp(-abs(d) * 18.0) * uHover * uIsPhoto * 0.55;
    vec3 frameCol = mix(uFrameColor, vec3(0.85, 0.78, 0.95), borderGlow);

    vec3 finalRGB = mix(frameCol, innerColor, innerMask);

    // Smooth atmospheric depth attenuation toward the far end of the tunnel
    float depthShade = clamp(1.0 - smoothstep(26.0, 46.0, vViewZ) * 0.28, 0.72, 1.0);
    finalRGB *= depthShade;

    gl_FragColor = vec4(finalRGB, uOpacity);
  }
`;
