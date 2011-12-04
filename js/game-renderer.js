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
    "rage-map",
    "util/gl-util",
    "js/util/gl-matrix.js"
], function(rageMap, glUtil) {

    "use strict";

    var GameRenderer = function (gl, canvas) {
        this.fov = 45;
        this.projectionMat = mat4.create();
        mat4.perspective(this.fov, canvas.width/canvas.height, 1.0, 4096.0, this.projectionMat);

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        gl.enable(gl.CULL_FACE);
        gl.frontFace(gl.CW);
        
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        
        this.map = new rageMap.RageMap();
        this.map.load(gl, 'HD_RageLevel2.iosMap', 'img/HD_RageLevel2');
        
        this.initControls(canvas);
    };
    
    GameRenderer.prototype.initControls = function(canvas) {
        var self = this;
        canvas.onmousemove = function(event) {
            var x = event.pageX - canvas.parentElement.offsetLeft;
            var y = event.pageY - canvas.parentElement.offsetTop;
            
            self.map.setLook(
                ((x / canvas.width) - 0.5) * 2.0,
                ((y / canvas.height) - 0.5) * -2.0
            );
        }
        
        document.onkeypress = function(event) {
            if(event.which == 13 || event.which == 32) {
                self.map.pause(!self.map.paused);
            }
        }
    };

    GameRenderer.prototype.resize = function (gl, canvas) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        mat4.perspective(this.fov, canvas.width/canvas.height, 1.0, 4096.0, this.projectionMat);
    };

    GameRenderer.prototype.drawFrame = function (gl, timing) {
        var projectionMat = this.projectionMat;

        gl.clear(gl.DEPTH_BUFFER_BIT);

        this.map.draw(gl, timing, projectionMat);
        this.map.updatePath(gl, timing.frameTime);
    };

    return {
        GameRenderer: GameRenderer
    };
});