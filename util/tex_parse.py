# When you call this script, pass the path to one of the .iosTex files 
# as the only argument on the command line. Must have the PVRtoJPG executable
# in the same directory.

import sys, os

path = sys.argv[1]

print 'Opening:', path

f = open(path, 'r')

try:
    os.makedirs(path + '_parsed')
except:
    pass

i = 0
while True:
    atlas = f.read(327680)
    
    if len(atlas) == 0:
        break
    
    print 'Writing', i
     
    o = open(path + '_parsed/' + str(i) + '.pvr', 'wb')
    
    # Write out the header (same for each file)
    o.write("\x34\x00\x00\x00\x00\x04\x00\x00\x00\x04\x00\x00\x00\x00\x00\x00")
    o.write("\x18\x02\x01\x00\x00\x00\x04\x00\x02\x00\x00\x00\x00\x00\x00\x00")
    o.write("\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x50\x56\x52\x21")
    o.write("\x01\x00\x00\x00")
    o.write(atlas)
    o.close()
    os.system('./PVRtoJPG "' + path + '_parsed/' + str(i) + '.pvr" "' + path + '_parsed/' + str(i) + '.jpg"')
    i += 1
    
f.close()


