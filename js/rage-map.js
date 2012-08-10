/*
 * Copyright (c) 2012 Brandon Jones
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
    "util/gl-util",
    "crunch",
    "util/gl-matrix-min"
], function (GLUtil, crunch) {

    var crunchWorker = new Worker("js/crunch-worker.js");

    var pendingCrunchTextures = {};

    crunchWorker.onmessage = function(msg) {
        var pk = pendingCrunchTextures[msg.data.src];
        var texture = pk.texture;
        var gl = pk.gl;

        gl.bindTexture(gl.TEXTURE_2D, texture);
        console.time("Upload CRN");
        gl.compressedTexImage2D(gl.TEXTURE_2D, 0, msg.data.internalFormat, msg.data.width, msg.data.height, 0, msg.data.dxtData);
        console.timeEnd("Upload CRN");

        delete pendingCrunchTextures[msg.data.src];
    };

    var loadCrunchTexture = function(gl, src, texture, useWorker) {
        if(useWorker) {
            pendingCrunchTextures[src] = {texture: texture, gl: gl};
            crunchWorker.postMessage({src: src});
        } else {
            // Load from CRN
            var xhr = new XMLHttpRequest();
            xhr.onload = function () {
                crunch.uploadCRNLevels(gl, this.s3tc, xhr.response, texture, false);
            };
            xhr.responseType = "arraybuffer";
            xhr.open('GET', src, true);
            xhr.send(null);
        }
    };

    var loadTexture = (function createTextureLoader() {
        var MAX_CACHE_IMAGES = 16;

        var textureImageCache = new Array(MAX_CACHE_IMAGES);
        var cacheTop = 0;
        var remainingCacheImages = MAX_CACHE_IMAGES;
        var pendingTextureRequests = [];

        var TextureImageLoader = function(loadedCallback) {
            var self = this;

            this.gl = null;
            this.texture = null;
            this.callback = null;

            this.image = new Image();
            this.image.addEventListener("load", function() {
                var gl = self.gl;
                gl.bindTexture(gl.TEXTURE_2D, self.texture);
                console.time("Upload JPEG");
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, self.image);
                console.timeEnd("Upload JPEG");
                //gl.generateMipmap(gl.TEXTURE_2D);

                loadedCallback(self);
                if(self.callback) { self.callback(self.texture); }
            });
        };

        TextureImageLoader.prototype.loadTexture = function(gl, src, texture, callback) {
            this.gl = gl;
            this.texture = texture;
            this.callback = callback;
            this.image.src = src;
        };

        var PendingTextureRequest = function(gl, src, texture, callback) {
            this.gl = gl;
            this.src = src;
            this.texture = texture;
            this.callback = callback;
        };

        function releaseTextureImageLoader(til) {
            var req;
            if(pendingTextureRequests.length) {
                req = pendingTextureRequests.shift();
                til.loadTexture(req.gl, req.src, req.texture, req.callback);
            } else {
                textureImageCache[cacheTop++] = til;
            }
        }

        return function(gl, src, texture, callback) {
            var til;

            if(cacheTop) {
                til = textureImageCache[--cacheTop];
                til.loadTexture(gl, src, texture, callback);
            } else if (remainingCacheImages) {
                til = new TextureImageLoader(releaseTextureImageLoader);
                til.loadTexture(gl, src, texture, callback);
                --remainingCacheImages;
            } else {
                pendingTextureRequests.push(new PendingTextureRequest(gl, src, texture, callback));
            }
        };
    })();
    
    // Shader for rendering world geometry
    var meshVS = [
        "attribute vec3 position;",
        "attribute vec2 texture;",
        "uniform mat4 modelViewMat;",
        "uniform mat4 projectionMat;",
        "varying vec2 texCoord;",
        "void main(void) {",
        "    vec4 vPosition = modelViewMat * vec4(position, 1.0);",
        "    texCoord = vec2((texture.s / 65535.0) + 0.5, (-texture.t / 65535.0) + 0.5);",
        "    gl_Position = projectionMat * vPosition;",
        "}"
    ].join("\n");

    var meshFS = [
        "precision highp float;",

        "uniform sampler2D diffuse;",
        "varying vec2 texCoord;",
        "void main(void) {",
        "    gl_FragColor = texture2D(diffuse, texCoord.st);",
        "}"
    ].join("\n");

    var meshFS2 = [
        "precision highp float;",

        "uniform sampler2D diffuse;",
        "varying vec2 texCoord;",
        "void main(void) {",
        "   gl_FragColor = vec4(texCoord.s, 0, texCoord.t, 1.0);",
        "}"
    ].join("\n");

    var ms_per_pt = 200; // How long does it take to travel between each point of the path

    function RageMap() {
        this.complete = false;

        this.viewMat = mat4.create();

        this.time = 0;
        this.look_x = 0;
        this.look_y = 0;

        this.paused = true;

        this.textures = [];
        
        this.poolTextures = true;
        this.throttleTextures = true;

        this.textured = true;
        this.useCrunch = false;
        this.useCrunchWorker = false;
    }
    
    RageMap.prototype.load = function (gl, url, texurl) {
        var that = this;
        this.texurl = texurl;
        this.s3tc = GLUtil.getExtension(gl, "WEBGL_compressed_texture_s3tc");

        var xhr = new XMLHttpRequest();
        xhr.responseType = "arraybuffer";
        xhr.onload = function () {
            if(xhr.status == 200) {
                var parsedData = that.parse(xhr.response);
                that.compile(gl, parsedData);

                that.complete = true;
            }
        };
        xhr.open('GET', url, true);
        xhr.send(null);
    };

    //
    // File Parsing
    //

    RageMap.prototype.parse = function(src) {
        var dataView = new DataView(src);
    
        this.header = this.parseHeader(dataView);
        this.path = this.parsePath(dataView, this.header.lumps[4]);
    
        var parsed = {
            verts: this.parseVerts(dataView, this.header.lumps[0]),
            indices: this.parseIndices(src, this.header.lumps[1])
        };
    
        this.offsets = this.parseTextures(dataView, this.header.lumps[2]);
        this.meshes = this.parseMeshes(dataView, this.header.lumps[3]);
    
        return parsed;
    };

    RageMap.prototype.parseHeader = function(dataView) {
        var header = {};

        header.textureSize = dataView.getInt32(132, true);
    
        header.lumps = [
            {
                stride: 10,
                offset: dataView.getInt32(144, true),
                elements: dataView.getInt32(164, true)
            },
            {
                stride: 2,
                offset: dataView.getInt32(148, true),
                elements: dataView.getInt32(168, true)
            },
            {
                stride: 32,
                offset: dataView.getInt32(152, true),
                elements: dataView.getInt32(172, true)
            },
            {
                stride: 20,
                offset: dataView.getInt32(156, true),
                elements: dataView.getInt32(180, true)
            },
            {
                stride: 84,
                offset: dataView.getInt32(160, true),
                elements: dataView.getInt32(184, true)
            }
        ];
    
        header.max_textures = dataView.getInt32(188, true);
    
        return header;
    };

    RageMap.prototype.parseVerts = function(dataView, lump) {
        // Vertex Array
        var vertArray = new Float32Array(lump.elements * 5);

        var end = lump.offset + (lump.elements * lump.stride);
        for(var i = lump.offset, o = 0; i < end; i += lump.stride) {
            // Pos
            vertArray[o++] = dataView.getInt16(i, true); // x
            vertArray[o++] = dataView.getInt16(i + 2, true); // y
            vertArray[o++] = dataView.getInt16(i + 4, true); // z
        
            // Texcoord?
            vertArray[o++] = dataView.getInt16(i + 6, true); // s;
            vertArray[o++] = dataView.getInt16(i + 8, true); // t;
        }

        return vertArray;
    };

    RageMap.prototype.parseIndices = function(src, lump) {
        // Index Array
        return new Uint8Array(src, lump.offset, lump.elements * 2);
    };

    RageMap.prototype.parseTextures = function(dataView, lump) {
        // Texture Array
        var textures = [];
        var i, j;
        var end = lump.offset + (lump.elements * lump.stride);
        for(i = lump.offset, j = 0; i < end; i += lump.stride, ++j) {
            textures.push({
                imgId: j,
                img: null,
                loaded: null,
                texture: null,
                vertOffset: dataView.getUint32(i, true),
                vertCount:  dataView.getUint32(i + 4, true),
                indexOffset: dataView.getUint32(i + 8, true),
                indexCount: dataView.getUint32(i + 12, true)
            });
        }

        return textures;
    };

    RageMap.prototype.parseMeshes = function(dataView, lump) {
        // Mesh Array
        var meshes = [];
    
        var end = lump.offset + (lump.elements * lump.stride);
        for(var i = lump.offset; i < end; i += lump.stride) {
            meshes.push({
                offset: dataView.getInt32(i, true),
                startIndex: dataView.getInt32(i + 4, true),
                indexCount: dataView.getInt32(i + 8, true)
            });
        }

        return meshes;
    };

    RageMap.prototype.parsePath = function(dataView, lump) {
        // Path Array
        var path = [];
        var i, j;
    
        var end = lump.offset + (lump.elements * lump.stride);
        for(i = lump.offset; i < end; i += lump.stride) {

            var pos = vec3.create();
                pos[0] = -dataView.getFloat32(i, true);
                pos[1] = dataView.getFloat32(i+8, true);
                pos[2] = -dataView.getFloat32(i+4, true);

            var orient = quat4.create();
                orient[0] = -dataView.getFloat32(i+12, true);
                orient[1] = dataView.getFloat32(i+20, true);
                orient[2] = -dataView.getFloat32(i+16, true);
                orient[3] = dataView.getFloat32(i+24, true);

            var point = {
                pos: pos,
                orient: orient,
                offset: dataView.getInt32(i + 28, true),
                elements: dataView.getInt32(i + 32, true),
            
                atlas: [],
                list: []
            };
        
            for(j = 0; j < 16; ++j) {
                var idx = dataView.getInt16(i + 52 + (j * 2), true);
                point.atlas[j] = idx;
            }
        
            path.push(point);
        }
        
        // TODO: Change to Int16Array blit?
        for(i in path) {
            var element = path[i];
        
            end = element.offset + (element.elements * 2);
            for(j = element.offset; j < end; j += 2) {
                element.list.push(dataView.getUint16(j, true));
            }
        }
    
        return path;
    };

    //
    // WebGL resource management
    //

    RageMap.prototype.compile = function(gl, parsed) {
        for(var i = 0; i < this.header.max_textures * 2; ++i) {
            var tex = gl.createTexture();
        
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1024, 1024, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    
            this.textures[i] = { offset: null, texture: tex };
        }

        // Get the first batch of textures loading
        this.updateTextures(gl, this.path[0]);
        this.curPath = this.path[0];
    
        // Fill the buffers
        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, parsed.verts, gl.STATIC_DRAW);
    
        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, parsed.indices, gl.STATIC_DRAW);
    
        // Compile the shaders
        this.meshShader = GLUtil.createProgram(gl, meshVS, meshFS);
        this.meshShader2 = GLUtil.createProgram(gl, meshVS, meshFS2);
    };

    //
    // Map Navigation
    //

    RageMap.prototype.setLook = function(x, y) {
        this.look_x = x;
        this.look_y = y;
    };

    RageMap.prototype.resetPath = function() {
        this.time = 0;
    };

    RageMap.prototype.pause = function(paused) {
        this.paused = paused;
    };

    var pos = vec3.create();
    var orient = quat4.create();
    var orientMat = mat4.create();
    RageMap.prototype.updatePath = function(gl, frameTime) {
        if(!this.complete) { return; }
    
        if(!this.paused) {
            this.time += frameTime;
        
            if(this.time >= ms_per_pt * (this.path.length - 1)) {
                this.resetPath();
            }
        }
    
        var t0 = this.time / ms_per_pt;
        var t1 = t0 + 1.0;
    
        var p0 = this.path[Math.floor(t0)];
        var newPoint = this.curPathId != Math.floor(t0);
        this.curPathId = Math.floor(t0);
        this.curPath = p0;
        var p1 = this.path[Math.floor(t1)];
        if(!p0 || !p1) { return; }
        this.nextPath = p1;
    
        if(!this.paused && newPoint) {
            this.updateTextures(gl, p0);
        }
    
        var f = t0 - Math.floor(t0);
    
        // Interpolate between path points
        vec3.lerp(p0.pos, p1.pos, f, pos);
        quat4.slerp(p0.orient, p1.orient, f, orient);

        mat4.identity(this.viewMat);
        mat4.rotateY(this.viewMat, 3.14159);
        mat4.rotateX(this.viewMat, -1.5707);
    
        if(this.look_x || this.look_y) {
            mat4.rotateX(this.viewMat, 1.047 * this.look_y);
            mat4.rotateZ(this.viewMat, 1.570 * this.look_x);
        }
        
        quat4.toMat4(orient, orientMat);
        mat4.multiply(this.viewMat, orientMat);
        mat4.translate(this.viewMat, pos);
    };

    RageMap.prototype.updateTextures = function(gl, path) {
        if(!path) { path = this.curPath; }
        var i, offset;
    
        if(path) {
            // Ensure all textures for the current position are loaded
            for(i in path.list) {
                var meshId = Math.abs(path.list[i]);
                var mesh = this.meshes[meshId];
                offset = this.offsets[mesh.offset];
                this.loadTexture(gl, offset);
            }
        
            for(i = 0; i < 16; ++i) {
                var imgId = path.atlas[i];
                if(imgId < 0) { continue; }
            
                offset = this.offsets[imgId];
                this.loadTexture(gl, offset);
            }
        }
    };

    RageMap.prototype.loadTexture = function(gl, offset) {
        if(!this.textured) { return; }
        if(offset.texture) {
            // If this texture is already loaded, push it to the back of the buffer
            // This serves as a simple "Most-recently-used" paging scheme
            var idx = this.textures.indexOf(offset.texture); // I have a feeling this is expensive...
            if(idx >= 0) { this.textures.splice(idx, 1); }
            this.textures.push(offset.texture);
            return;
        }
        
        // Pull the first texture in the array (least recently used)
        // and use it, pushing it to the back
        var nextTexture = this.textures[0];
        
        offset.texture = nextTexture;
        if(nextTexture.offset !== null) {
            nextTexture.offset.texture = null;
        }
        nextTexture.offset = offset;
        this.textures.splice(0, 1);
        this.textures.push(nextTexture);

        var src = this.texurl + '/' + offset.imgId;

        if(this.useCrunch) {
            loadCrunchTexture(gl, src + '.crn', nextTexture.texture, this.useCrunchWorker);
        } else {
            loadTexture(gl, src + '.jpg', nextTexture.texture);
        }
    };

    //
    // Rendering functions
    //

    RageMap.prototype.bindTexture = function(gl, shader, texture) {
        if(this.textured && texture.texture) {
            gl.bindTexture(gl.TEXTURE_2D, texture.texture.texture);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, null);
        }
        gl.uniform1i(shader.uniform.diffuse, 0);
    
        // Setup the vertex buffer layout
        gl.vertexAttribPointer(shader.attribute.position, 3, gl.FLOAT, false, 20, (texture.vertOffset * 20));
        gl.vertexAttribPointer(shader.attribute.texture, 2, gl.FLOAT, false, 20, 12 + (texture.vertOffset * 20));
    };

    RageMap.prototype.draw = function(gl, event, projectionMat) {
        if(!this.complete) { return; }
            
        var shader = this.textured ? this.meshShader : this.meshShader2;
        gl.useProgram(shader.program);
            
        // Bind the matricies
        gl.uniformMatrix4fv(shader.uniform.modelViewMat, false, this.viewMat);
        gl.uniformMatrix4fv(shader.uniform.projectionMat, false, projectionMat);
    
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    
        gl.enableVertexAttribArray(shader.attribute.position);
        gl.enableVertexAttribArray(shader.attribute.texture);

        gl.activeTexture(gl.TEXTURE0);
    
        var activeTexture = -1;
    
        for(var j in this.curPath.list) {
            var meshId = Math.abs(this.curPath.list[j]);
            var mesh = this.meshes[meshId];
            var offset = this.offsets[mesh.offset];
        
            // Meshes are sorted by texture, only re-bind when the texture changes
            if(mesh.offset != activeTexture) {
                activeTexture = mesh.offset;
                this.bindTexture(gl, shader, offset);
            }
        
            var indexOffset = offset.indexOffset + mesh.startIndex;
            gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, indexOffset * 2);
        }
    };
    
    return RageMap;
});
