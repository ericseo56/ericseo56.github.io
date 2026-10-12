/* filter/pixels */
var n=class{constructor(e={}){this.state={},this.uniforms={},e.name&&(this.name=e.name),e.namespace&&(this.namespace=e.namespace),e.func&&(this.func=e.func),e.description&&(this.description=e.description),e.tags&&(this.tags=e.tags),e.globals&&(this.globals=e.globals),e.passes&&(this.passes=e.passes),e.textures&&(this.textures=e.textures),e.textures3d&&(this.textures3d=e.textures3d),e.shaders&&(this.shaders=e.shaders),e.externalTexture&&(this.externalTexture=e.externalTexture),e.externalMesh&&(this.externalMesh=e.externalMesh),e.builtinMeshes&&(this.builtinMeshes=e.builtinMeshes),e.outputTex3d&&(this.outputTex3d=e.outputTex3d),e.outputGeo&&(this.outputGeo=e.outputGeo),e.uniformLayout&&(this.uniformLayout=e.uniformLayout),e.uniformLayouts&&(this.uniformLayouts=e.uniformLayouts),e.openCategories&&(this.openCategories=e.openCategories),e.defaultProgram&&(this.defaultProgram=e.defaultProgram),e.hidden&&(this.hidden=!0),e.deprecatedBy&&(this.deprecatedBy=e.deprecatedBy),e.onInit&&(this._configOnInit=e.onInit),e.onUpdate&&(this._configOnUpdate=e.onUpdate),e.onDestroy&&(this._configOnDestroy=e.onDestroy),e.asyncInit&&(this._configAsyncInit=e.asyncInit)}onInit(){this._configOnInit&&this._configOnInit.call(this)}onUpdate(e){return this._configOnUpdate?this._configOnUpdate.call(this,e):{}}onDestroy(){this._configOnDestroy&&this._configOnDestroy.call(this)}asyncInit(e){return this._configAsyncInit?this._configAsyncInit.call(this,e):Promise.resolve()}};var t=new n({name:"Pixels",namespace:"filter",func:"pixels",tags:["pixel"],description:"Pixelation effect for retro look",globals:{size:{type:"int",default:16,uniform:"size",min:1,max:256,zero:1,randMax:50,ui:{label:"size",control:"slider"}}},passes:[{name:"render",program:"pixels",inputs:{inputTex:"inputTex"},outputs:{fragColor:"outputTex"}}]});var r={pixels:{glsl:`/*
 * Pixelation effect
 * Reduces image resolution for retro pixel art look
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float size;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 tileDims = vec2(texSize);
    vec2 resolution = fullResolution.x > 0.0 ? fullResolution : tileDims;
    vec2 uv = gl_FragCoord.xy / tileDims;

    if (size < 1.0) {
        fragColor = texture(inputTex, uv);
        return;
    }

    float pixelSize = size;

    float dx = pixelSize / resolution.x;
    float dy = pixelSize / resolution.y;

    // Use global UV so pixel grid aligns across tiles
    vec2 globalUV = (gl_FragCoord.xy + tileOffset) / resolution;
    vec2 centered = globalUV - 0.5;
    vec2 globalCoord = vec2(dx * floor(centered.x / dx), dy * floor(centered.y / dy));
    globalCoord += 0.5;

    // Convert back to tile-local UV for sampling
    vec2 coord = (globalCoord * resolution - tileOffset) / tileDims;

    fragColor = texture(inputTex, coord);
}
`,wgsl:`/*
 * Pixelation effect
 * Reduces image resolution for retro pixel art look.
 *
 * Tile-aware, mirroring glsl/pixels.glsl: when tiling, the pixel grid is
 * computed in GLOBAL coordinates so blocks align across tiles. The
 * non-tiling branch (tileOffset=(0,0)) is the previous shader verbatim,
 * so normal-size output is byte-identical (zero baseline regression by
 * construction).
 */

struct Uniforms {
    size: f32,
    _pad0: f32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;

    if (uniforms.size < 1.0) {
        return textureSample(inputTex, inputSampler, uv);
    }

    let pixelSize = uniforms.size;
    let isTile = length(uniforms.tileOffset) > 0.0;

    if (isTile) {
        let resolution = select(texSize, uniforms.fullResolution, uniforms.fullResolution.x > 0.0);
        let dx = pixelSize / resolution.x;
        let dy = pixelSize / resolution.y;
        // Snap on a global grid so blocks align across tiles.
        let globalUV = (pos.xy + uniforms.tileOffset) / resolution;
        let centered = globalUV - 0.5;
        var gcoord = vec2<f32>(dx * floor(centered.x / dx), dy * floor(centered.y / dy));
        gcoord = gcoord + 0.5;
        let coord = (gcoord * resolution - uniforms.tileOffset) / texSize;
        return textureSample(inputTex, inputSampler, coord);
    }

    // Non-tiling path: byte-identical to the previous shader.
    let dx = pixelSize / texSize.x;
    let dy = pixelSize / texSize.y;
    var centered = uv - 0.5;
    var coord = vec2<f32>(dx * floor(centered.x / dx), dy * floor(centered.y / dy));
    coord = coord + 0.5;
    return textureSample(inputTex, inputSampler, coord);
}
`}},o=`# pixels

Pixelation effect for retro look

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| size | int | 16 | 1-256 | Size |

## Usage

\`\`\`
search filter, synth

noise(seed: 1, ridges: true)
  .pixels()
  .write(o0)

render(o0)
\`\`\`
`;if(t&&Object.keys(r).length>0){t.shaders||(t.shaders={});for(let[i,e]of Object.entries(r))t.shaders[i]={...e}}t&&o&&(t.help=o);var f="filter/pixels",p="filter",d="pixels",x=t;export{x as default,f as effectId,d as effectName,o as help,p as namespace};
