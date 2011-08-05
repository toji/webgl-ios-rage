//
//  main.cpp
//  PVRtoJPG
//
//  Created by Brandon Jones on 5/10/11.
//  Copyright 2011. All rights reserved.
//

// This is a REALLY messy console app that will take a single PVR texture and create a JPG copy
// I really wouldn't recommend using it for any sort of professional work.

#include <iostream>

// Get from http://www.ijg.org/
#include "jpeg-8c/jpeglib.h"

// Get from http://www.imgtec.com/powervr/insider/powervr-pvrtexlib.asp
#include <PVRTexLib.h>
using namespace pvrtexlib;

void writeJPEG(const char* filename, CPVRTexture& texture) {
    jpeg_compress_struct cinfo;
    jpeg_error_mgr jerr;

    FILE* outfile;		/* target file */
    JSAMPROW row_pointer[1];	/* pointer to JSAMPLE row[s] */
    int row_stride;		/* physical row width in image buffer */

    /* Step 1: Initialize the JPEG compression object. */
    cinfo.err = jpeg_std_error(&jerr);
    jpeg_create_compress(&cinfo);

    /* Step 2: specify data destination (eg, a file) */
    if ((outfile = fopen(filename, "wb")) == NULL) {
       fprintf(stderr, "can't open %s\n", filename);
       exit(1);
    }
    jpeg_stdio_dest(&cinfo, outfile);

    /* Step 3: set parameters for compression */

    /* First we supply a description of the input image.
    * Four fields of the cinfo struct must be filled in:
    */
    cinfo.image_width = texture.getWidth(); 	/* image width and height, in pixels */
    cinfo.image_height = texture.getHeight();
    cinfo.input_components = 3;		/* # of color components per pixel */
    cinfo.in_color_space = JCS_RGB; 	/* colorspace of input image */
    /* Now use the library's routine to set default compression parameters.
    * (You must set at least cinfo.in_color_space before calling this,
    * since the defaults depend on the source color space.)
    */
    jpeg_set_defaults(&cinfo);
    /* Now you can set any non-default parameters you wish to.
    * Here we just illustrate the use of quality (quantization table) scaling:
    */
    jpeg_set_quality(&cinfo, 90, TRUE /* limit to baseline-JPEG values */);

    /* Step 4: Start compressor */

    /* TRUE ensures that we will write a complete interchange-JPEG file.
    * Pass TRUE unless you are very sure of what you're doing.
    */
    jpeg_start_compress(&cinfo, TRUE);

    /* Step 5: while (scan lines remain to be written) */
    /*           jpeg_write_scanlines(...); */

    /* Here we use the library's state variable cinfo.next_scanline as the
    * loop counter, so that we don't have to keep track ourselves.
    * To keep things simple, we pass one scanline per call; you can pass
    * more if you wish, though.
    */
    row_stride = texture.getWidth() * 4;	/* JSAMPLEs per row in image_buffer */\
    
    uint8* image_buffer = texture.getSurfaceData(0);
    
    uint8 row_buffer[1024*3];
    
    while (cinfo.next_scanline < cinfo.image_height) {
       
        for(int i = 0, j = 0; i < row_stride; ++i) {
            int row_offset = cinfo.next_scanline * row_stride;
            row_buffer[j++] = image_buffer[row_offset + i++];
            row_buffer[j++] = image_buffer[row_offset + i++];
            row_buffer[j++] = image_buffer[row_offset + i++];
        }
        
       row_pointer[0] = row_buffer;
       (void) jpeg_write_scanlines(&cinfo, row_pointer, 1);
    }

    /* Step 6: Finish compression */

    jpeg_finish_compress(&cinfo);
    /* After finish_compress, we can close the output file. */
    fclose(outfile);

    /* Step 7: release JPEG compression object */

    /* This is an important step since it will release a good deal of memory. */
    jpeg_destroy_compress(&cinfo);

    /* And we're done! */
}

int main (int argc, const char *argv[])
{
    PVRTRY {
        // get the utilities instance
        PVRTextureUtilities sPVRU = PVRTextureUtilities();
        // open and reads a pvr texture from the file location specified by strFilePath
        CPVRTexture sOriginalTexture(argv[1]);
        // declare an empty texture to decompress into
        CPVRTexture sDecompressedTexture;
        // decompress the compressed texture into this texture
        sPVRU.DecompressPVR(sOriginalTexture, sDecompressedTexture);
        
        writeJPEG(argv[2], sDecompressedTexture);
    } PVRCATCH(myException) {
        // handle any exceptions here
        printf("Exception in example 1: %s \n",myException.what());
        return 1;
    }
    
    return 0;
}

