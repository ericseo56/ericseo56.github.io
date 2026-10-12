/* mixer/shapeMask */
var t=class{constructor(e={}){this.state={},this.uniforms={},e.name&&(this.name=e.name),e.namespace&&(this.namespace=e.namespace),e.func&&(this.func=e.func),e.description&&(this.description=e.description),e.tags&&(this.tags=e.tags),e.globals&&(this.globals=e.globals),e.passes&&(this.passes=e.passes),e.textures&&(this.textures=e.textures),e.textures3d&&(this.textures3d=e.textures3d),e.shaders&&(this.shaders=e.shaders),e.externalTexture&&(this.externalTexture=e.externalTexture),e.externalMesh&&(this.externalMesh=e.externalMesh),e.builtinMeshes&&(this.builtinMeshes=e.builtinMeshes),e.outputTex3d&&(this.outputTex3d=e.outputTex3d),e.outputGeo&&(this.outputGeo=e.outputGeo),e.uniformLayout&&(this.uniformLayout=e.uniformLayout),e.uniformLayouts&&(this.uniformLayouts=e.uniformLayouts),e.openCategories&&(this.openCategories=e.openCategories),e.defaultProgram&&(this.defaultProgram=e.defaultProgram),e.hidden&&(this.hidden=!0),e.deprecatedBy&&(this.deprecatedBy=e.deprecatedBy),e.onInit&&(this._configOnInit=e.onInit),e.onUpdate&&(this._configOnUpdate=e.onUpdate),e.onDestroy&&(this._configOnDestroy=e.onDestroy),e.asyncInit&&(this._configAsyncInit=e.asyncInit)}onInit(){this._configOnInit&&this._configOnInit.call(this)}onUpdate(e){return this._configOnUpdate?this._configOnUpdate.call(this,e):{}}onDestroy(){this._configOnDestroy&&this._configOnDestroy.call(this)}asyncInit(e){return this._configAsyncInit?this._configAsyncInit.call(this,e):Promise.resolve()}};var n=new t({name:"ShapeMask",namespace:"mixer",func:"shapeMask",tags:["blend","geometric"],description:"Composite inputs inside and outside a geometric shape",globals:{tex:{type:"surface",default:"none",ui:{label:"source b"}},invert:{type:"int",default:0,uniform:"invert",choices:{sourceA:0,sourceB:1},ui:{label:"shape source",control:"dropdown"}},shape:{type:"int",default:0,uniform:"shape",choices:{circle:0,triangle:1,square:2,pentagon:3,hexagon:4,flower:5,ring:6,star:7},ui:{label:"shape",control:"dropdown"}},radius:{type:"float",default:.7,uniform:"radius",min:0,max:1,randMin:.25,randMax:.75,ui:{label:"radius",control:"slider"}},edgeSmooth:{type:"float",default:.01,uniform:"edgeSmooth",min:0,max:.25,zero:0,ui:{label:"smoothness",control:"slider"}},rotation:{type:"float",default:0,uniform:"rotation",min:-180,max:180,ui:{label:"rotation",control:"slider",enabledBy:{param:"shape",notIn:[0,6]}}},posX:{type:"float",default:0,uniform:"posX",min:-1,max:1,randChance:0,ui:{label:"position x",control:"slider",category:"position"}},posY:{type:"float",default:0,uniform:"posY",min:-1,max:1,randChance:0,ui:{label:"position y",control:"slider",category:"position"}},speed:{type:"int",default:0,uniform:"speed",min:0,max:4,zero:0,randMax:2,ui:{label:"speed",control:"slider"}}},defaultProgram:`search mixer, synth

noise(ridges: true, colorMode: mono)
.write(o0)

noise(ridges: true)
.shapeMask(tex: read(o0))
.write(o1)`,passes:[{name:"render",program:"shapeMask",inputs:{inputTex:"inputTex",tex:"tex"},outputs:{fragColor:"outputTex"}}]});var o={shapeMask:{glsl:`#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int shape;
uniform float radius;
uniform float edgeSmooth;
uniform float rotation;
uniform float posX;
uniform float posY;
uniform int invert;
uniform int speed;
uniform float time;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

vec2 rotate2D(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float sdfCircle(vec2 p, float r) {
    return length(p) - r;
}

float sdfPolygon(vec2 p, float r, float sides) {
    float a = atan(p.x, p.y) + PI;
    float seg = TAU / sides;
    return cos(floor(0.5 + a / seg) * seg - a) * length(p) - r;
}

float sdfTriangle(vec2 p, float r) {
    float k = 1.732050808; // sqrt(3)
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
}

float sdfFlower(vec2 p, float r) {
    float outerR = r;
    float innerR = r * 0.45;
    float a = atan(p.x, p.y) + PI;
    float seg = TAU / 5.0;
    float halfSeg = seg * 0.5;
    float segAngle = mod(a, seg);
    float t = abs(segAngle - halfSeg) / halfSeg;
    float starR = mix(innerR, outerR, t);
    return length(p) - starR;
}

float sdfStar5(vec2 p, float r) {
    float rf = 0.4;
    vec2 k1 = vec2(0.809016994375, -0.587785252292);
    vec2 k2 = vec2(-k1.x, k1.y);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

float sdfRing(vec2 p, float r) {
    float ringWidth = r * 0.15;
    return abs(length(p) - r) - ringWidth;
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 st = globalCoord / fullResolution;

    vec4 colorA = texture(inputTex, gl_FragCoord.xy / vec2(textureSize(inputTex, 0)));
    vec4 colorB = texture(tex, gl_FragCoord.xy / vec2(textureSize(tex, 0)));

    // Centered, aspect-correct coordinates using full image dimensions
    vec2 fullRes = fullResolution.x > 0.0 ? fullResolution : resolution;
    float aspect = fullRes.x / fullRes.y;
    vec2 globalUV = (gl_FragCoord.xy + tileOffset) / fullRes;
    vec2 p = (globalUV - 0.5) * 2.0;
    p.x *= aspect;

    // Apply position offset
    p -= vec2(posX * aspect, -posY);

    // Apply rotation
    float rad = rotation * PI / 180.0;
    p = rotate2D(p, rad);

    // Animate radius: pulse in and out
    float r = radius;
    if (speed > 0) {
        r = radius * 0.5 + sin(time * TAU * float(speed)) * radius * 0.5;
    }

    // Evaluate SDF
    float d = 0.0;
    if (shape == 0) {
        d = sdfCircle(p, r);
    } else if (shape == 1) {
        d = sdfTriangle(p, r);
    } else if (shape == 2) {
        d = sdfPolygon(p, r, 4.0);
    } else if (shape == 3) {
        d = sdfPolygon(p, r, 5.0);
    } else if (shape == 4) {
        d = sdfPolygon(p, r, 6.0);
    } else if (shape == 5) {
        d = sdfFlower(p, r);
    } else if (shape == 6) {
        d = sdfRing(p, r);
    } else if (shape == 7) {
        d = sdfStar5(p, r);
    }

    // Smoothstep mask: 0 inside, 1 outside
    float mask = smoothstep(-edgeSmooth, edgeSmooth, d);

    // Invert swaps inside/outside
    if (invert == 1) {
        mask = 1.0 - mask;
    }

    // A inside shape, B outside (before invert)
    vec4 color = mix(colorA, colorB, mask);
    color.a = max(colorA.a, colorB.a);

    fragColor = color;
}
`,wgsl:`@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> shape : i32;
@group(0) @binding(4) var<uniform> radius : f32;
@group(0) @binding(5) var<uniform> edgeSmooth : f32;
@group(0) @binding(6) var<uniform> rotation : f32;
@group(0) @binding(7) var<uniform> posX : f32;
@group(0) @binding(8) var<uniform> posY : f32;
@group(0) @binding(9) var<uniform> invert : i32;
@group(0) @binding(10) var<uniform> speed : i32;
@group(0) @binding(11) var<uniform> time : f32;
@group(0) @binding(12) var<uniform> tileOffset : vec2<f32>;
@group(0) @binding(13) var<uniform> fullResolution : vec2<f32>;
@group(0) @binding(14) var<uniform> resolution : vec2<f32>;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn rotate2D(p: vec2<f32>, angle: f32) -> vec2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn sdfCircle(p: vec2<f32>, r: f32) -> f32 {
    return length(p) - r;
}

fn sdfPolygon(p: vec2<f32>, r: f32, sides: f32) -> f32 {
    let a = atan2(p.x, p.y) + PI;
    let seg = TAU / sides;
    return cos(floor(0.5 + a / seg) * seg - a) * length(p) - r;
}

fn sdfTriangle(p_in: vec2<f32>, r: f32) -> f32 {
    let k = 1.732050808; // sqrt(3)
    var p = vec2<f32>(abs(p_in.x) - r, p_in.y + r / k);
    if (p.x + k * p.y > 0.0) { p = vec2<f32>(p.x - k * p.y, -k * p.x - p.y) / 2.0; }
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
}

fn sdfFlower(p: vec2<f32>, r: f32) -> f32 {
    let outerR = r;
    let innerR = r * 0.45;
    let a = atan2(p.x, p.y) + PI;
    let seg = TAU / 5.0;
    let halfSeg = seg * 0.5;
    let segAngle = a % seg;
    let t = abs(segAngle - halfSeg) / halfSeg;
    let starR = mix(innerR, outerR, t);
    return length(p) - starR;
}

fn sdfStar5(p_in: vec2<f32>, r: f32) -> f32 {
    let rf = 0.4;
    let k1 = vec2<f32>(0.809016994375, -0.587785252292);
    let k2 = vec2<f32>(-k1.x, k1.y);
    var p = vec2<f32>(abs(p_in.x), p_in.y);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    let ba = rf * vec2<f32>(-k1.y, k1.x) - vec2<f32>(0.0, 1.0);
    let h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

fn sdfRing(p: vec2<f32>, r: f32) -> f32 {
    let ringWidth = r * 0.15;
    return abs(length(p) - r) - ringWidth;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let st = position.xy / dims;

    let colorA = textureSample(inputTex, samp, st);
    let colorB = textureSample(tex, samp, st);

    // Centered, aspect-correct coordinates using full image dimensions
    let fullRes = select(resolution, fullResolution, fullResolution.x > 0.0);
    let aspect = fullRes.x / fullRes.y;
    let globalUV = (position.xy + tileOffset) / fullRes;
    var p = (globalUV - vec2<f32>(0.5, 0.5)) * 2.0;
    p.x = p.x * aspect;

    // Apply position offset
    p = p - vec2<f32>(posX * aspect, -posY);

    // Apply rotation
    let rad = rotation * PI / 180.0;
    p = rotate2D(p, rad);

    // Animate radius: pulse in and out
    var r = radius;
    if (speed > 0) {
        r = radius * 0.5 + sin(time * TAU * f32(speed)) * radius * 0.5;
    }

    // Evaluate SDF
    var d: f32 = 0.0;
    if (shape == 0) {
        d = sdfCircle(p, r);
    } else if (shape == 1) {
        d = sdfTriangle(p, r);
    } else if (shape == 2) {
        d = sdfPolygon(p, r, 4.0);
    } else if (shape == 3) {
        d = sdfPolygon(p, r, 5.0);
    } else if (shape == 4) {
        d = sdfPolygon(p, r, 6.0);
    } else if (shape == 5) {
        d = sdfFlower(p, r);
    } else if (shape == 6) {
        d = sdfRing(p, r);
    } else if (shape == 7) {
        d = sdfStar5(p, r);
    }

    // Smoothstep mask: 0 inside, 1 outside
    var mask = smoothstep(-edgeSmooth, edgeSmooth, d);

    // Invert swaps inside/outside
    if (invert == 1) {
        mask = 1.0 - mask;
    }

    // A inside shape, B outside (before invert)
    var color = mix(colorA, colorB, mask);
    color.a = max(colorA.a, colorB.a);

    return color;
}
`}},r=`# shapeMask

Composite inputs inside and outside a geometric shape

## Description

Uses a signed distance field to divide the frame into inside and outside regions of a chosen shape. Source A appears inside the shape, source B appears outside (swap with invert). Supports seven shapes with adjustable size, position, rotation, and edge softness.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source B (outside shape) |
| invert | int | sourceA | sourceA/sourceB | Which source fills the shape interior |
| shape | int | circle | circle/triangle/square/pentagon/hexagon/flower/ring/star | Shape type |
| radius | float | 0.7 | 0\u20131 | Shape size |
| edgeSmooth | float | 0.01 | 0\u20130.25 | Edge softness (0 = hard edge) |
| rotation | float | 0 | -180\u2013180 | Rotation in degrees |
| posX | float | 0 | -1\u20131 | Horizontal position offset |
| posY | float | 0 | -1\u20131 | Vertical position offset |
| speed | int | 0 | 0\u20134 | Pulse animation speed |

## Notes

- **edge smooth at 0**: Perfectly sharp boundary between sources
- **edge smooth increased**: Creates a soft gradient transition at the shape boundary
- **flower**: Five-petal shape with alternating inner/outer radii
- **star**: Five-pointed star with straight edges
- **ring**: Hollow circle whose border width scales with radius
- Position and rotation are applied before the SDF, so the shape moves and spins in screen space
- Combine with animated position parameters for picture-in-picture or wipe transitions

## Usage

\`\`\`
search mixer, synth

noise(seed: 1, ridges: true)
  .write(o0)

noise(seed: 2, ridges: true)
  .shapeMask(tex: read(o0))
  .write(o1)

render(o1)
\`\`\`
`;if(n&&Object.keys(o).length>0){n.shaders||(n.shaders={});for(let[s,e]of Object.entries(o))n.shaders[s]={...e}}n&&r&&(n.help=r);var f="mixer/shapeMask",d="mixer",u="shapeMask",c=n;export{c as default,f as effectId,u as effectName,r as help,d as namespace};
