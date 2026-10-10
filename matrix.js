(() => {
  "use strict";

  const canvas = document.querySelector("#scene");
  const matrix = document.querySelector("#matrix");
  const toggle = document.querySelector(".motion-toggle");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const ctx = matrix.getContext("2d");
  let gl, program, uniforms, vertexBuffer, indexBuffer;
  let width = 0, height = 0, frame = 0, lastFrame = 0, lastMatrix = 0;
  let elapsed = 0, cells = [], paused = reducedMotion.matches;
  let quality = Math.min(devicePixelRatio || 1, 1.5), slowFrames = 0;
  const strands = 40, segments = 160, sides = 8;
  const vertices = [], indices = [];
  for (let strand = 0; strand < strands; strand++) {
    const base = vertices.length / 3;
    for (let step = 0; step <= segments; step++) {
      for (let side = 0; side <= sides; side++) {
        vertices.push(step / segments, side / sides * Math.PI * 2, strand);
      }
    }
    for (let step = 0; step < segments; step++) {
      for (let side = 0; side < sides; side++) {
        const a = base + step * (sides + 1) + side, b = a + sides + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const vertexData = new Float32Array(vertices);
  const indexData = new Uint16Array(indices);

  const vertex = `
    precision highp float;
    attribute vec3 parameters;
    uniform vec2 resolution;
    uniform vec2 pointer;
    uniform float time;
    uniform float mobile;
    varying vec3 surfaceNormal;
    varying vec3 surfacePosition;
    varying float strand;
    varying float progress;
    mat2 rotate(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
    vec3 curve(float t, float id) {
      float x = (t - .5) * 7.8;
      float wave = t * 6.28318 - time * .19;
      float angle = id * 2.39996 + t * 3.0 + sin(t * 5.0 - time * .16) * .40;
      float radius = .12 + sqrt(fract(id * .381966 + .1)) * .46;
      float spread = .75 + .45 * sin(t * 3.14159);
      float y = .68 * sin(wave) - .24 * x;
      float z = .34 * cos(t * 5.4 - time * .13);
      y += cos(angle) * radius * spread + .07 * sin(t * 14.0 + id * .32 + time * .24);
      z += sin(angle) * radius;
      return vec3(x, y, z);
    }
    vec3 turn(vec3 p) {
      p.yz = rotate(pointer.y * .17) * p.yz;
      p.xz = rotate(pointer.x * .13) * p.xz;
      p.xy = rotate(.82) * p.xy;
      return p;
    }
    void main() {
      float t = parameters.x;
      float angle = parameters.y;
      float id = parameters.z;
      vec3 center = curve(t, id);
      vec3 tangent = normalize(curve(t + .001, id) - curve(t - .001, id));
      vec3 normal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
      vec3 binormal = normalize(cross(tangent, normal));
      vec3 outward = normal * cos(angle) + binormal * sin(angle);
      float radius = mix(.007, .013, mobile) + fract(id * .7549) * .003;
      vec3 p = turn(center + outward * radius);
      surfaceNormal = turn(outward);
      surfacePosition = p;
      strand = id;
      progress = t;
      float perspective = 5.5 / (5.5 - p.z);
      float scale = mix(min(resolution.y * .080, resolution.x * .063), resolution.x * .090, mobile);
      vec2 origin = mix(vec2(.79, .65), vec2(.76, .62), mobile);
      vec2 screen = origin * resolution + p.xy * scale * perspective;
      // Camera depth preserves real occlusion where the strands weave together.
      gl_Position = vec4(screen / resolution * 2.0 - 1.0, -p.z * .25, 1.0);
    }
  `;
  const fragment = `
    precision highp float;
    uniform float time;
    varying vec3 surfaceNormal;
    varying vec3 surfacePosition;
    varying float strand;
    varying float progress;
    void main() {
      vec3 n = normalize(surfaceNormal);
      vec3 view = normalize(vec3(0.0, 0.0, 5.5) - surfacePosition);
      vec3 light = normalize(vec3(-.4, 1.1, 1.4));
      vec3 backLight = normalize(vec3(.8, -.4, .6));
      float diffuse = max(dot(n, light), 0.0);
      float specular = pow(max(dot(n, normalize(light + view)), 0.0), 55.0);
      float edge = pow(1.0 - max(dot(n, view), 0.0), 3.0);
      float material = fract(strand * .61803);
      vec3 copper = mix(vec3(.38, .07, .014), vec3(.80, .22, .045), material);
      float band = .5 + .5 * sin(progress * 7.0 - time * .30);
      float illumination = pow(band, 5.0);
      float packet = pow(max(0.0, 1.0 - abs(progress - fract(time * .09 + strand * .137)) * 28.0), 3.0);
      vec3 color = copper * (.42 + diffuse * .5);
      color += vec3(1.0, .72, .36) * specular * .25;
      color += vec3(1.0, .85, .57) * packet * 2.4;
      color += vec3(1.0, .20, .027) * edge * .25;
      color += vec3(.7, .10, .01) * max(dot(n, backLight), 0.0) * .3;
      color += vec3(1.0, .36, .07) * illumination * (.09 + material * .18);
      color *= .76 + .24 * smoothstep(-1.0, 1.0, surfacePosition.z);
      color = 1.0 - exp(-color * 1.4);
      color = pow(color, vec3(.85));
      float fade = smoothstep(0.0, .12, progress) * (1.0 - smoothstep(.88, 1.0, progress));
      gl_FragColor = vec4(color * fade, fade);
    }
  `;

  function setupScene() {
    gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "low-power" });
    if (!gl) return;
    const shaders = [];
    try {
      program = gl.createProgram();
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
      indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);
      const parameters = gl.getAttribLocation(program, "parameters");
      gl.enableVertexAttribArray(parameters);
      gl.vertexAttribPointer(parameters, 3, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(["resolution", "pointer", "time", "mobile"].map(name => [name, gl.getUniformLocation(program, name)]));
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      document.documentElement.classList.add("webgl-ready");
    } catch (error) {
      console.warn("The static strings are used because WebGL is unavailable.", error.message);
      if (program) gl.deleteProgram(program);
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
      if (indexBuffer) gl.deleteBuffer(indexBuffer);
      program = null;
    } finally { shaders.forEach(shader => gl.deleteShader(shader)); }
  }
  function renderScene() {
    if (!gl || !program || gl.isContextLost()) return;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform1f(uniforms.mobile, width <= 600 ? 1 : 0);
    gl.drawElements(gl.TRIANGLES, indexData.length, gl.UNSIGNED_SHORT, 0);
  }
  function drawMatrix() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.font = "9px monospace";
    for (const cell of cells) {
      ctx.fillStyle = `rgba(165, 183, 165, ${cell.alpha})`;
      ctx.fillText(cell.glyph, cell.x, cell.y);
    }
  }
  function resize() {
    width = innerWidth; height = innerHeight;
    canvas.width = Math.round(width * quality); canvas.height = Math.round(height * quality);
    matrix.width = width; matrix.height = height;
    if (gl && program) gl.viewport(0, 0, canvas.width, canvas.height);
    cells = [];
    for (let y = 70; y < height * .55; y += 25) {
      for (let x = 20; x < width * .48; x += 25) {
        cells.push({ x, y, glyph: "01+·/"[Math.floor(Math.random() * 5)], alpha: Math.random() * .15 });
      }
    }
    drawMatrix(); renderScene();
  }
  function animate(now) {
    frame = requestAnimationFrame(animate);
    if (now - lastFrame < 32) return;
    const delta = lastFrame ? Math.min(now - lastFrame, 100) : 33;
    lastFrame = now;
    elapsed += delta / 1000;
    pointer.x += (pointer.targetX - pointer.x) * .055;
    pointer.y += (pointer.targetY - pointer.y) * .055;
    renderScene();
    if (now - lastMatrix > 180) {
      lastMatrix = now;
      for (let n = 0; n < cells.length * .015; n++) {
        const cell = cells[Math.floor(Math.random() * cells.length)];
        cell.glyph = "01+·/"[Math.floor(Math.random() * 5)];
      }
      drawMatrix();
    }
    slowFrames = delta > 65 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 45 && quality > .75) {
      quality = Math.max(.75, quality * .8); slowFrames = 0; resize();
    }
  }
  function schedule() {
    cancelAnimationFrame(frame);
    lastFrame = 0;
    if (!paused && !document.hidden) frame = requestAnimationFrame(animate);
    toggle.setAttribute("aria-pressed", String(paused));
    const label = paused ? "Animation starten" : "Animation pausieren";
    toggle.setAttribute("aria-label", label); toggle.title = label;
  }
  addEventListener("pointermove", event => {
    if (paused || event.pointerType !== "mouse") return;
    pointer.targetX = (event.clientX / width - .5) * 2;
    pointer.targetY = (event.clientY / height - .5) * 2;
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { pointer.targetX = pointer.targetY = 0; });
  addEventListener("resize", resize);
  document.addEventListener("visibilitychange", schedule);
  reducedMotion.addEventListener("change", () => { paused = reducedMotion.matches; schedule(); });
  toggle.addEventListener("click", () => { paused = !paused; schedule(); });
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    program = null;
    document.documentElement.classList.remove("webgl-ready");
  });
  canvas.addEventListener("webglcontextrestored", () => { setupScene(); resize(); });
  setupScene(); resize(); toggle.hidden = false; schedule();
})();
