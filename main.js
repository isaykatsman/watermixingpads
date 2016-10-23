/*
 * WebGL Water
 * http://madebyevan.com/webgl-water/
 *
 * Copyright 2011 Evan Wallace
 * Released under the MIT license
 *
 * Modified for WP GL by Isay Katsman
 */

function text2html(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

var helperFunctions = '\
  const float IOR_AIR = 1.0;\
  const float IOR_WATER = 1.333;\
  const vec3 abovewaterColor = vec3(0.25, 1.0, 1.25);\
  const vec3 underwaterColor = vec3(0.4, 0.9, 1.0);\
  const float poolHeight = 1.0;\
  uniform vec3 light;\
  uniform vec3 sphereCenter;\
  uniform float sphereRadius;\
  uniform sampler2D tiles;\
  uniform sampler2D causticTex;\
  uniform sampler2D water;\
  \
  vec2 intersectCube(vec3 origin, vec3 ray, vec3 cubeMin, vec3 cubeMax) {\
    vec3 tMin = (cubeMin - origin) / ray;\
    vec3 tMax = (cubeMax - origin) / ray;\
    vec3 t1 = min(tMin, tMax);\
    vec3 t2 = max(tMin, tMax);\
    float tNear = max(max(t1.x, t1.y), t1.z);\
    float tFar = min(min(t2.x, t2.y), t2.z);\
    return vec2(tNear, tFar);\
  }\
  \
  float intersectSphere(vec3 origin, vec3 ray, vec3 sphereCenter, float sphereRadius) {\
    vec3 toSphere = origin - sphereCenter;\
    float a = dot(ray, ray);\
    float b = 2.0 * dot(toSphere, ray);\
    float c = dot(toSphere, toSphere) - sphereRadius * sphereRadius;\
    float discriminant = b*b - 4.0*a*c;\
    if (discriminant > 0.0) {\
      float t = (-b - sqrt(discriminant)) / (2.0 * a);\
      if (t > 0.0) return t;\
    }\
    return 1.0e6;\
  }\
  \
  vec3 getSphereColor(vec3 point) {\
    vec3 color = vec3(0.5);\
    \
    /* ambient occlusion with walls */\
    color *= 1.0 - 0.9 / pow((1.0 + sphereRadius - abs(point.x)) / sphereRadius, 3.0);\
    color *= 1.0 - 0.9 / pow((1.0 + sphereRadius - abs(point.z)) / sphereRadius, 3.0);\
    color *= 1.0 - 0.9 / pow((point.y + 1.0 + sphereRadius) / sphereRadius, 3.0);\
    \
    /* caustics */\
    vec3 sphereNormal = (point - sphereCenter) / sphereRadius;\
    vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);\
    float diffuse = max(0.0, dot(-refractedLight, sphereNormal)) * 0.5;\
    vec4 info = texture2D(water, point.xz * 0.5 + 0.5);\
    if (point.y < info.r) {\
      vec4 caustic = texture2D(causticTex, 0.75 * (point.xz - point.y * refractedLight.xz / refractedLight.y) * 0.5 + 0.5);\
      diffuse *= caustic.r * 4.0;\
    }\
    color += diffuse;\
    \
    return color;\
  }\
  \
  vec3 getWallColor(vec3 point) {\
    float scale = 0.5;\
    \
    vec3 wallColor;\
    vec3 normal;\
    if (abs(point.x) > 0.999) {\
      wallColor = texture2D(tiles, point.yz * 0.5 + vec2(1.0, 0.5)).rgb;\
      normal = vec3(-point.x, 0.0, 0.0);\
    } else if (abs(point.z) > 0.999) {\
      wallColor = texture2D(tiles, point.yx * 0.5 + vec2(1.0, 0.5)).rgb;\
      normal = vec3(0.0, 0.0, -point.z);\
    } else {\
      wallColor = texture2D(tiles, point.xz * 0.5 + 0.5).rgb;\
      normal = vec3(0.0, 1.0, 0.0);\
    }\
    \
    scale /= length(point); /* pool ambient occlusion */\
    scale *= 1.0 - 0.9 / pow(length(point - sphereCenter) / sphereRadius, 4.0); /* sphere ambient occlusion */\
    \
    /* caustics */\
    vec3 refractedLight = -refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);\
    float diffuse = max(0.0, dot(refractedLight, normal));\
    vec4 info = texture2D(water, point.xz * 0.5 + 0.5);\
    if (point.y < info.r) {\
      vec4 caustic = texture2D(causticTex, 0.75 * (point.xz - point.y * refractedLight.xz / refractedLight.y) * 0.5 + 0.5);\
      scale += diffuse * caustic.r * 2.0 * caustic.g;\
    } else {\
      /* shadow for the rim of the pool */\
      vec2 t = intersectCube(point, refractedLight, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));\
      diffuse *= 1.0 / (1.0 + exp(-200.0 / (1.0 + 10.0 * (t.y - t.x)) * (point.y + refractedLight.y * t.y - 2.0 / 12.0)));\
      \
      scale += diffuse * 0.5;\
    }\
    \
    return wallColor * scale;\
  }\
';

function handleError(text) {
  var html = text2html(text);
  if (html == 'WebGL not supported') {
    html = 'Your browser does not support WebGL.<br>Please see\
    <a href="http://www.khronos.org/webgl/wiki/Getting_a_WebGL_Implementation">\
    Getting a WebGL Implementation</a>.';
  }
  var loading = document.getElementById('loading');
  loading.innerHTML = html;
  loading.style.zIndex = 1;
}

window.onerror = handleError;

var gl = GL.create();
var water;
var cubemap;
var renderer;
var angleX = -25;
var angleY = -200.5;

// Sphere physics info
var useSpherePhysics = true;
var moveCamera = false;
var center;
var oldCenter;
var velocity;
var gravity;
var radius;
var colorR=0;
var colorG=0.4;
var colorB=0.9;
var paused = false;

window.onload = function() {
  var ratio = window.devicePixelRatio || 1;
  var help = document.getElementById('help');
  //initShaders();
  function onresize() {
    var width = innerWidth - help.clientWidth - 20;
    var height = innerHeight;
    gl.canvas.width = width * ratio;
    gl.canvas.height = height * ratio;
    gl.canvas.style.width = width + 'px';
    gl.canvas.style.height = height + 'px';
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.matrixMode(gl.PROJECTION);
    gl.loadIdentity();
    gl.perspective(45, gl.canvas.width / gl.canvas.height, 0.01, 100);
    gl.matrixMode(gl.MODELVIEW);
    draw();
  }

  document.body.appendChild(gl.canvas);
  gl.clearColor(0, 0, 0, 0.1);

  water = new Water();
  renderer = new Renderer();
  cubemap = new Cubemap({
    xneg: document.getElementById('xneg'),
    xpos: document.getElementById('xpos'),
    yneg: document.getElementById('ypos'),
    ypos: document.getElementById('ypos'),
    zneg: document.getElementById('zneg'),
    zpos: document.getElementById('zpos')
  });

  if (!water.textureA.canDrawTo() || !water.textureB.canDrawTo()) {
    throw new Error('Rendering to floating-point textures is required but not supported');
  }

  center = oldCenter = new GL.Vector(0, -0.2, 0);
  velocity = new GL.Vector();
  gravity = new GL.Vector(0, -4, 0);
  radius = 0.25;

  //adding random drops, this is what should do when press a key or something for beat
  /*for (var i = 0; i < 20; i++) {
    water.addDrop(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.03, (i & 1) ? 0.01 : -0.01);
  }*/

  document.getElementById('loading').innerHTML = '';
  onresize();

  var requestAnimationFrame =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    function(callback) { setTimeout(callback, 0); };

  var prevTime = new Date().getTime();
  function animate() {
    var nextTime = new Date().getTime();
    if (!paused) {
      update((nextTime - prevTime) / 1000);
      draw();
    }
    prevTime = nextTime;
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  window.onresize = onresize;

  var prevHit;
  var planeNormal;
  var mode = -1;
  var MODE_ADD_DROPS = 0;
  var MODE_MOVE_SPHERE = 1;
  var MODE_ORBIT_CAMERA = 2;

  var oldX, oldY;

  function startDrag(x, y) {
    oldX = x;
    oldY = y;
    var tracer = new GL.Raytracer();
    var ray = tracer.getRayForPixel(x * ratio, y * ratio);
    var pointOnPlane = tracer.eye.add(ray.multiply(-tracer.eye.y / ray.y));
    var sphereHitTest = GL.Raytracer.hitTestSphere(tracer.eye, ray, center, radius);
    if (sphereHitTest) {
      mode = MODE_MOVE_SPHERE;
      prevHit = sphereHitTest.hit;
      planeNormal = tracer.getRayForPixel(gl.canvas.width / 2, gl.canvas.height / 2).negative();
    } else if (Math.abs(pointOnPlane.x) < 1 && Math.abs(pointOnPlane.z) < 1) {
      mode = MODE_ADD_DROPS;
      duringDrag(x, y);
    } else {
      mode = MODE_ORBIT_CAMERA;
    }
  }

  function duringDrag(x, y) {
    switch (mode) {
      case MODE_ADD_DROPS: {
        var tracer = new GL.Raytracer();
        var ray = tracer.getRayForPixel(x * ratio, y * ratio);
        var pointOnPlane = tracer.eye.add(ray.multiply(-tracer.eye.y / ray.y));
        water.addDrop(pointOnPlane.x, pointOnPlane.z, 0.03, 0.01);
        if (paused) {
          water.updateNormals();
          renderer.updateCaustics(water);
        }
        break;
      }
      case MODE_MOVE_SPHERE: {
        var tracer = new GL.Raytracer();
        var ray = tracer.getRayForPixel(x * ratio, y * ratio);
        var t = -planeNormal.dot(tracer.eye.subtract(prevHit)) / planeNormal.dot(ray);
        var nextHit = tracer.eye.add(ray.multiply(t));
        center = center.add(nextHit.subtract(prevHit));
        center.x = Math.max(radius - 1, Math.min(1 - radius, center.x));
        center.y = Math.max(radius - 1, Math.min(10, center.y));
        center.z = Math.max(radius - 1, Math.min(1 - radius, center.z));
        prevHit = nextHit;
        if (paused) renderer.updateCaustics(water);
        break;
      }
      case MODE_ORBIT_CAMERA: {
        angleY -= x - oldX;
        angleX -= y - oldY;
        angleX = Math.max(-89.999, Math.min(89.999, angleX));
        break;
      }
    }
    oldX = x;
    oldY = y;
    if (paused) draw();
  }

  function stopDrag() {
    mode = -1;
  }

  function isHelpElement(element) {
    return element === help || element.parentNode && isHelpElement(element.parentNode);
  }

  document.onmousedown = function(e) {
    if (!isHelpElement(e.target)) {
      e.preventDefault();
      startDrag(e.pageX, e.pageY);
    }
  };

  document.onmousemove = function(e) {
    duringDrag(e.pageX, e.pageY);
  };

  document.onmouseup = function() {
    stopDrag();
  };

  document.ontouchstart = function(e) {
    if (e.touches.length === 1 && !isHelpElement(e.target)) {
      e.preventDefault();
      startDrag(e.touches[0].pageX, e.touches[0].pageY);
    }
  };

  document.ontouchmove = function(e) {
    if (e.touches.length === 1) {
      duringDrag(e.touches[0].pageX, e.touches[0].pageY);
    }
  };

  document.ontouchend = function(e) {
    if (e.touches.length == 0) {
      stopDrag();
    }
  };

function getShader(gl, id) {
        var shaderScript = document.getElementById(id);
        if (!shaderScript) {
            return null;
        }

        var str = "";
        var k = shaderScript.firstChild;
        while (k) {
            if (k.nodeType == 3) {
                str += k.textContent;
            }
            k = k.nextSibling;
        }

        var shader;
        if (shaderScript.type == "x-shader/x-fragment") {
            shader = gl.createShader(gl.FRAGMENT_SHADER);
        } else if (shaderScript.type == "x-shader/x-vertex") {
            shader = gl.createShader(gl.VERTEX_SHADER);
        } else {
            return null;
        }

        gl.shaderSource(shader, str);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            alert(gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    }

var shaderProgram;

  function initShaders() {
    var fragmentShader = getShader(gl, "shader-fs");
    var vertexShader = getShader(gl, "shader-vs");
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert("Could not initialise shaders");
    }

    gl.useProgram(shaderProgram);

    shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
    gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

    shaderProgram.textureCoordAttribute = gl.getAttribLocation(shaderProgram, "aTextureCoord");
    gl.enableVertexAttribArray(shaderProgram.textureCoordAttribute);

    shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");
    gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

    shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
    shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
    shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");
    shaderProgram.samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler");
    shaderProgram.useLightingUniform = gl.getUniformLocation(shaderProgram, "uUseLighting");
    shaderProgram.ambientColorUniform = gl.getUniformLocation(shaderProgram, "uAmbientColor");
    shaderProgram.pointLightingLocationUniform = gl.getUniformLocation(shaderProgram, "uPointLightingLocation");
    shaderProgram.pointLightingColorUniform = gl.getUniformLocation(shaderProgram, "uPointLightingColor");
  }
  var SIZE_BANK = 100;
  var snareBank = [];
  for(var i=0; i<SIZE_BANK; i++){
    snareBank.push(new Audio("snare.wav"));
  }
  var bassBank = [];
  for(var i=0; i<SIZE_BANK; i++){
    bassBank.push(new Audio("bassdrum.wav"));
  }
  var hihatBank = [];
  for(var i=0; i<SIZE_BANK; i++){
    hihatBank.push(new Audio("hihat.wav"));
  }
  var cymbalBank = [];
  for(var i=0; i<SIZE_BANK; i++){
    cymbalBank.push(new Audio("cymbal.wav"));
  }
  var snarePos = 0;
  var bassPos = 0;
  var hihatPos = 0;
  var cymbalPos = 0;
  document.onkeydown = function(e) {
    if (e.which == ' '.charCodeAt(0)) paused = !paused;
    else if (e.which == 'G'.charCodeAt(0)) useSpherePhysics = !useSpherePhysics;    
    else if (e.which == 'C'.charCodeAt(0)) moveCamera = !moveCamera;
    else if (e.which == 'L'.charCodeAt(0) && paused) draw();
    else if (e.which == 'A'.charCodeAt(0)) {
      //add drop to particular region 
      //water.addDrop(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.03, (Math.random() > 0.5) ? 0.01 : -0.01);
      snareBank[snarePos].play();
      snarePos = (snarePos+1)%SIZE_BANK;
      water.addDrop(0.8, 0.8, 0.03, (Math.random() > 0.5) ? 0.01 : -0.01);
      //move sphere a little bit for some action
      center.y += Math.random()*0.003;
      if(moveCamera) {
        startDrag(center.x,center.y);
        duringDrag(center.x+(Math.random()*2-1)*5,center.y+(Math.random()*2-1)*5);
        //stopDrag();
      } 

      //color change of sphere
      colorR = Math.max(0,Math.min(255,colorR+(Math.random()*2-1)*0.1));
      colorG = Math.max(0,Math.min(255,colorG+(Math.random()*2-1)*0.1));
      colorB = Math.max(0,Math.min(255,colorB+(Math.random()*2-1)*0.1));

      //if too regular then randomize
      if(colorR > 0.8 && colorG > 0.8 & colorB > 0.8) {
        //colorR = Math.random();
      } 
    }
    else if (e.which == 'S'.charCodeAt(0)) {
      //add drop to particular region 
      //water.addDrop(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.03, (Math.random() > 0.5) ? 0.01 : -0.01);
      bassBank[bassPos].play();
      bassPos = (bassPos+1)%SIZE_BANK;
      water.addDrop(-0.8, 0.8, 0.03, (Math.random() > 0.5) ? 0.01 : -0.01);
      //move sphere a little bit for some action
      center.y += Math.random()*0.003;
      if(moveCamera) {
        startDrag(center.x,center.y);
        duringDrag(center.x+(Math.random()*2-1)*5,center.y+(Math.random()*2-1)*5);
        stopDrag();
      } 

            //color change of sphere
      colorR = Math.max(0,Math.min(255,colorR+(Math.random()*2-1)*0.1));
      colorG = Math.max(0,Math.min(255,colorG+(Math.random()*2-1)*0.1));
      colorB = Math.max(0,Math.min(255,colorB+(Math.random()*2-1)*0.1));
    }
    else if (e.which == 'X'.charCodeAt(0)) {
      //add drop to particular region 
      //water.addDrop(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.03, (Math.random() > 0.5) ? 0.01 : -0.01);
      hihatBank[hihatPos].play();
      hihatPos = (hihatPos+1)%SIZE_BANK;
      water.addDrop(-0.8, -0.8, 0.03, (Math.random() > 0.5) ? 0.01 : -0.01);
      //move sphere a little bit for some action
      center.y += Math.random()*0.003;
      if(moveCamera) {
        startDrag(center.x,center.y);
        duringDrag(center.x+(Math.random()*2-1)*5,center.y+(Math.random()*2-1)*5);
        stopDrag();
      } 

            //color change of sphere
      colorR = Math.max(0,Math.min(255,colorR+(Math.random()*2-1)*0.1));
      colorG = Math.max(0,Math.min(255,colorG+(Math.random()*2-1)*0.1));
      colorB = Math.max(0,Math.min(255,colorB+(Math.random()*2-1)*0.1));
    }
    else if (e.which == 'Z'.charCodeAt(0)) {
      //add drop to particular region 
      //water.addDrop(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.03, (Math.random() > 0.5) ? 0.01 : -0.01);
      cymbalBank[cymbalPos].play();
      cymbalPos = (cymbalPos+1)%SIZE_BANK;
      water.addDrop(0.8, -0.8, 0.03, (Math.random() > 0.5) ? 0.01 : -0.01);
      //move sphere a little bit for some action
      center.y += Math.random()*0.003;
      if(moveCamera) {
        startDrag(center.x,center.y);
        duringDrag(center.x+(Math.random()*2-1)*5,center.y+(Math.random()*2-1)*5);
        stopDrag();
      } 

            //color change of sphere
      colorR = Math.max(0,Math.min(255,colorR+(Math.random()*2-1)*0.1));
      colorG = Math.max(0,Math.min(255,colorG+(Math.random()*2-1)*0.1));
      colorB = Math.max(0,Math.min(255,colorB+(Math.random()*2-1)*0.1));
    }
  };

  var frame = 0;

  function update(seconds) {
    if (seconds > 1) return;
    frame += seconds * 2;

    if (mode == MODE_MOVE_SPHERE) {
      // Start from rest when the player releases the mouse after moving the sphere
      velocity = new GL.Vector();
    } else if (useSpherePhysics) {
      // Fall down with viscosity under water
      var percentUnderWater = Math.max(0, Math.min(1, (radius - center.y) / (2 * radius)));
      velocity = velocity.add(gravity.multiply(seconds - 1.1 * seconds * percentUnderWater));
      velocity = velocity.subtract(velocity.unit().multiply(percentUnderWater * seconds * velocity.dot(velocity)));
      center = center.add(velocity.multiply(seconds));

      // Bounce off the bottom
      if (center.y < radius - 1) {
        center.y = radius - 1;
        velocity.y = Math.abs(velocity.y) * 0.7;
      }
    }

    // Displace water around the sphere
    water.moveSphere(oldCenter, center, radius);
    oldCenter = center;

    // Update the water simulation and graphics
    water.stepSimulation();
    water.stepSimulation();
    water.updateNormals();
    renderer.updateCaustics(water);
  }

  function draw() {
    // Change the light direction to the camera look vector when the L key is pressed
    if (GL.keys.L) {
      renderer.lightDir = GL.Vector.fromAngles((90 - angleY) * Math.PI / 180, -angleX * Math.PI / 180);
      if (paused) renderer.updateCaustics(water);
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.loadIdentity();
    gl.translate(0, 0, -4);
    gl.rotate(-angleX, 1, 0, 0);
    gl.rotate(-angleY, 0, 1, 0);
    gl.translate(0, 0.5, 0);

      /*gl.uniform3f(
        shaderProgram.pointLightingLocationUniform,
        0,
        0,
        0
      );

      gl.uniform3f(
        shaderProgram.pointLightingColorUniform,
        1,
        0,
        0
      );*/

    gl.enable(gl.DEPTH_TEST);
    renderer.sphereCenter = center;
    renderer.sphereRadius = radius;
    renderer.sphereShader = new GL.Shader(helperFunctions + '\
    varying vec3 position;\
    void main() {\
      position = sphereCenter + gl_Vertex.xyz * sphereRadius;\
      gl_Position = gl_ModelViewProjectionMatrix * vec4(position, 1.0);\
    }\
  ', helperFunctions + '\
    varying vec3 position;\
    void main() {\
      gl_FragColor = vec4(' + 'vec3(' + colorR + ',' + colorG + ',' + colorB + ')' + ', 1.0);\
      vec4 info = texture2D(water, position.xz * 0.5 + 0.5);\
      if (position.y < info.r) {\
        gl_FragColor.rgb *= vec3(0.4, 0.9, 1.0) * 1.2;\
      }\
    }\
  ');
    //top color: getSphereColor(position)
    //underwater color: vec3(0.4, 0.9, 1.0)
    renderer.renderCube();
    renderer.renderWater(water, cubemap);
    renderer.renderSphere();
    gl.disable(gl.DEPTH_TEST);
  }
};
