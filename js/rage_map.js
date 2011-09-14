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

// Shader for rendering world geometry
var meshVS = "attribute vec3 position;\n";
meshVS += "attribute vec2 texture;\n";
meshVS += "uniform mat4 modelViewMat;\n";
meshVS += "uniform mat4 projectionMat;\n";
meshVS += "varying vec2 texCoord;\n";
meshVS += "void main(void) {\n";
meshVS += "    vec4 vPosition = modelViewMat * vec4(position, 1.0);\n";
meshVS += "    texCoord = vec2((texture.s / 65535.0) + 0.5, (-texture.t / 65535.0) + 0.5);\n";
meshVS += "    gl_Position = projectionMat * vPosition;\n";
meshVS += "}";

var meshFS = "uniform sampler2D diffuse;\n";
meshFS += "varying vec2 texCoord;\n";
meshFS += "void main(void) {\n";
meshFS += "    gl_FragColor = texture2D(diffuse, texCoord.st);\n";
meshFS += "}";

// Shader for rendering the path 
var pathVS = "attribute vec3 position;\n";
pathVS += "uniform mat4 modelViewMat;\n";
pathVS += "uniform mat4 projectionMat;\n";
pathVS += "void main(void) {\n";
pathVS += "    vec4 vPosition = modelViewMat * vec4(position, 1.0);\n";
pathVS += "    gl_Position = projectionMat * vPosition;\n";
pathVS += "}";

var pathFS_White = "void main(void) { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); }";
var pathFS_Green = "void main(void) { gl_FragColor = vec4(0.0, 0.75, 0.0, 1.0); }";

var ms_per_pt = 200; // How long does it take to travel between each point of the path

function RageMap(gl, url, texurl) {
    this.complete = false;
    
    var that = this;
    
    this.viewMat = mat4.create();
    this.texurl = texurl;
    
    // Must request this way (can't use jQuery), since the char encoding matters!
    var request = new XMLHttpRequest();
    request.onreadystatechange = function () {
        if (request.readyState == 4 && request.status == 200) {
            var parsed = that.parse(request.responseText);
            that.compile(gl, parsed);
            
            that.complete = true;
        }
    };
    request.open('GET', url, true);
    request.overrideMimeType('text/plain; charset=x-user-defined');
    request.setRequestHeader('Content-Type', 'text/plain');
    request.send(null);
    
    this.time = 0;
    this.look_x = 0;
    this.look_y = 0;
    
    this.paused = true;
    
    this.textures = [];
}

//
// File Parsing
//

RageMap.prototype.parse = function(data) {
    var src = new BinaryFile(data);
    
    this.header = this.parseHeader(src);
    
    this.path = this.parsePath(src, this.header.lumps[4]);
    
    this.position = [this.path[0].x, this.path[0].y, this.path[0].z];
    
    var parsed = {
        verts: this.parseVerts(src, this.header.lumps[0]),
        indices: this.parseIndices(src, this.header.lumps[1]),
        pathVerts: this.parsePathVerts(this.path),
    };
    
    this.offsets = this.parseTextures(src, this.header.lumps[2]);
    this.meshes = this.parseMeshes(src, this.header.lumps[3]);
    
    return parsed;
}

RageMap.prototype.parseHeader = function(src) {
    var header = {};
    
    src.seek(0);
                
    header.magic = src.readString(4);
    header.name = src.readString(128);
    
    header.textureSize = src.readLong(); // Always 1024
    src.readLong(); // Always 2
    src.readLong(); // Always 2
    
    header.lumps = [
        {stride: 10}, 
        {stride: 2}, 
        {stride: 32}, 
        {stride: 20},
        {stride: 84}
    ];
    
    header.lumps[0].offset = src.readLong();
    header.lumps[1].offset = src.readLong();
    header.lumps[2].offset = src.readLong();
    header.lumps[3].offset = src.readLong();
    header.lumps[4].offset = src.readLong();
    
    header.lumps[0].elements = src.readLong();
    header.lumps[1].elements = src.readLong();
    header.lumps[2].elements = src.readLong();
    src.readULong(); // Always 0
    header.lumps[3].elements = src.readLong();
    header.lumps[4].elements = src.readLong();
    
    header.max_textures = src.readLong();
    
    return header;
}

