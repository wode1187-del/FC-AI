# -*- coding: utf-8 -*-
# 检查 JPEG 是否带 ICC 色彩配置文件（APP2 ICC_PROFILE 或 EXIF 色彩空间）
import struct, sys

def check_jpeg(path):
    data = open(path, 'rb').read()
    if data[:2] != b'\xff\xd8':
        return 'NOT_JPEG'
    pos = 2
    found = []
    while pos < len(data) - 4:
        if data[pos] != 0xFF:
            pos += 1
            continue
        marker = data[pos+1]
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            pos += 2
            continue
        seg_len = struct.unpack('>H', data[pos+2:pos+4])[0]
        if seg_len < 2:
            break
        seg = data[pos+4:pos+2+seg_len]
        if marker == 0xE2 and seg.startswith(b'ICC_PROFILE'):
            found.append(('ICC_PROFILE_APP2', seg_len))
        if marker == 0xE1 and seg.startswith(b'Exif'):
            # 粗略找 Exif 里的 ColorSpace (tag 0xA001) 和 Interop
            if b'\x01\x00\x00' in seg:
                found.append(('EXIF', seg_len))
        if marker == 0xEE:
            found.append(('Adobe_APP14', seg_len))
        pos += 2 + seg_len
    return found

if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(p, '->', check_jpeg(p))
