#!/usr/bin/env python3
"""Generate Android launcher assets from the verified Cyprus SVG artwork."""
import math
import subprocess
import tempfile
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / 'android/app/src/main/res'
NS = '{http://www.w3.org/2000/svg}'
art = ET.parse(ROOT / 'assets/branding/kairo-icon.svg').getroot()
coast = art.find(NS + 'path').attrib['d']
sun = art.find(NS + 'circle').attrib
background = art.find(NS + 'rect').attrib['fill']
scale = .64
cx, cy, r = (float(sun[k]) for k in ('cx', 'cy', 'r'))
sun_path = f'M {cx-r},{cy} a {r},{r} 0 1,0 {2*r},0 a {r},{r} 0 1,0 {-2*r},0'
paths=art.findall(NS+'path')
vector_paths='\n'.join(f'<path android:fillColor="{item.attrib["fill"]}" android:pathData="{item.attrib["d"]}"/>' for item in paths)
vector = f'''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
 android:width="108dp" android:height="108dp" android:viewportWidth="1024" android:viewportHeight="1024">
 <group android:pivotX="512" android:pivotY="512" android:scaleX="{scale}" android:scaleY="{scale}">
  <path android:fillColor="{sun['fill']}" android:pathData="{sun_path}"/>
  {vector_paths}
 </group>
</vector>
'''
(RES/'drawable-v24/ic_launcher_foreground.xml').write_text(vector)
(RES/'values/ic_launcher_background.xml').write_text(f'<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">{background}</color></resources>\n')
(RES/'drawable/ic_launcher_background.xml').write_text(f'<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="{background}"/></shape>\n')
for name in ('ic_launcher', 'ic_launcher_round'):
 (RES/f'mipmap-anydpi-v26/{name}.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
 <background android:drawable="@color/ic_launcher_background"/>
 <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
''')

def svg(factor, fill_background=False, round_mask=False):
 shapes=f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{sun["fill"]}"/>'+''.join(ET.tostring(item,encoding='unicode') for item in paths)
 content=(f'<rect width="1024" height="1024" fill="{background}"/>' if fill_background else '')+f'<g transform="translate(512 512) scale({factor}) translate(-512 -512)">{shapes}</g>'
 mask='<defs><clipPath id="round"><circle cx="512" cy="512" r="512"/></clipPath></defs>' if round_mask else ''
 if round_mask:content=f'<g clip-path="url(#round)">{content}</g>'
 return f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">{mask}{content}</svg>'

def render(source, output, size):
 subprocess.run(['rsvg-convert','-w',str(size),'-h',str(size),str(source),'-o',str(output)],check=True)

with tempfile.TemporaryDirectory(prefix='kairo-icons-') as scratch:
 folder=Path(scratch)
 for name, content in [('legacy',svg(scale*1.5,True)),('round',svg(scale*1.5,True,True)),('foreground',svg(scale))]:
  (folder/f'{name}.svg').write_text(content)
 for density, pixels, foreground_pixels in [('mdpi',48,108),('hdpi',72,162),('xhdpi',96,216),('xxhdpi',144,324),('xxxhdpi',192,432)]:
  target=RES/f'mipmap-{density}'
  render(folder/'legacy.svg',target/'ic_launcher.png',pixels)
  render(folder/'round.svg',target/'ic_launcher_round.png',pixels)
  render(folder/'foreground.svg',target/'ic_launcher_foreground.png',foreground_pixels)
 preview=ROOT/'output/icon-concepts/kairo-launcher-round-preview.png'
 render(folder/'round.svg',preview,512)
# Android adaptive foreground safe circle is 66dp within the 108dp viewport.
import re
points=[tuple(map(float,m)) for item in paths for m in re.findall(r'([-\d.]+),([-\d.]+)',item.attrib['d'])]
furthest=max(math.hypot(x-512,y-512)*scale for x,y in points)
sun_extent=(math.hypot(cx-512,cy-512)+r)*scale
safe_radius=1024*33/108
assert max(furthest,sun_extent)<safe_radius
print(f'Generated all launcher densities. Artwork radius {max(furthest,sun_extent):.1f}px < safe radius {safe_radius:.1f}px.')