RageMap.prototype.parseVerts = function(src, lump) {
    // Vertex Array
    var vertArray = new Float32Array(lump.elements * 5);
    
    src.seek(lump.offset);
    for(var i = 0, o = 0; i < lump.elements; ++i) {
        // Pos
        vertArray[o++] = src.readShort(); // x
        vertArray[o++] = src.readShort(); // y
        vertArray[o++] = src.readShort(); // z
        
        // Texcoord?
        vertArray[o++] = src.readShort(); // s;
        vertArray[o++] = src.readShort(); // t;
    }

    return vertArray;
}

RageMap.prototype.parseIndices = function(src, lump) {
    // Index Array
    var indexArray = new Uint16Array(lump.elements);
    
    src.seek(lump.offset);
    for(var i = 0; i < lump.elements; ++i) {
        indexArray[i] = src.readUShort();
    }

    return indexArray;
}

RageMap.prototype.parseTextures = function(src, lump) {
    // Texture Array
    var textures = [];
    
    src.seek(lump.offset);
    for(var i = 0; i < lump.elements; ++i) {
        textures.push({
            imgId: i,
            img: null,
            loaded: null,
            texture: null,
            vertOffset: src.readULong(),
            vertCount:  src.readULong(),
            indexOffset: src.readULong(),
            indexCount: src.readULong(),
        });
        
        src.readString(16); // This is always 0, for some reason
    }

    return textures;
}

RageMap.prototype.parseMeshes = function(src, lump) {
    // Mesh Array
    var meshes = [];
    
    src.seek(lump.offset);
    for(var i = 0; i < lump.elements; ++i) {
        meshes.push({
            offset: src.readLong(),
            
            startIndex: src.readLong(),
            indexCount: src.readLong(),
            
            x: src.readShort(),
            y: src.readShort(),
            z: src.readShort(),
            radius: src.readShort(),
        });
    }

    return meshes;
}

RageMap.prototype.parsePath = function(src, lump) {
    // Path Array
    var path = [];
    
    src.seek(lump.offset);
    for(var i = 0; i < lump.elements; ++i) {
        var point = {
            x: src.readFloat(),
            z: src.readFloat(),
            y: -src.readFloat(),
            lx: src.readFloat(),
            lz: src.readFloat(),
            ly: -src.readFloat(),
            lw: src.readFloat(),
            
            offset: src.readLong(),
            elements: src.readLong(),
            
            atlas: [],
            list: [],
        };
        
        // Read unused values
        src.readLong(); // 0
        src.readLong(); // 0
            
        src.readFloat();
        src.readFloat();
        
        for(var j = 0; j < 16; ++j) {
            var idx = src.readShort();
            point.atlas[j] = idx;
        }
        
        path.push(point);
    }
    
    for(var i in path) {
        var element = path[i];
        
        src.seek(element.offset);
        for(var j = 0; j < element.elements; ++j) {
            element.list.push(src.readUShort());
        }
    }
    
    return path;
}

RageMap.prototype.parsePathVerts = function(path) {
    // Vertex Array
    var vertArray = new Float32Array(path.length * 9);
    
    var o = 0;
    for(var i = 0; i < path.length; ++i) {
        var pt = path[i];
    
        // Pos
        vertArray[o++] = pt.x;
        vertArray[o++] = pt.y;
        vertArray[o++] = pt.z;
    }
    
    for(var i = 0; i < path.length; ++i) {
        var pt = path[i];
    
        // Look Start
        vertArray[o++] = pt.x;
        vertArray[o++] = pt.y;
        vertArray[o++] = pt.z;
        
        var look = quat4.multiplyVec3([pt.lx, pt.ly, pt.lz, pt.lw], [0, -7, 0]);
        
        // Look Direction
        vertArray[o++] = pt.x + look[0];
        vertArray[o++] = pt.y + look[1];
        vertArray[o++] = pt.z + look[2];
    }

    return vertArray;
}

