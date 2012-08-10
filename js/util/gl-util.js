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

define([
    "js/util/game-shim.js"
], function() {

    "use strict";

    var vendorPrefixes = ["", "WEBKIT_", "MOZ_"];

    function getContext(canvas, options) {
        var context;
    
        if (canvas.getContext) {
            try {
                context = canvas.getContext('webgl', options);
                if(context) { return context; }
            } catch(ex) {}
        
            try {
                context = canvas.getContext('experimental-webgl', options);
                if(context) { return context; }
            } catch(ex) {}
        }
    
        return null;
    }

    function showGLFailed(element) {
        var errorElement = document.createElement("div");
        var errorHTML = "<h3>Sorry, but a WebGL context could not be created</h3>";
        errorHTML += "Either your browser does not support WebGL, or it may be disabled.<br/>";
        errorHTML += "Please visit <a href=\"http://get.webgl.org\">http://get.webgl.org</a> for ";
        errorHTML += "details on how to get a WebGL enabled browser.";
        errorElement.innerHTML = errorHTML;
        errorElement.id = "gl-error";
        element.parentNode.replaceChild(errorElement, element);
    }

    var ContextHelper = function(canvas) {
        var self = this, resizeTimeout;

        //
        // Create gl context and start the render loop
        //
        this.canvas = canvas;
        this.lastWidth = 0;
        this.renderer = null;

        this.gl = getContext(canvas, {alpha: false});

        if(!this.gl) {
            showGLFailed(canvas);
        } else {
            var resizeCallback = function() { self.windowResized(); };

            // On mobile devices, the canvas size can change when we rotate. Watch for that:
            document.addEventListener("orientationchange", resizeCallback, false);
            window.addEventListener("resize", resizeCallback, false);
        }
    };

    ContextHelper.prototype.start = function(renderer, stats) {
        if(!renderer.draw) {
            throw new Error("Object passed to startRenderLoop must have a draw function");
        }

        this.renderer = renderer;

        var startTime = Date.now(),
            lastTimeStamp = startTime,
            canvas = this.canvas,
            gl = this.gl;

        var timingData = {
            startTime: startTime,
            timeStamp: 0,
            elapsed: 0,
            frameTime: 0
        };

        this.windowResized(true);
    
        function nextFrame(){
            var time = Date.now();
            // Recommendation from Opera devs: calling the RAF shim at the beginning of your
            // render loop improves framerate on browsers that fall back to setTimeout
            window.requestAnimationFrame(nextFrame, canvas);

            timingData.timeStamp = time;
            timingData.elapsed = time - startTime;
            timingData.frameTime = time - lastTimeStamp;

            if(stats) { stats.begin(); }
            renderer.draw(gl, timingData);
            if(stats) { stats.end(); }

            lastTimeStamp = time;
        }

        window.requestAnimationFrame(nextFrame, canvas);
    };

    ContextHelper.prototype.windowResized = function(force) {
        if(this.lastWidth === window.innerWidth && !force) { return; }

        var canvas = this.canvas;

        this.lastWidth = window.innerWidth;

        canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        canvas.height = canvas.offsetHeight * window.devicePixelRatio;

        if(this.renderer && this.renderer.resize) {
            this.renderer.resize(this.gl, canvas);
        }
    };

    var ShaderWrapper = function(gl, program) {
        var i, attrib, uniform, count, name;

        this.program = program;
        this.attribute = {};
        this.uniform = {};

        count = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
        for (i = 0; i < count; i++) {
            attrib = gl.getActiveAttrib(program, i);
            this.attribute[attrib.name] = gl.getAttribLocation(program, attrib.name);
        }

        count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (i = 0; i < count; i++) {
            uniform = gl.getActiveUniform(program, i);
            name = uniform.name.replace("[0]", "");
            this.uniform[name] = gl.getUniformLocation(program, name);
        }
    };

    return {
        ContextHelper: ContextHelper,
        ShaderWrapper: ShaderWrapper,

        getContext: getContext,
        showGLFailed: showGLFailed,
    
        createProgram: function(gl, vertexShaderSource, fragmentShaderSource) {
            var shaderProgram = gl.createProgram(),
                vs = this.compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER),
                fs = this.compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);

            gl.attachShader(shaderProgram, vs);
            gl.attachShader(shaderProgram, fs);
            gl.linkProgram(shaderProgram);

            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
                console.error("Shader program failed to link");
                gl.deleteProgram(shaderProgram);
                gl.deleteShader(vs);
                gl.deleteShader(fs);
                return null;
            }

            return new ShaderWrapper(gl, shaderProgram);
        },

        compileShader: function(gl, source, type) {
            var shaderHeader = "\n";

            var shader = gl.createShader(type);

            gl.shaderSource(shader, shaderHeader + source);
            gl.compileShader(shader);

            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                var typeString = "";
                switch(type) {
                    case gl.VERTEX_SHADER: typeString = "VERTEX_SHADER"; break;
                    case gl.FRAGMENT_SHADER: typeString = "FRAGMENT_SHADER"; break;
                }
                console.error(typeString, gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }

            return shader;
        },

        getExtension: function(gl, name) {
            var i, ext;
            for(i in vendorPrefixes) {
                ext = gl.getExtension(vendorPrefixes[i] + name);
                if (ext) {
                    return ext;
                }
            }
            return null;
        }
    };
});