/* filter/feedback */
var t=class{constructor(e={}){this.state={},this.uniforms={},e.name&&(this.name=e.name),e.namespace&&(this.namespace=e.namespace),e.func&&(this.func=e.func),e.description&&(this.description=e.description),e.tags&&(this.tags=e.tags),e.globals&&(this.globals=e.globals),e.passes&&(this.passes=e.passes),e.textures&&(this.textures=e.textures),e.textures3d&&(this.textures3d=e.textures3d),e.shaders&&(this.shaders=e.shaders),e.externalTexture&&(this.externalTexture=e.externalTexture),e.externalMesh&&(this.externalMesh=e.externalMesh),e.builtinMeshes&&(this.builtinMeshes=e.builtinMeshes),e.outputTex3d&&(this.outputTex3d=e.outputTex3d),e.outputGeo&&(this.outputGeo=e.outputGeo),e.uniformLayout&&(this.uniformLayout=e.uniformLayout),e.uniformLayouts&&(this.uniformLayouts=e.uniformLayouts),e.openCategories&&(this.openCategories=e.openCategories),e.defaultProgram&&(this.defaultProgram=e.defaultProgram),e.hidden&&(this.hidden=!0),e.deprecatedBy&&(this.deprecatedBy=e.deprecatedBy),e.onInit&&(this._configOnInit=e.onInit),e.onUpdate&&(this._configOnUpdate=e.onUpdate),e.onDestroy&&(this._configOnDestroy=e.onDestroy),e.asyncInit&&(this._configAsyncInit=e.asyncInit)}onInit(){this._configOnInit&&this._configOnInit.call(this)}onUpdate(e){return this._configOnUpdate?this._configOnUpdate.call(this,e):{}}onDestroy(){this._configOnDestroy&&this._configOnDestroy.call(this)}asyncInit(e){return this._configAsyncInit?this._configAsyncInit.call(this,e):Promise.resolve()}};var n=new t({name:"Feedback",func:"feedback",tags:["sim"],description:"Feedback loop with blend modes and transforms",globals:{blendMode:{type:"int",default:10,uniform:"blendMode",choices:{add:0,cloak:100,colorBurn:2,colorDodge:3,darken:4,difference:5,exclusion:6,glow:7,hardLight:8,lighten:9,mix:10,multiply:11,negation:12,overlay:13,phoenix:14,reflect:15,screen:16,softLight:17,subtract:18},ui:{label:"mode",control:"dropdown"}},mix:{type:"float",default:0,min:0,max:100,randMax:25,uniform:"mixAmt",ui:{label:"feedback",control:"slider"}},scaleAmt:{type:"float",default:100,min:75,max:200,uniform:"scaleAmt",ui:{label:"scale %",control:"slider",category:"transform"}},rotation:{type:"float",default:0,min:-180,max:180,uniform:"rotation",ui:{label:"rotate",control:"slider",category:"transform"}},refractAAmt:{type:"float",default:0,min:0,max:100,uniform:"refractAAmt",ui:{label:"refract a\u2192b",control:"slider",category:"refract"}},refractBAmt:{type:"float",default:0,min:0,max:100,uniform:"refractBAmt",ui:{label:"refract b\u2192a",control:"slider",category:"refract"}},refractADir:{type:"float",default:0,min:0,max:360,uniform:"refractADir",ui:{label:"refract dir a",control:"slider",category:"refract",enabledBy:{and:[{param:"refractAAmt",gt:0},{param:"blendMode",neq:100}]}}},refractBDir:{type:"float",default:0,min:0,max:360,uniform:"refractBDir",ui:{label:"refract dir b",control:"slider",category:"refract",enabledBy:{and:[{param:"refractBAmt",gt:0},{param:"blendMode",neq:100}]}}},hueRotation:{type:"float",default:0,min:-180,max:180,uniform:"hueRotation",ui:{label:"hue shift",control:"slider",category:"color"}},intensity:{type:"float",default:0,min:-100,max:100,uniform:"intensity",ui:{label:"intensity",control:"slider",category:"color"}},aberration:{type:"float",default:0,min:0,max:100,uniform:"aberration",ui:{label:"aberration",control:"slider",category:"lens"}},distortion:{type:"float",default:0,min:-100,max:100,uniform:"distortion",ui:{label:"distortion",control:"slider",category:"lens"}},resetState:{type:"boolean",default:!1,uniform:"resetState",ui:{control:"button",buttonLabel:"reset",label:"state"}}},textures:{_selfTex:{width:"input",height:"input",format:"rgba8unorm"}},passes:[{name:"main",program:"feedback",inputs:{inputTex:"inputTex",selfTex:"_selfTex"},outputs:{fragColor:"outputTex"}},{name:"feedback",program:"copy",inputs:{inputTex:"outputTex"},outputs:{fragColor:"_selfTex"}}]});var o={copy:{glsl:`/*
 * Simple copy/blit shader - copies input to output unchanged.
 * Used for feedback texture updates.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    fragColor = texture(inputTex, uv);
}
`,wgsl:`/*
 * Simple copy/blit shader - copies input to output unchanged.
 * Used for feedback texture updates.
 */

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = pos.xy / dims;
    return textureSample(inputTex, inputSampler, uv);
}
`},feedback:{glsl:`/*
 * Feedback post-processing shader.
 * Offers blend modes alongside hue, distortion, and brightness controls for the accumulated feedback buffer.
 * Mix factors are normalized to avoid runaway amplification when combining the live input with the recirculated image.
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D inputTex;   // Live input from previous effect
uniform sampler2D selfTex;    // Feedback buffer (previous frame output)
uniform vec2 resolution;
uniform float time;
uniform int seed;

// Transform uniforms
uniform float scaleAmt;
uniform float rotation;

// Feedback uniforms  
uniform int blendMode;
uniform float mixAmt;

// Color uniforms
uniform float hueRotation;
uniform float intensity;

// Lens uniforms
uniform float distortion;
uniform float aberration;

// Refraction uniforms
uniform float refractAAmt;
uniform float refractBAmt;
uniform float refractADir;
uniform float refractBDir;
uniform bool resetState;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio (resolution.x / resolution.y)

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

float blendOverlay(float a, float b) {
    return a < 0.5 ? (2.0 * a * b) : (1.0 - 2.0 * (1.0 - a) * (1.0 - b));
}

float blendSoftLight(float base, float blend) {
    return (blend < 0.5) 
        ? (2.0 * base * blend + base * base * (1.0 - 2.0 * blend)) 
        : (sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend));
}

vec4 cloak(vec2 st) {
    float m = map(mixAmt, 0.0, 100.0, 0.0, 1.0);
    float ra = map(refractAAmt, 0.0, 100.0, 0.0, 0.125);
    float rb = map(refractBAmt, 0.0, 100.0, 0.0, 0.125);

    vec4 leftColor = texture(inputTex, st);
    vec4 rightColor = texture(selfTex, st);

    // When the mixer is all the way to the left, we see left refracted by right
    vec2 leftUV = vec2(st);
    float rightLen = length(rightColor.rgb);
    leftUV.x += cos(rightLen * TAU) * ra;
    leftUV.y += sin(rightLen * TAU) * ra;

    vec4 leftRefracted = texture(inputTex, fract(leftUV));

    // When the mixer is all the way to the right, we see right refracted by left
    vec2 rightUV = vec2(st);
    float leftLen = length(leftColor.rgb);
    rightUV.x += cos(leftLen * TAU) * rb;
    rightUV.y += sin(leftLen * TAU) * rb;

    vec4 rightRefracted = texture(selfTex, fract(rightUV));

    // As the mixer approaches midpoint, mix the two refracted outputs using the same
    // logic as the "reflect" mode in coalesce.
    vec4 leftReflected = min(rightRefracted * rightColor / (1.0 - leftRefracted * leftColor), vec4(1.0));
    vec4 rightReflected = min(leftRefracted * leftColor / (1.0 - rightRefracted * rightColor), vec4(1.0));

    vec4 left = vec4(1.0);
    vec4 right = vec4(1.0);
    if (mixAmt < 50.0) {
        left = mix(leftRefracted, leftReflected, map(mixAmt, 0.0, 50.0, 0.0, 1.0));
        right = rightReflected;
    } else {
        left = leftReflected;
        right = mix(rightReflected, rightRefracted, map(mixAmt, 50.0, 100.0, 0.0, 1.0));
    }

    return mix(left, right, m);
}

vec4 blend(vec4 color1, vec4 color2, int mode, float factor) {
    vec4 color;
    vec4 middle;

    float amt = map(mixAmt, 0.0, 100.0, 0.0, 1.0);

    if (mode == 0) {
        // add
        middle = min(color1 + color2, 1.0);
    } else if (mode == 2) {
        // color burn
        middle = (color2 == vec4(0.0)) ? color2 : max((1.0 - ((1.0 - color1) / color2)), vec4(0.0));
    } else if (mode == 3) {
        // color dodge
        middle = (color2 == vec4(1.0)) ? color2 : min(color1 / (1.0 - color2), vec4(1.0));
    } else if (mode == 4) {
        // darken
        middle = min(color1, color2);
    } else if (mode == 5) {
        // difference
        middle = abs(color1 - color2);
        middle.a = max(color1.a, color2.a);
    } else if (mode == 6) {
        // exclusion
        middle = color1 + color2 - 2.0 * color1 * color2;
        middle.a = max(color1.a, color2.a);
    } else if (mode == 7) {
        // glow
        middle = (color2 == vec4(1.0)) ? color2 : min(color1 * color1 / (1.0 - color2), vec4(1.0));
    } else if (mode == 8) {
        // hard light
        middle = vec4(blendOverlay(color2.r, color1.r), blendOverlay(color2.g, color1.g), blendOverlay(color2.b, color1.b), mix(color1.a, color2.a, 0.5));
    } else if (mode == 9) {
        // lighten
        middle = max(color1, color2);
    } else if (mode == 10) {
        // mix
        middle = mix(color1, color2, 0.5);
    } else if (mode == 11) {
        // multiply
        middle = color1 * color2;
    } else if (mode == 12) {
        // negation
        middle = vec4(1.0) - abs(vec4(1.0) - color1 - color2);
        middle.a = max(color1.a, color2.a);
    } else if (mode == 13) {
        // overlay
        middle = vec4(blendOverlay(color1.r, color2.r), blendOverlay(color1.g, color2.g), blendOverlay(color1.b, color2.b), mix(color1.a, color2.a, 0.5));
    } else if (mode == 14) {
        // phoenix
        middle = min(color1, color2) - max(color1, color2) + vec4(1.0);
    } else if (mode == 15) {
        // reflect
        middle = (color1 == vec4(1.0)) ? color1 : min(color2 * color2 / (1.0 - color1), vec4(1.0));
    } else if (mode == 16) {
        // screen
        middle = 1.0 - ((1.0 - color1) * (1.0 - color2));
    } else if (mode == 17) {
        // soft light
        middle = vec4(blendSoftLight(color1.r, color2.r), blendSoftLight(color1.g, color2.g), blendSoftLight(color1.b, color2.b), mix(color1.a, color2.a, 0.5));
    } else if (mode == 18) {
        // subtract
        middle = max(color1 + color2 - 1.0, 0.0);
    } else {
        // fallback to mix
        middle = mix(color1, color2, 0.5);
    }

    if (factor == 0.5) {
        color = middle;
    } else if (factor < 0.5) {
        factor = map(amt, 0.0, 0.5, 0.0, 1.0);
        color = mix(color1, middle, factor);
    } else if (factor > 0.5) {
        factor = map(amt, 0.5, 1.0, 0.0, 1.0);
        color = mix(middle, color2, factor);
    }

    return color;
}

vec3 brightnessContrast(vec3 color) {
    float bright = map(intensity * 0.1, -100.0, 100.0, -0.5, 0.5);
    float cont = map(intensity * 0.1, -100.0, 100.0, 0.5, 1.5);
    color = (color - 0.5) * cont + 0.5 + bright;
    return color;
}

vec2 rotate2D(vec2 st, float rot) {
    st.x *= aspectRatio;
    rot = map(rot, 0.0, 360.0, 0.0, 2.0);
    float angle = rot * PI;
    st -= vec2(0.5 * aspectRatio, 0.5);
    st = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * st;
    st += vec2(0.5 * aspectRatio, 0.5);
    st.x /= aspectRatio;
    return st;
}

vec3 hsv2rgb(vec3 hsv) {
    float h = fract(hsv.x);
    float s = hsv.y;
    float v = hsv.z;
    
    float c = v * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = v - c;

    vec3 rgb;
    if (0.0 <= h && h < 1.0/6.0) {
        rgb = vec3(c, x, 0.0);
    } else if (1.0/6.0 <= h && h < 2.0/6.0) {
        rgb = vec3(x, c, 0.0);
    } else if (2.0/6.0 <= h && h < 3.0/6.0) {
        rgb = vec3(0.0, c, x);
    } else if (3.0/6.0 <= h && h < 4.0/6.0) {
        rgb = vec3(0.0, x, c);
    } else if (4.0/6.0 <= h && h < 5.0/6.0) {
        rgb = vec3(x, 0.0, c);
    } else if (5.0/6.0 <= h && h < 1.0) {
        rgb = vec3(c, 0.0, x);
    } else {
        rgb = vec3(0.0, 0.0, 0.0);
    }

    return rgb + vec3(m, m, m);
}

vec3 rgb2hsv(vec3 rgb) {
    float r = rgb.r;
    float g = rgb.g;
    float b = rgb.b;
    
    float maxC = max(r, max(g, b));
    float minC = min(r, min(g, b));
    float delta = maxC - minC;

    float h = 0.0;
    if (delta != 0.0) {
        if (maxC == r) {
            h = mod((g - b) / delta, 6.0) / 6.0;
        } else if (maxC == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else if (maxC == b) {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }
    
    float s = (maxC == 0.0) ? 0.0 : delta / maxC;
    float v = maxC;

    return vec3(h, s, v);
}

vec4 getImage(vec2 st) {
    st = rotate2D(st, rotation);

    // aberration and lensing
    vec2 diff = 0.5 - st;
    float centerDist = length(diff);

    float distort = 0.0;
    float zoom = 0.0;
    if (distortion < 0.0) {
        distort = map(distortion, -100.0, 0.0, -2.0, 0.0);
        zoom = map(distortion, -100.0, 0.0, 0.04, 0.0);
    } else {
        distort = map(distortion, 0.0, 100.0, 0.0, 2.0);
        zoom = map(distortion, 0.0, 100.0, 0.0, -1.0);
    }

    st = (st - diff * zoom) - diff * centerDist * centerDist * distort;

    // scale
    float scale = 100.0 / scaleAmt;
    if (scale == 0.0) {
        scale = 1.0;
    }
    st *= scale;
    
    // center
    st.x -= (scale * 0.5) - (0.5 - (1.0 / resolution.x * scale));
    st.y += (scale * 0.5) + (0.5 - (1.0 / resolution.y * scale)) - (scale);

    // nudge by one pixel to avoid drift
    st += 1.0 / resolution;

    // tile
    st = fract(st);

    // chromatic aberration
    float aberrationOffset = map(aberration, 0.0, 100.0, 0.0, 0.1) * centerDist * PI * 0.5;

    // Sample selfTex directly without Y flip

    float redOffset = mix(clamp(st.x + aberrationOffset, 0.0, 1.0), st.x, st.x);
    vec4 red = texture(selfTex, vec2(redOffset, st.y));

    vec4 green = texture(selfTex, st);

    float blueOffset = mix(st.x, clamp(st.x - aberrationOffset, 0.0, 1.0), st.x);
    vec4 blue = texture(selfTex, vec2(blueOffset, st.y));

    vec4 tex = vec4(red.r, green.g, blue.b, 1.0);
    tex.rgb = tex.rgb * tex.a;
    
    return tex;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    
    // If resetState is true, bypass feedback and return input directly
    if (resetState) {
        fragColor = texture(inputTex, uv);
        return;
    }

    vec4 color = vec4(0.0);

    if (blendMode == 100) {
        // cloak mode
        color = cloak(uv);
    } else {
        float ra = map(refractAAmt, 0.0, 100.0, 0.0, 0.125);
        float rb = map(refractBAmt, 0.0, 100.0, 0.0, 0.125);

        vec4 leftColor = texture(inputTex, uv);
        vec4 rightColor = texture(selfTex, uv);

        // refract a->b
        vec2 leftUV = vec2(uv);
        float rightLen = length(rightColor.rgb) + refractADir / 360.0;
        leftUV.x += cos(rightLen * TAU) * ra;
        leftUV.y += sin(rightLen * TAU) * ra;

        // refract b->a
        vec2 rightUV = vec2(uv);
        float leftLen = length(leftColor.rgb) + refractBDir / 360.0;
        rightUV.x += cos(leftLen * TAU) * rb;
        rightUV.y += sin(leftLen * TAU) * rb;

        color = blend(texture(inputTex, leftUV), getImage(rightUV), blendMode, mixAmt * 0.01);
    }

    // hue rotation
    vec3 hsv = rgb2hsv(color.rgb);
    hsv[0] = mod(hsv[0] + map(hueRotation, -180.0, 180.0, -0.05, 0.05), 1.0);
    color.rgb = hsv2rgb(hsv);

    // brightness/contrast
    color.rgb = brightnessContrast(color.rgb);

    fragColor = color;
}
`,wgsl:`/*
 * Feedback post-processing shader (WGSL).
 * Offers blend modes alongside hue, distortion, and brightness controls for the accumulated feedback buffer.
 */

struct Uniforms {
    resolution: vec2<f32>,
    time: f32,
    seed: i32,
    scaleAmt: f32,
    rotation: f32,
    blendMode: i32,
    mixAmt: f32,
    hueRotation: f32,
    intensity: f32,
    distortion: f32,
    aberration: f32,
    refractAAmt: f32,
    refractBAmt: f32,
    refractADir: f32,
    refractBDir: f32,
    resetState: i32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var selfTex: texture_2d<f32>;

const PI: f32 = 3.14159265359;

// Floored modulo (matches GLSL mod behavior for negative values)
fn floorMod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}
const TAU: f32 = 6.28318530718;

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn blendOverlay(a: f32, b: f32) -> f32 {
    if (a < 0.5) {
        return 2.0 * a * b;
    } else {
        return 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
    }
}

fn blendSoftLight(base: f32, blend: f32) -> f32 {
    if (blend < 0.5) {
        return 2.0 * base * blend + base * base * (1.0 - 2.0 * blend);
    } else {
        return sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend);
    }
}

fn blend(color1: vec4<f32>, color2: vec4<f32>, mode: i32, factor: f32) -> vec4<f32> {
    var middle: vec4<f32>;
    let amt = map(uniforms.mixAmt, 0.0, 100.0, 0.0, 1.0);

    switch (mode) {
        case 0: { // add
            middle = min(color1 + color2, vec4<f32>(1.0));
        }
        case 2: { // color burn
            if (all(color2 == vec4<f32>(0.0))) {
                middle = color2;
            } else {
                middle = max(1.0 - ((1.0 - color1) / color2), vec4<f32>(0.0));
            }
        }
        case 3: { // color dodge
            if (all(color2 == vec4<f32>(1.0))) {
                middle = color2;
            } else {
                middle = min(color1 / (1.0 - color2), vec4<f32>(1.0));
            }
        }
        case 4: { // darken
            middle = min(color1, color2);
        }
        case 5: { // difference
            middle = abs(color1 - color2);
            middle.a = max(color1.a, color2.a);
        }
        case 6: { // exclusion
            middle = color1 + color2 - 2.0 * color1 * color2;
            middle.a = max(color1.a, color2.a);
        }
        case 7: { // glow
            if (all(color2 == vec4<f32>(1.0))) {
                middle = color2;
            } else {
                middle = min(color1 * color1 / (1.0 - color2), vec4<f32>(1.0));
            }
        }
        case 8: { // hard light
            middle = vec4<f32>(
                blendOverlay(color2.r, color1.r),
                blendOverlay(color2.g, color1.g),
                blendOverlay(color2.b, color1.b),
                mix(color1.a, color2.a, 0.5)
            );
        }
        case 9: { // lighten
            middle = max(color1, color2);
        }
        case 10: { // mix
            middle = mix(color1, color2, 0.5);
        }
        case 11: { // multiply
            middle = color1 * color2;
        }
        case 12: { // negation
            middle = vec4<f32>(1.0) - abs(vec4<f32>(1.0) - color1 - color2);
            middle.a = max(color1.a, color2.a);
        }
        case 13: { // overlay
            middle = vec4<f32>(
                blendOverlay(color1.r, color2.r),
                blendOverlay(color1.g, color2.g),
                blendOverlay(color1.b, color2.b),
                mix(color1.a, color2.a, 0.5)
            );
        }
        case 14: { // phoenix
            middle = min(color1, color2) - max(color1, color2) + vec4<f32>(1.0);
        }
        case 15: { // reflect
            if (all(color1 == vec4<f32>(1.0))) {
                middle = color1;
            } else {
                middle = min(color2 * color2 / (1.0 - color1), vec4<f32>(1.0));
            }
        }
        case 16: { // screen
            middle = 1.0 - ((1.0 - color1) * (1.0 - color2));
        }
        case 17: { // soft light
            middle = vec4<f32>(
                blendSoftLight(color1.r, color2.r),
                blendSoftLight(color1.g, color2.g),
                blendSoftLight(color1.b, color2.b),
                mix(color1.a, color2.a, 0.5)
            );
        }
        case 18: { // subtract
            middle = max(color1 + color2 - 1.0, vec4<f32>(0.0));
        }
        default: {
            middle = mix(color1, color2, 0.5);
        }
    }

    var color: vec4<f32>;
    if (factor == 0.5) {
        color = middle;
    } else if (factor < 0.5) {
        let f = map(amt, 0.0, 0.5, 0.0, 1.0);
        color = mix(color1, middle, f);
    } else {
        let f = map(amt, 0.5, 1.0, 0.0, 1.0);
        color = mix(middle, color2, f);
    }

    return color;
}

fn brightnessContrast(color: vec3<f32>) -> vec3<f32> {
    let bright = map(uniforms.intensity * 0.1, -100.0, 100.0, -0.5, 0.5);
    let cont = map(uniforms.intensity * 0.1, -100.0, 100.0, 0.5, 1.5);
    return (color - 0.5) * cont + 0.5 + bright;
}

fn rotate2D(st_in: vec2<f32>, rot: f32) -> vec2<f32> {
    let aspectRatio = uniforms.resolution.x / uniforms.resolution.y;
    var st = st_in;
    st.x *= aspectRatio;
    let rotNorm = map(rot, 0.0, 360.0, 0.0, 2.0);
    let angle = rotNorm * PI;
    st -= vec2<f32>(0.5 * aspectRatio, 0.5);
    let c = cos(angle);
    let s = sin(angle);
    st = mat2x2<f32>(c, -s, s, c) * st;
    st += vec2<f32>(0.5 * aspectRatio, 0.5);
    st.x /= aspectRatio;
    return st;
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    
    let c = v * s;
    let x = c * (1.0 - abs((h * 6.0) % 2.0 - 1.0));
    let m = v - c;

    var rgb: vec3<f32>;
    if (h < 1.0/6.0) {
        rgb = vec3<f32>(c, x, 0.0);
    } else if (h < 2.0/6.0) {
        rgb = vec3<f32>(x, c, 0.0);
    } else if (h < 3.0/6.0) {
        rgb = vec3<f32>(0.0, c, x);
    } else if (h < 4.0/6.0) {
        rgb = vec3<f32>(0.0, x, c);
    } else if (h < 5.0/6.0) {
        rgb = vec3<f32>(x, 0.0, c);
    } else {
        rgb = vec3<f32>(c, 0.0, x);
    }

    return rgb + vec3<f32>(m);
}

fn rgb2hsv(rgb: vec3<f32>) -> vec3<f32> {
    let maxC = max(rgb.r, max(rgb.g, rgb.b));
    let minC = min(rgb.r, min(rgb.g, rgb.b));
    let delta = maxC - minC;

    var h = 0.0;
    if (delta != 0.0) {
        if (maxC == rgb.r) {
            h = floorMod((rgb.g - rgb.b) / delta, 6.0) / 6.0;
        } else if (maxC == rgb.g) {
            h = ((rgb.b - rgb.r) / delta + 2.0) / 6.0;
        } else {
            h = ((rgb.r - rgb.g) / delta + 4.0) / 6.0;
        }
    }
    
    let s = select(delta / maxC, 0.0, maxC == 0.0);
    let v = maxC;

    return vec3<f32>(h, s, v);
}

fn getImage(st_in: vec2<f32>) -> vec4<f32> {
    var st = rotate2D(st_in, uniforms.rotation);

    // aberration and lensing
    let diff = vec2<f32>(0.5) - st;
    let centerDist = length(diff);

    var distort = 0.0;
    var zoom = 0.0;
    if (uniforms.distortion < 0.0) {
        distort = map(uniforms.distortion, -100.0, 0.0, -2.0, 0.0);
        zoom = map(uniforms.distortion, -100.0, 0.0, 0.04, 0.0);
    } else {
        distort = map(uniforms.distortion, 0.0, 100.0, 0.0, 2.0);
        zoom = map(uniforms.distortion, 0.0, 100.0, 0.0, -1.0);
    }

    st = (st - diff * zoom) - diff * centerDist * centerDist * distort;

    // scale
    var scale = 100.0 / uniforms.scaleAmt;
    if (scale == 0.0) {
        scale = 1.0;
    }
    st *= scale;
    
    // center
    st.x -= (scale * 0.5) - (0.5 - (1.0 / uniforms.resolution.x * scale));
    st.y += (scale * 0.5) + (0.5 - (1.0 / uniforms.resolution.y * scale)) - (scale);

    // nudge
    st += 1.0 / uniforms.resolution;

    // tile
    st = fract(st);

    // chromatic aberration
    let aberrationOffset = map(uniforms.aberration, 0.0, 100.0, 0.0, 0.1) * centerDist * PI * 0.5;

    // Sample selfTex directly - no Y flip needed in WGSL since input.uv
    // coordinate space already matches texture storage orientation

    let redOffset = mix(clamp(st.x + aberrationOffset, 0.0, 1.0), st.x, st.x);
    let red = textureSample(selfTex, texSampler, vec2<f32>(redOffset, st.y));

    let green = textureSample(selfTex, texSampler, st);

    let blueOffset = mix(st.x, clamp(st.x - aberrationOffset, 0.0, 1.0), st.x);
    let blue = textureSample(selfTex, texSampler, vec2<f32>(blueOffset, st.y));

    var tex = vec4<f32>(red.r, green.g, blue.b, 1.0);
    tex = vec4<f32>(tex.rgb * tex.a, tex.a);
    
    return tex;
}

fn cloak(st: vec2<f32>) -> vec4<f32> {
    let m = map(uniforms.mixAmt, 0.0, 100.0, 0.0, 1.0);
    let ra = map(uniforms.refractAAmt, 0.0, 100.0, 0.0, 0.125);
    let rb = map(uniforms.refractBAmt, 0.0, 100.0, 0.0, 0.125);

    let leftColor = textureSample(inputTex, texSampler, st);
    let rightColor = textureSample(selfTex, texSampler, st);

    var leftUV = st;
    let rightLen = length(rightColor.rgb);
    leftUV.x += cos(rightLen * TAU) * ra;
    leftUV.y += sin(rightLen * TAU) * ra;
    let leftRefracted = textureSample(inputTex, texSampler, fract(leftUV));

    var rightUV = st;
    let leftLen = length(leftColor.rgb);
    rightUV.x += cos(leftLen * TAU) * rb;
    rightUV.y += sin(leftLen * TAU) * rb;
    let rightRefracted = textureSample(selfTex, texSampler, fract(rightUV));

    let leftReflected = min(rightRefracted * rightColor / (1.0 - leftRefracted * leftColor), vec4<f32>(1.0));
    let rightReflected = min(leftRefracted * leftColor / (1.0 - rightRefracted * rightColor), vec4<f32>(1.0));

    var left: vec4<f32>;
    var right: vec4<f32>;
    if (uniforms.mixAmt < 50.0) {
        left = mix(leftRefracted, leftReflected, map(uniforms.mixAmt, 0.0, 50.0, 0.0, 1.0));
        right = rightReflected;
    } else {
        left = leftReflected;
        right = mix(rightReflected, rightRefracted, map(uniforms.mixAmt, 50.0, 100.0, 0.0, 1.0));
    }

    return mix(left, right, m);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = pos.xy / uniforms.resolution;
    
    // If resetState is true, bypass feedback and return input directly
    if (uniforms.resetState != 0) {
        return textureSample(inputTex, texSampler, uv);
    }

    var color: vec4<f32>;

    if (uniforms.blendMode == 100) {
        color = cloak(uv);
    } else {
        let ra = map(uniforms.refractAAmt, 0.0, 100.0, 0.0, 0.125);
        let rb = map(uniforms.refractBAmt, 0.0, 100.0, 0.0, 0.125);

        let leftColor = textureSample(inputTex, texSampler, uv);
        let rightColor = textureSample(selfTex, texSampler, uv);

        var leftUV = uv;
        let rightLen = length(rightColor.rgb) + uniforms.refractADir / 360.0;
        leftUV.x += cos(rightLen * TAU) * ra;
        leftUV.y += sin(rightLen * TAU) * ra;

        var rightUV = uv;
        let leftLen = length(leftColor.rgb) + uniforms.refractBDir / 360.0;
        rightUV.x += cos(leftLen * TAU) * rb;
        rightUV.y += sin(leftLen * TAU) * rb;

        color = blend(textureSample(inputTex, texSampler, leftUV), getImage(rightUV), uniforms.blendMode, uniforms.mixAmt * 0.01);
    }

    // hue rotation
    var hsv = rgb2hsv(color.rgb);
    hsv.x = fract(hsv.x + map(uniforms.hueRotation, -180.0, 180.0, -0.05, 0.05));
    color = vec4<f32>(hsv2rgb(hsv), color.a);

    // brightness/contrast
    color = vec4<f32>(brightnessContrast(color.rgb), color.a);

    return color;
}
`}},l=`# feedback

Feedback loop with blend modes and transforms

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| blendMode | int | mix | add/cloak/colorBurn/colorDodge/darken/difference/exclusion/glow/hardLight/lighten/mix/multiply/negation/overlay/phoenix/reflect/screen/softLight/subtract | Mode |
| mix | float | 0 | 0-100 | Feedback |
| scaleAmt | float | 100 | 75-200 | Scale % |
| rotation | float | 0 | -180-180 | Rotate |
| refractAAmt | float | 0 | 0-100 | Refract a\u2192b |
| refractBAmt | float | 0 | 0-100 | Refract b\u2192a |
| refractADir | float | 0 | 0-360 | Refract dir a |
| refractBDir | float | 0 | 0-360 | Refract dir b |
| hueRotation | float | 0 | -180-180 | Hue shift |
| intensity | float | 0 | -100-100 | Intensity |
| aberration | float | 0 | 0-100 | Aberration |
| distortion | float | 0 | -100-100 | Distortion |
| resetState | boolean | false | - | State |

## Notes

Parameter categories:
- **Transform**: scaleAmt, rotation
- **Refract**: refractAAmt, refractBAmt, refractADir, refractBDir
- **Color**: hueRotation, intensity
- **Lens**: aberration, distortion

## Usage

\`\`\`
noise(seed: 1, ridges: true)
  .feedback()
  .write(o0)

render(o0)
\`\`\`
`;if(n&&Object.keys(o).length>0){n.shaders||(n.shaders={});for(let[r,e]of Object.entries(o))n.shaders[r]={...e}}n&&l&&(n.help=l);var s="filter/feedback",m="filter",d="feedback",u=n;export{u as default,s as effectId,d as effectName,l as help,m as namespace};