//
// WebGL resource management
//

RageMap.prototype.compileShader = function(gl, source, type) {
    var shaderHeader = "#ifdef GL_ES\n";
	shaderHeader += "precision highp float;\n";
	shaderHeader += "#endif\n";
 
    var shader = gl.createShader(type);
 
    gl.shaderSource(shader, shaderHeader + source);
    gl.compileShader(shader);
 
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.debug(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
 
    return shader;
}

RageMap.prototype.createShaderProgram = function(gl, vertexShader, fragmentShader, attribs, uniforms) {
    var shaderProgram = gl.createProgram();
    
    var vs = this.compileShader(gl, vertexShader, gl.VERTEX_SHADER);
    var fs = this.compileShader(gl, fragmentShader, gl.FRAGMENT_SHADER);

    gl.attachShader(shaderProgram, vs);
    gl.attachShader(shaderProgram, fs);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        gl.deleteProgram(shaderProgram);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return null;
    }
    
    this.bindShaderVars(gl, shaderProgram, attribs, uniforms);
    
    return shaderProgram;
}

RageMap.prototype.bindShaderVars = function(gl, shaderProgram, attribs, uniforms) {
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
    
    this.pathBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pathBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, parsed.pathVerts, gl.STATIC_DRAW);
    
    // Compile the shaders
    this.meshShader = this.createShaderProgram(gl, meshVS, meshFS, 
        ['position', 'texture'], ['modelViewMat', 'projectionMat']);
    
    this.pathWhiteShader = this.createShaderProgram(gl, pathVS, pathFS_White, 
        ['position'], ['modelViewMat', 'projectionMat']);
        
    this.pathGreenShader = this.createShaderProgram(gl, pathVS, pathFS_Green, 
        ['position'], ['modelViewMat', 'projectionMat']);
}

//
// Map Navigation
//

RageMap.prototype.setLook = function(x, y) {
    this.look_x = x;
    this.look_y = y; 
}

RageMap.prototype.resetPath = function() {
    this.time = 0;
}

RageMap.prototype.pause = function(paused) {
    this.paused = paused;
}

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
    var pos = vec3.lerp([-p0.x, -p0.y, -p0.z], 
                        [-p1.x, -p1.y, -p1.z], f);
                        
    var orient = quat4.slerp([p0.lx, p0.ly, p0.lz, p0.lw],
                             [p1.lx, p1.ly, p1.lz, p1.lw], f);
                             
    mat4.identity(this.viewMat);
    mat4.rotateZ(this.viewMat, 3.1415);
    mat4.rotateX(this.viewMat, 1.5707);
    
    if(this.look_x || this.look_y) {
        mat4.rotateX(this.viewMat, 1.047 * this.look_y);
        mat4.rotateZ(this.viewMat, 1.570 * this.look_x);
    }
    
    mat4.multiply(this.viewMat, quat4.toMat4(orient));
    
    mat4.translate(this.viewMat, pos);
}

RageMap.prototype.updateTextures = function(gl, path) {
    var that = this;
    
    if(path) {
        // Ensure all textures for the current position are loaded
        for(var i in path.list) {
            var meshId = Math.abs(path.list[i]);
            var mesh = this.meshes[meshId]; 
            var offset = this.offsets[mesh.offset];
            this.loadTexture(gl, offset);
            
        }
        
        for(var i = 0; i < 16; ++i) {
            var imgId = path.atlas[i];
            if(imgId < 0) { continue; }
            
            var offset = this.offsets[imgId];
            this.loadTexture(gl, offset);
        }
    }
}

