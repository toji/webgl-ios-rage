/*
 * Copyright (c) 2011 Brandon Jones
 *
 * This software is provided 'as-is', without any express or implied
 * warranty. In no event will the authors be held liable for any damages
 * arising from the use of this software.
 *
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it
 * freely, subject to the following restrictions:
 *
 *    1. The origin of this software must not be misrepresented; you must not
 *    claim that you wrote the original software. If you use this software
 *    in a product, an acknowledgment in the product documentation would be
 *    appreciated but is not required.
 *
 *    2. Altered source versions must be plainly marked as such, and must not
 *    be misrepresented as being the original software.
 *
 *    3. This notice may not be removed or altered from any source
 *    distribution.
 */

var modelViewMat, projectionMat;
var zAngle = 0;
var xAngle = 0;
var cameraPosition = [0, -50, 0];

var pressed = new Array(128);
var cameraMat = mat4.create();

function getShader(gl, id) {
    var shaderScript = document.getElementById(id);
    if (!shaderScript)
        return null;
 
    var str = '';
    var k = shaderScript.firstChild;
    while (k) {
        if (k.nodeType == 3)
            str += k.textContent;
        k = k.nextSibling;
    }
 
    var shader;
    if (shaderScript.type == 'x-shader/x-fragment') {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (shaderScript.type == 'x-shader/x-vertex') {
        shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
        return null;
    }
 
    gl.shaderSource(shader, str);
    gl.compileShader(shader);
 
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.debug(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
 
    return shader;
}

function createShaderProgram(gl, vertexSrc, fragmentSrc, attribs, uniforms) {
    var fragmentShader = getShader(gl, vertexSrc);
    var vertexShader = getShader(gl, fragmentSrc);

    var shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        gl.deleteProgram(shaderProgram);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return null;
    }
    
    bindShaderVars(gl, shaderProgram, attribs, uniforms);
    
    return shaderProgram;
}

function bindShaderVars(gl, shaderProgram, attribs, uniforms) {
    if(attribs) {
        shaderProgram.attribute = {};
        for(var i in attribs) {
            var attrib = attribs[i];
            shaderProgram.attribute[attrib] = gl.getAttribLocation(shaderProgram, attrib);
        }
    }
    
    if(uniforms) {
        shaderProgram.uniform = {};
        for(var i in uniforms) {
            var uniform = uniforms[i];
            shaderProgram.uniform[uniform] = gl.getUniformLocation(shaderProgram, uniform);
        }
    }
}

// Handles input at a regular interval and moves the camera in a simple "flying" scheme.
function updateInput(frameTime) {
    var dir = [0, 0, 0];
    
    var speed = 10;
    
    // This is our first person movement code. It's not really pretty, but it works
    if(pressed['W'.charCodeAt(0)]) {
        dir[1] += speed;
    }
    if(pressed['S'.charCodeAt(0)]) {
        dir[1] -= speed;
    }
    if(pressed['A'.charCodeAt(0)]) {
        dir[0] -= speed;
    }
    if(pressed['D'.charCodeAt(0)]) {
        dir[0] += speed;
    }
    if(pressed[32]) {
        dir[2] += speed;
    }
    if(pressed[17]) {
        dir[2] -= speed;
    }
    
    if(dir[0] != 0 || dir[1] != 0 || dir[2] != 0) {
        mat4.identity(cameraMat);
        mat4.rotateX(cameraMat, xAngle);
        mat4.rotateZ(cameraMat, zAngle);
        mat4.inverse(cameraMat);
        
        mat4.multiplyVec3(cameraMat, dir);
        
        // Move the camera in the direction we are facing
        vec3.add(cameraPosition, dir);
    }
}

// Set up event handling
// This will give us basic movement around the scene
function initEvents(canvas) {
    var movingModel = false;
    var lastX = 0;
    var lastY = 0;
    
    window.onkeydown = function(event) {
        pressed[event.keyCode] = true;
    }

    window.onkeyup = function(event) {
        pressed[event.keyCode] = false;
    }
    
    // Mouse handling code
    // When the mouse is pressed it rotates the players view
    canvas.onmousedown = function(event) {
        if(event.which == 1) {
            movingModel = true;
        }
        lastX = event.pageX;
        lastY = event.pageY;
    }
    canvas.onmouseup = function(event) {
        movingModel = false;
    }
    canvas.onmousemove = function(event) {
        var xDelta = event.pageX  - lastX;
        var yDelta = event.pageY  - lastY;
        lastX = event.pageX;
        lastY = event.pageY;
        
        if (movingModel) {
            zAngle += xDelta*0.025;
            while (zAngle < 0)
                zAngle += Math.PI*2;
            while (zAngle >= Math.PI*2)
                zAngle -= Math.PI*2;
                
            xAngle += yDelta*0.025;
            while (xAngle < -Math.PI*0.5)
                xAngle = -Math.PI*0.5;
            while (xAngle > Math.PI*0.5)
                xAngle = Math.PI*0.5;
        }
    }
}

// Normalizes requestAnimationFrame interface across browsers
var reqAnimFrame = (function(){
  return  window.requestAnimationFrame       || 
          window.webkitRequestAnimationFrame || 
          window.mozRequestAnimationFrame    || 
          window.oRequestAnimationFrame      || 
          window.msRequestAnimationFrame     || 
          function(callback, element){
            window.setTimeout(callback, 1000 / 60);
          };
})();

function requestAnimation(callback, element) {
    var startTime;
    if(window.mozAnimationStartTime) {
        startTime = window.mozAnimationStartTime;
    } else if (window.webkitAnimationStartTime) {
        startTime = window.webkitAnimationStartTime;
    } else {
        startTime = new Date().getTime();
    }
    
    var lastTimestamp = startTime;
    var lastFps = startTime;
    var framesPerSecond = 0;
    var frameCount = 0;
    
    function onFrame(timestamp){
        if(!timestamp) {
            timestamp = new Date().getTime();
        }

        // Update FPS if a second or more has passed since last FPS update
        if(timestamp - lastFps >= 1000) {
            framesPerSecond = frameCount;
            frameCount = 0;
            lastFps = timestamp;
        } 
        
        if(callback({
            startTime: startTime,
            timestamp: timestamp,
            elapsed: timestamp - startTime,
            frameTime: timestamp - lastTimestamp,
            framesPerSecond: framesPerSecond,
        }) !== false) {
            reqAnimFrame(onFrame, element);
            ++frameCount;
        }
        lastTimestamp = timestamp;
    };
    
    onFrame(startTime);
};

// Utility function that tests a list of webgl contexts and returns when one can be created
// Hopefully this future-proofs us a bit
function getAvailableContext(canvas, contextList) {
    if (canvas.getContext) {
        for(var i = 0; i < contextList.length; ++i) {
            try {
                var context = canvas.getContext(contextList[i]);
                if(context != null)
                    return context;
            } catch(ex) { }
        }
    }
    return null;
}

// Create the WebGL context and set up some of the basic options. 
function setupWebGLSandbox(canvas, debug) {
    // Get the GL Context (try 'webgl' first, then fallback)
    var gl = getAvailableContext(canvas, ['webgl', 'experimental-webgl']);
    
    if(!gl)
        throw "WebGL Failed to Initialize"

    gl.viewportWidth = canvas.width;
    gl.viewportHeight = canvas.height;
    
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    
    // Create the projection and modelView matrices
    projectionMat = mat4.create();
    mat4.perspective(45.0, gl.viewportWidth/gl.viewportHeight, 1.0, 4096.0, projectionMat);
    modelViewMat = mat4.create();
    
    initEvents(canvas);
    
    return gl;
}

// Calls "onFrame" at a regular interval, providing it information about the current scene state
function animateWebGLSandbox(gl, canvas, onFrame) {
    var lastMove = 0;

    // use requestAnimationFrame to do animation if available
    requestAnimation(function(event) {
        // Update player movement @ 60hz
        // The while ensures that we update at a fixed rate even if the rendering bogs down
        while(event.elapsed - lastMove >= 16) {
            updateInput(16);
            lastMove += 16;
        }
        
        // Matrix setup
        mat4.identity(modelViewMat);
        mat4.rotateX(modelViewMat, xAngle-Math.PI/2.0);
        mat4.rotateZ(modelViewMat, zAngle);
        mat4.translate(modelViewMat, [-cameraPosition[0], -cameraPosition[1], - cameraPosition[2]]);
        
        event.projectionMat = projectionMat;
        event.modelViewMat = modelViewMat;
        event.cameraPosition = cameraPosition;
        
        return onFrame(gl, event); 
    }, canvas);
}
