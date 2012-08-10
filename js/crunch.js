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
    "js/crn-O2.js"
], function () {

    // DXT formats, from:
    // http://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_s3tc/
    COMPRESSED_RGB_S3TC_DXT1_EXT  = 0x83F0;
    COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83F1;
    COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83F2;
    COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83F3;

    // Taken from crnlib.h
    CRN_FORMAT = {
        cCRNFmtInvalid: -1,

        cCRNFmtDXT1: 0,

        // cCRNFmtDXT3 is not currently supported when writing to CRN - only DDS.
        cCRNFmtDXT3: 1,

        cCRNFmtDXT5: 2,

        // Various DXT5 derivatives
        cCRNFmtDXT5_CCxY: 3,    // Luma-chroma
        cCRNFmtDXT5_xGxR: 4,    // Swizzled 2-component
        cCRNFmtDXT5_xGBR: 5,    // Swizzled 3-component
        cCRNFmtDXT5_AGBR: 6,    // Swizzled 4-component

        // ATI 3DC and X360 DXN
        cCRNFmtDXN_XY: 7,
        cCRNFmtDXN_YX: 8,

        // DXT5 alpha blocks only
        cCRNFmtDXT5A: 9
    };

    CRN_FORMAT_NAMES = {};
    for (var name in CRN_FORMAT) {
        CRN_FORMAT_NAMES[CRN_FORMAT[name]] = name;
    }

    DXT_FORMAT_MAP = {};
    DXT_FORMAT_MAP[CRN_FORMAT.cCRNFmtDXT1] = COMPRESSED_RGB_S3TC_DXT1_EXT;
    DXT_FORMAT_MAP[CRN_FORMAT.cCRNFmtDXT3] = COMPRESSED_RGBA_S3TC_DXT3_EXT;
    DXT_FORMAT_MAP[CRN_FORMAT.cCRNFmtDXT5] = COMPRESSED_RGBA_S3TC_DXT5_EXT;

    var dxtSupported = true;

    function arrayBufferCopy(src, dst, dstByteOffset, numBytes) {
        var i;
        var dst32Offset = dstByteOffset / 4;
        var tail = (numBytes % 4);
        var src32 = new Uint32Array(src.buffer, 0, (numBytes - tail) / 4);
        var dst32 = new Uint32Array(dst.buffer);
        for (i = 0; i < src32.length; i++) {
            dst32[dst32Offset + i] = src32[i];
        }
        for (i = numBytes - tail; i < numBytes; i++) {
            dst[dstByteOffset + i] = src[i];
        }
    }

    var dst = null;
    var dxtData = null;
    var cachedDstSize = 0;

    function uploadCRNLevels(gl, ext, arrayBuffer, texture, loadMipmaps) {
        var i;
        console.time("Decompress CRN");
        var srcSize = arrayBuffer.byteLength;
        var bytes = new Uint8Array(arrayBuffer);
        var src = Module._malloc(srcSize);
        arrayBufferCopy(bytes, Module.HEAPU8, src, srcSize);

        var format = Module._crn_get_dxt_format(src, srcSize);
        if (!DXT_FORMAT_MAP[format]) {
            console.error("Unsupported image format");
            console.timeEnd("Decompress CRN");
            return 0;
        }

        var width = Module._crn_get_width(src, srcSize);
        var height = Module._crn_get_height(src, srcSize);
        var levels = Module._crn_get_levels(src, srcSize);

        var dstSize = Module._crn_get_uncompressed_size(src, srcSize);
        if(cachedDstSize != dstSize) {
            console.log("Realloc dxt buffer:", dstSize);
            if(dst) { Module._free(dst); }
            dst = Module._malloc(dstSize);
            dxtData = new Uint8Array(Module.HEAPU8.buffer, dst, dstSize);
            cachedDstSize = dstSize;
        }

        Module._crn_decompress(src, srcSize, dst, dstSize);
        console.timeEnd("Decompress CRN");

        var internalFormat = DXT_FORMAT_MAP[format];

        gl.bindTexture(gl.TEXTURE_2D, texture);
        console.time("Upload CRN");
        gl.compressedTexImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, dxtData);
        console.timeEnd("Upload CRN");

        Module._free(src);
    }

    return {
        uploadCRNLevels: uploadCRNLevels
    };
});