RageMap.prototype.loadTexture = function(gl, offset) {
    if(offset.texture) { 
        // If this texture is already loaded, push it to the back of the buffer
        // This serves as a simple "Most-recently-used" paging scheme
        var idx = this.textures.indexOf(offset.texture); // I have a feeling this is expensive...
        if(idx >= 0) { this.textures.splice(idx, 1); }
        this.textures.push(offset.texture);
        return;
    }
    
    var img = new Image();
    var that = this;
    
    // Pull the first texture in the array (least recently used)
    // and use it, pushing it to the back
    var nextTexture = this.textures[0];
    offset.texture = nextTexture;
    if(nextTexture.offset != null) {
        nextTexture.offset.texture = null;
    }
    nextTexture.offset = offset;
    this.textures.splice(0, 1);
    this.textures.push(nextTexture);
    
    offset.img = img;
    
    img.onload = function() {
        offset.loaded = true;
        offset.img = null;
        
        // Check and make sure the texture is still needed
        if(!offset.texture) { return; }
        gl.bindTexture(gl.TEXTURE_2D, nextTexture.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    };
    img.src = this.texurl + '/' + offset.imgId + '.jpg';
}

//
// Rendering functions
//

RageMap.prototype.bindTexture = function(gl, shader, texture) {
    if(texture.texture) {        
        gl.bindTexture(gl.TEXTURE_2D, texture.texture.texture);
    } else {
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.uniform1i(shader.uniform.diffuse, 0);
    
    // Setup the vertex buffer layout 
    gl.vertexAttribPointer(shader.attribute.position, 3, gl.FLOAT, false, 20, (texture.vertOffset * 20));
    gl.vertexAttribPointer(shader.attribute.texture, 2, gl.FLOAT, false, 20, 12 + (texture.vertOffset * 20));
}

RageMap.prototype.draw = function(gl, event, freelook) {
    if(!this.complete) { return; }
    
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(this.meshShader);
    		
    // Bind the matricies
    gl.uniformMatrix4fv(this.meshShader.uniform.modelViewMat, false, freelook ? event.modelViewMat : this.viewMat);
    gl.uniformMatrix4fv(this.meshShader.uniform.projectionMat, false, event.projectionMat);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    
    gl.enableVertexAttribArray(this.meshShader.attribute.position);
    gl.enableVertexAttribArray(this.meshShader.attribute.texture);
    
    var activeTexture = -1;
    
    for(var j in this.curPath.list) {
        var meshId = Math.abs(this.curPath.list[j]);
        var mesh = this.meshes[meshId]; 
        var offset = this.offsets[mesh.offset];
        
        // Meshes are sorted by texture, only re-bind when the texture changes
        if(mesh.offset != activeTexture) {
            activeTexture = mesh.offset;
            this.bindTexture(gl, this.meshShader, offset);
        }
        
        var indexOffset = offset.indexOffset + mesh.startIndex;
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, indexOffset * 2);
    }
}

RageMap.prototype.drawPath = function(gl, event, freelook) {
    if(!this.complete) { return; }
    
    //-----------------------------------------------
    // Render the path points as a white dashed trail
    gl.useProgram(this.pathWhiteShader);
				
    // Bind the matricies
    gl.uniformMatrix4fv(this.pathWhiteShader.uniform.modelViewMat, false, freelook ? event.modelViewMat : this.viewMat);
    gl.uniformMatrix4fv(this.pathWhiteShader.uniform.projectionMat, false, event.projectionMat);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pathBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    
    gl.enableVertexAttribArray(this.pathWhiteShader.attribute.position);

    // Setup the vertex buffer layout 
    gl.vertexAttribPointer(this.pathWhiteShader.attribute.position, 3, gl.FLOAT, false, 12, 0);
    
    // Draw Path
    gl.drawArrays(gl.LINES, 0, this.path.length);
    
    //-----------------------------------------------
    // Render the path orientations as a green vector
    gl.useProgram(this.pathGreenShader);
				
    // Bind the matricies
    gl.uniformMatrix4fv(this.pathGreenShader.uniform.modelViewMat, false, freelook ? event.modelViewMat : this.viewMat);
    gl.uniformMatrix4fv(this.pathGreenShader.uniform.projectionMat, false, event.projectionMat);
    
    gl.enableVertexAttribArray(this.pathGreenShader.attribute.position);

    // Setup the vertex buffer layout 
    gl.vertexAttribPointer(this.pathGreenShader.attribute.position, 3, gl.FLOAT, false, 12, 0);
    
    // Draw Look vectors
    gl.drawArrays(gl.LINES, this.path.length, this.path.length * 2);
}


