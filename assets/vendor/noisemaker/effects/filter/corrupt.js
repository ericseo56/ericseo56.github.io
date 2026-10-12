/* filter/corrupt */
var n=class{constructor(t={}){this.state={},this.uniforms={},t.name&&(this.name=t.name),t.namespace&&(this.namespace=t.namespace),t.func&&(this.func=t.func),t.description&&(this.description=t.description),t.tags&&(this.tags=t.tags),t.globals&&(this.globals=t.globals),t.passes&&(this.passes=t.passes),t.textures&&(this.textures=t.textures),t.textures3d&&(this.textures3d=t.textures3d),t.shaders&&(this.shaders=t.shaders),t.externalTexture&&(this.externalTexture=t.externalTexture),t.externalMesh&&(this.externalMesh=t.externalMesh),t.builtinMeshes&&(this.builtinMeshes=t.builtinMeshes),t.outputTex3d&&(this.outputTex3d=t.outputTex3d),t.outputGeo&&(this.outputGeo=t.outputGeo),t.uniformLayout&&(this.uniformLayout=t.uniformLayout),t.uniformLayouts&&(this.uniformLayouts=t.uniformLayouts),t.openCategories&&(this.openCategories=t.openCategories),t.defaultProgram&&(this.defaultProgram=t.defaultProgram),t.hidden&&(this.hidden=!0),t.deprecatedBy&&(this.deprecatedBy=t.deprecatedBy),t.onInit&&(this._configOnInit=t.onInit),t.onUpdate&&(this._configOnUpdate=t.onUpdate),t.onDestroy&&(this._configOnDestroy=t.onDestroy),t.asyncInit&&(this._configAsyncInit=t.asyncInit)}onInit(){this._configOnInit&&this._configOnInit.call(this)}onUpdate(t){return this._configOnUpdate?this._configOnUpdate.call(this,t):{}}onDestroy(){this._configOnDestroy&&this._configOnDestroy.call(this)}asyncInit(t){return this._configAsyncInit?this._configAsyncInit.call(this,t):Promise.resolve()}};var e=new n({name:"Corrupt",namespace:"filter",func:"corrupt",tags:["distort","glitch"],description:"Scanline-based data corruption",uniformLayout:{time:{slot:0,components:"x"},seed:{slot:0,components:"y"},intensity:{slot:0,components:"z"},sort:{slot:0,components:"w"},shift:{slot:1,components:"x"},bits:{slot:1,components:"y"},channelShift:{slot:1,components:"z"},speed:{slot:1,components:"w"},melt:{slot:2,components:"x"},scatter:{slot:2,components:"y"},bandHeight:{slot:2,components:"z"},renderScale:{slot:2,components:"w"},tileOffset:{slot:3,components:"xy"},fullResolution:{slot:3,components:"zw"}},globals:{intensity:{type:"float",default:50,uniform:"intensity",min:0,max:100,ui:{label:"intensity",control:"slider"}},bandHeight:{type:"float",default:10,uniform:"bandHeight",min:1,max:100,ui:{label:"band height",control:"slider"}},sort:{type:"float",default:50,uniform:"sort",min:0,max:100,ui:{label:"sort",control:"slider"}},shift:{type:"float",default:50,uniform:"shift",min:0,max:100,ui:{label:"shift",control:"slider"}},channelShift:{type:"float",default:0,uniform:"channelShift",min:0,max:100,ui:{label:"channel shift",control:"slider"}},melt:{type:"float",default:0,uniform:"melt",min:0,max:100,ui:{label:"melt",control:"slider"}},scatter:{type:"float",default:0,uniform:"scatter",min:0,max:100,ui:{label:"scatter",control:"slider"}},bits:{type:"float",default:0,uniform:"bits",min:0,max:100,ui:{label:"bits",control:"slider"}},speed:{type:"int",default:1,uniform:"speed",min:0,max:5,zero:0,ui:{label:"speed",control:"slider"}},seed:{type:"int",default:1,uniform:"seed",min:1,max:100,ui:{label:"seed",control:"slider"}}},passes:[{name:"render",program:"corrupt",inputs:{inputTex:"inputTex"},outputs:{fragColor:"outputTex"}}]});var o={corrupt:{glsl:`/*
 * Scanline-based data corruption.
 * All corruption operates along horizontal scanlines, simulating linear
 * byte-stream corruption: pixel sorting, horizontal shifting, bit manipulation,
 * and channel separation.
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D inputTex;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float time;
uniform float seed;
uniform float intensity;
uniform float sort;
uniform float shift;
uniform float bits;
uniform float channelShift;
uniform float speed;
uniform float melt;
uniform float scatter;
uniform float bandHeight;
uniform float renderScale;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

// PCG PRNG - MIT License
uvec3 pcg(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

vec3 prng(vec3 p) {
    p.x = p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0;
    p.y = p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0;
    p.z = p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0;
    return vec3(pcg(uvec3(p))) / float(0xffffffffu);
}

// Per-row time: each row gets its own phase offset so corruption
// rolls through the image rather than all rows jumping simultaneously
float rowTime(float row, float t) {
    float phase = prng(vec3(row, seed + 777.0, 0.0)).x;
    return floor((t + phase) * 8.0); // 8 state changes per time cycle, staggered
}

// Hash for a scanline region
vec3 lineHash(float line, float rt) {
    return prng(vec3(line, seed, rt));
}

// Pixel sorting: shift UV horizontally based on brightness threshold
vec2 pixelSort(vec2 uv, float row, float sortAmt, float rt, float resX) {
    vec3 rh = lineHash(row, rt);
    float threshold = mix(0.8, 0.2, sortAmt);
    float regionSize = 3.0 + rh.y * 20.0;
    float region = floor(uv.x * resX / regionSize);
    vec3 regionHash = prng(vec3(region, row, seed + rt));
    float regionPos = fract(uv.x * resX / regionSize);
    float sortShift = regionPos * regionHash.x * sortAmt * 0.15;
    if (regionHash.y > threshold) {
        uv.x = fract(uv.x + sortShift);
    }
    return uv;
}

// Byte-shift: displace scanline chunks horizontally
vec2 byteShift(vec2 uv, float row, float shiftAmt, float rt, float resX) {
    vec3 rh = lineHash(row, rt);
    float chunkWidth = 8.0 + rh.x * 80.0;
    float chunk = floor(uv.x * resX / chunkWidth);
    vec3 ch = prng(vec3(chunk, row + 200.0, seed + rt));
    float shiftPx = (ch.x - 0.5) * 2.0 * shiftAmt * resX * 0.15;
    float sparsity = mix(0.85, 0.3, shiftAmt);
    if (ch.y > sparsity) {
        uv.x = fract(uv.x + shiftPx / resX);
    }
    return uv;
}

// Bit corruption: quantize, XOR patterns, bit shifting
vec3 bitCorrupt(vec3 color, vec2 uv, float row, float bitAmt, float rt, float resX) {
    vec3 bh = lineHash(row + 400.0, rt);
    float levels = mix(256.0, 2.0, bitAmt * bitAmt);
    color = floor(color * levels + 0.5) / levels;
    if (bitAmt > 0.3) {
        float xorStrength = (bitAmt - 0.3) / 0.7;
        float px = floor(uv.x * resX);
        vec3 xorHash = prng(vec3(px, row, seed + rt + 500.0));
        vec3 mask = step(vec3(1.0 - xorStrength * 0.5), xorHash);
        color = mix(color, 1.0 - color, mask);
    }
    if (bitAmt > 0.6) {
        float shiftStr = (bitAmt - 0.6) / 0.4;
        float bitShift = floor(bh.x * 4.0) + 1.0;
        float scale = pow(2.0, bitShift);
        color = fract(color * mix(1.0, scale, shiftStr));
    }
    return color;
}

// Melt: vertical displacement weighted by position, pixels drip downward
vec2 meltDisplace(vec2 uv, float meltAmt, float t, float resX, float rs) {
    float col = floor(uv.x * resX / 3.0);
    float colPhase = prng(vec3(col, seed + 601.0, 0.0)).x;
    vec3 dripHash = prng(vec3(col, seed + 600.0, floor((t + colPhase) * 8.0)));
    float gravity = (1.0 - uv.y) * (1.0 - uv.y);
    float dripAmt = dripHash.x * meltAmt * gravity * 0.4;
    float dripProb = mix(0.9, 0.2, meltAmt);
    if (dripHash.y > dripProb) {
        float wobble = sin(uv.y * 20.0 + dripHash.z * TAU + t) * meltAmt * 0.02;
        uv.y = clamp(uv.y + dripAmt, 0.0, 1.0);
        uv.x = fract(uv.x + wobble);
    }
    return uv;
}

// Scatter: per-pixel random displacement
vec2 scatterDisplace(vec2 uv, float scatterAmt, float t, float rs, vec2 tileOff) {
    vec2 scaledCoord = floor((gl_FragCoord.xy + tileOff) / rs);
    vec3 phaseHash = prng(vec3(scaledCoord, seed + 700.0));
    float pixTime = floor((t + phaseHash.x) * 8.0);
    vec3 pixHash = prng(vec3(scaledCoord, pixTime + seed));
    float threshold = mix(0.98, 0.1, scatterAmt * scatterAmt);
    if (pixHash.x > threshold) {
        vec3 dirHash = prng(vec3(scaledCoord + 1000.0, pixTime + seed));
        float dist = scatterAmt * 0.15 * (0.5 + pixHash.y * 0.5);
        uv.x = fract(uv.x + (dirHash.x - 0.5) * dist);
        uv.y = clamp(uv.y + (dirHash.y - 0.5) * dist, 0.0, 1.0);
    }
    return uv;
}

void main() {
    vec2 tileDims = vec2(textureSize(inputTex, 0));
    vec2 resolution = fullResolution.x > 0.0 ? fullResolution : tileDims;
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = globalCoord / resolution;
    // Scale pixel-space coordinates so corruption patterns maintain their
    // visual size regardless of export resolution
    float rs = max(renderScale, 1.0);
    float resX = resolution.x / rs;
    float spd = floor(speed);
    float t = time * TAU * spd;

    // Scanline grouping \u2014 scale band height so rows stay visually consistent
    float rawRow = globalCoord.y / rs;
    float bh = max(1.0, floor(bandHeight * 0.32));
    float row = floor(rawRow / bh);

    // Per-row staggered time \u2014 rows change state independently
    float rt = rowTime(row, t);

    // Per-scanline corruption probability
    vec3 rowHash = lineHash(row, rt);
    float prob = intensity / 100.0;
    bool isCorrupt = rowHash.x < prob;

    vec2 sampleUv = uv;

    // 2D effects (not band-based)
    float meltAmt = melt / 100.0;
    if (meltAmt > 0.0) {
        sampleUv = meltDisplace(sampleUv, meltAmt, t, resX, rs);
    }
    float scatterAmt = scatter / 100.0;
    if (scatterAmt > 0.0) {
        sampleUv = scatterDisplace(sampleUv, scatterAmt, t, rs, tileOffset);
    }

    // Band-based corruption to UV
    if (isCorrupt) {
        float sortAmt = sort / 100.0;
        float shiftAmt = shift / 100.0;
        if (sortAmt > 0.0) {
            sampleUv = pixelSort(sampleUv, row, sortAmt, rt, resX);
        }
        if (shiftAmt > 0.0) {
            sampleUv = byteShift(sampleUv, row, shiftAmt, rt, resX);
        }
    }

    // Sample color from input
    vec3 color = texture(inputTex, sampleUv).rgb;

    // Channel separation
    if (channelShift > 0.0 && isCorrupt) {
        float chAmt = channelShift / 100.0;
        vec3 chHash = lineHash(row + 300.0, rt);
        float rShift = (chHash.x - 0.5) * chAmt * 0.08;
        float bShift = (chHash.y - 0.5) * chAmt * 0.08;
        vec2 rUv = vec2(fract(sampleUv.x + rShift), sampleUv.y);
        vec2 bUv = vec2(fract(sampleUv.x + bShift), sampleUv.y);
        color.r = texture(inputTex, rUv).r;
        color.b = texture(inputTex, bUv).b;
    }

    // Bit corruption
    if (bits > 0.0 && isCorrupt) {
        color = bitCorrupt(color, uv, row, bits / 100.0, rt, resX);
    }

    fragColor = vec4(color, 1.0);
}
`,wgsl:`/*
 * Scanline-based data corruption.
 * All corruption operates along horizontal scanlines, simulating linear
 * byte-stream corruption: pixel sorting, horizontal shifting, bit manipulation,
 * and channel separation.
 */

struct Uniforms {
    data: array<vec4<f32>, 4>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

// PCG PRNG - MIT License
fn pcg(seed: vec3<u32>) -> vec3<u32> {
    var v = seed * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

fn prng(p0: vec3<f32>) -> vec3<f32> {
    var p = p0;
    if (p.x >= 0.0) { p.x = p.x * 2.0; } else { p.x = -p.x * 2.0 + 1.0; }
    if (p.y >= 0.0) { p.y = p.y * 2.0; } else { p.y = -p.y * 2.0 + 1.0; }
    if (p.z >= 0.0) { p.z = p.z * 2.0; } else { p.z = -p.z * 2.0 + 1.0; }
    let u = pcg(vec3<u32>(p));
    return vec3<f32>(u) / f32(0xffffffffu);
}

fn rowTime(row: f32, sd: f32, t: f32) -> f32 {
    let phase = prng(vec3<f32>(row, sd + 777.0, 0.0)).x;
    return floor((t + phase) * 8.0);
}

fn lineHash(line: f32, sd: f32, rt: f32) -> vec3<f32> {
    return prng(vec3<f32>(line, sd, rt));
}

fn pixelSort(uv_in: vec2<f32>, row: f32, sortAmt: f32, rt: f32, sd: f32, resX: f32) -> vec2<f32> {
    var uv = uv_in;
    let rh = lineHash(row, sd, rt);
    let threshold = mix(0.8, 0.2, sortAmt);
    let regionSize = 3.0 + rh.y * 20.0;
    let region = floor(uv.x * resX / regionSize);
    let regionHash = prng(vec3<f32>(region, row, sd + rt));
    let regionPos = fract(uv.x * resX / regionSize);
    let sortShift = regionPos * regionHash.x * sortAmt * 0.15;
    if (regionHash.y > threshold) {
        uv.x = fract(uv.x + sortShift);
    }
    return uv;
}

fn byteShift(uv_in: vec2<f32>, row: f32, shiftAmt: f32, rt: f32, sd: f32, resX: f32) -> vec2<f32> {
    var uv = uv_in;
    let rh = lineHash(row, sd, rt);
    let chunkWidth = 8.0 + rh.x * 80.0;
    let chunk = floor(uv.x * resX / chunkWidth);
    let ch = prng(vec3<f32>(chunk, row + 200.0, sd + rt));
    let shiftPx = (ch.x - 0.5) * 2.0 * shiftAmt * resX * 0.15;
    let sparsity = mix(0.85, 0.3, shiftAmt);
    if (ch.y > sparsity) {
        uv.x = fract(uv.x + shiftPx / resX);
    }
    return uv;
}

fn bitCorrupt(color_in: vec3<f32>, uv: vec2<f32>, row: f32, bitAmt: f32, rt: f32, sd: f32, resX: f32) -> vec3<f32> {
    var color = color_in;
    let bh = lineHash(row + 400.0, sd, rt);
    let levels = mix(256.0, 2.0, bitAmt * bitAmt);
    color = floor(color * levels + 0.5) / levels;
    if (bitAmt > 0.3) {
        let xorStrength = (bitAmt - 0.3) / 0.7;
        let px = floor(uv.x * resX);
        let xorHash = prng(vec3<f32>(px, row, sd + rt + 500.0));
        let mask = step(vec3<f32>(1.0 - xorStrength * 0.5), xorHash);
        color = mix(color, 1.0 - color, mask);
    }
    if (bitAmt > 0.6) {
        let shiftStr = (bitAmt - 0.6) / 0.4;
        let bitShift = floor(bh.x * 4.0) + 1.0;
        let scale = pow(2.0, bitShift);
        color = fract(color * mix(1.0, scale, shiftStr));
    }
    return color;
}

fn meltDisplace(uv_in: vec2<f32>, meltAmt: f32, t: f32, sd: f32, resX: f32) -> vec2<f32> {
    var uv = uv_in;
    let col = floor(uv.x * resX / 3.0);
    let colPhase = prng(vec3<f32>(col, sd + 601.0, 0.0)).x;
    let dripHash = prng(vec3<f32>(col, sd + 600.0, floor((t + colPhase) * 8.0)));
    let gravity = (1.0 - uv.y) * (1.0 - uv.y);
    let dripAmt = dripHash.x * meltAmt * gravity * 0.4;
    let dripProb = mix(0.9, 0.2, meltAmt);
    if (dripHash.y > dripProb) {
        let wobble = sin(uv.y * 20.0 + dripHash.z * TAU + t) * meltAmt * 0.02;
        uv.y = clamp(uv.y + dripAmt, 0.0, 1.0);
        uv.x = fract(uv.x + wobble);
    }
    return uv;
}

fn scatterDisplace(uv_in: vec2<f32>, scatterAmt: f32, t: f32, sd: f32, rs: f32, tileOff: vec2<f32>, fragCoord: vec2<f32>) -> vec2<f32> {
    var uv = uv_in;
    let scaledCoord = floor((fragCoord + tileOff) / rs);
    let phaseHash = prng(vec3<f32>(scaledCoord, sd + 700.0));
    let pixTime = floor((t + phaseHash.x) * 8.0);
    let pixHash = prng(vec3<f32>(scaledCoord, pixTime + sd));
    let threshold = mix(0.98, 0.1, scatterAmt * scatterAmt);
    if (pixHash.x > threshold) {
        let dirHash = prng(vec3<f32>(scaledCoord + vec2<f32>(1000.0), pixTime + sd));
        let dist = scatterAmt * 0.15 * (0.5 + pixHash.y * 0.5);
        uv.x = fract(uv.x + (dirHash.x - 0.5) * dist);
        uv.y = clamp(uv.y + (dirHash.y - 0.5) * dist, 0.0, 1.0);
    }
    return uv;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let time = uniforms.data[0].x;
    let seed = uniforms.data[0].y;
    let intensity = uniforms.data[0].z;
    let sort = uniforms.data[0].w;

    let shift = uniforms.data[1].x;
    let bits = uniforms.data[1].y;
    let channelShift = uniforms.data[1].z;
    let speed = uniforms.data[1].w;

    let melt = uniforms.data[2].x;
    let scatter = uniforms.data[2].y;
    let bandHeight = uniforms.data[2].z;
    let renderScale = uniforms.data[2].w;

    let tileOffset = uniforms.data[3].xy;
    let fullResolution = uniforms.data[3].zw;

    let tileDims = vec2<f32>(textureDimensions(inputTex));
    let resolution = select(tileDims, fullResolution, fullResolution.x > 0.0);
    let globalCoord = pos.xy + tileOffset;
    let uv = globalCoord / resolution;
    // Scale pixel-space coordinates so corruption patterns maintain their
    // visual size regardless of export resolution
    let rs = max(renderScale, 1.0);
    let resX = resolution.x / rs;
    let spd = floor(speed);
    let t = time * TAU * spd;

    // Scanline grouping - scale band height so rows stay visually consistent
    let rawRow = globalCoord.y / rs;
    let bh = max(1.0, floor(bandHeight * 0.32));
    let row = floor(rawRow / bh);

    // Per-row staggered time
    let rt = rowTime(row, seed, t);

    // Per-scanline corruption probability
    let rowHash = lineHash(row, seed, rt);
    let prob = intensity / 100.0;
    let isCorrupt = rowHash.x < prob;

    var sampleUv = uv;

    // 2D effects (not band-based)
    let meltAmt = melt / 100.0;
    if (meltAmt > 0.0) {
        sampleUv = meltDisplace(sampleUv, meltAmt, t, seed, resX);
    }
    let scatterAmt = scatter / 100.0;
    if (scatterAmt > 0.0) {
        sampleUv = scatterDisplace(sampleUv, scatterAmt, t, seed, rs, tileOffset, pos.xy);
    }

    // Band-based corruption to UV
    if (isCorrupt) {
        let sortAmt = sort / 100.0;
        let shiftAmt = shift / 100.0;
        if (sortAmt > 0.0) {
            sampleUv = pixelSort(sampleUv, row, sortAmt, rt, seed, resX);
        }
        if (shiftAmt > 0.0) {
            sampleUv = byteShift(sampleUv, row, shiftAmt, rt, seed, resX);
        }
    }

    // Sample color from input. Use textureSampleLevel because the channel-shift
    // and bit-corruption branches below depend on per-pixel values, which
    // disqualifies plain textureSample (which requires uniform control flow
    // for implicit derivatives). textureSampleLevel takes an explicit mip
    // level, no derivatives needed. These shaders don't use mipmaps anyway.
    var color = textureSampleLevel(inputTex, samp, sampleUv, 0.0).rgb;

    // Channel separation
    if (channelShift > 0.0 && isCorrupt) {
        let chAmt = channelShift / 100.0;
        let chHash = lineHash(row + 300.0, seed, rt);
        let rShift = (chHash.x - 0.5) * chAmt * 0.08;
        let bShift = (chHash.y - 0.5) * chAmt * 0.08;
        let rUv = vec2<f32>(fract(sampleUv.x + rShift), sampleUv.y);
        let bUv = vec2<f32>(fract(sampleUv.x + bShift), sampleUv.y);
        color.r = textureSampleLevel(inputTex, samp, rUv, 0.0).r;
        color.b = textureSampleLevel(inputTex, samp, bUv, 0.0).b;
    }

    // Bit corruption
    if (bits > 0.0 && isCorrupt) {
        color = bitCorrupt(color, uv, row, bits / 100.0, rt, seed, resX);
    }

    return vec4<f32>(color, 1.0);
}
`}},s=`# corrupt

Scanline-based data corruption with pixel sorting, byte shifting, and bit manipulation

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| intensity | float | 50 | 0-100 | Corruption probability per scanline |
| bandHeight | float | 10 | 1-100 | Scanline grouping height |
| sort | float | 50 | 0-100 | Pixel sorting amount |
| shift | float | 50 | 0-100 | Horizontal byte shifting |
| channelShift | float | 0 | 0-100 | RGB channel separation |
| melt | float | 0 | 0-100 | Vertical drip displacement |
| scatter | float | 0 | 0-100 | Per-pixel random displacement |
| bits | float | 0 | 0-100 | Bit manipulation and quantization |
| speed | int | 1 | 0-5 | Animation speed |
| seed | int | 1 | 1-100 | Random seed |

## Usage

\`\`\`
search filter, synth

noise(seed: 1, ridges: true)
  .corrupt()
  .write(o0)

render(o0)
\`\`\`
`;if(e&&Object.keys(o).length>0){e.shaders||(e.shaders={});for(let[r,t]of Object.entries(o))e.shaders[r]={...t}}e&&s&&(e.help=s);var c="filter/corrupt",p="filter",u="corrupt",m=e;export{m as default,c as effectId,u as effectName,s as help,p as namespace};
