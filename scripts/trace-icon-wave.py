#!/usr/bin/env python3
"""Trace the cyan wave from the original concept into a native SVG path."""
from pathlib import Path
from PIL import Image
import json
import math
import re

ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'output/icon-concepts/sun-cloud.png'
im=Image.open(source).convert('RGB')
# Analyze original pixels; only the lower cyan component is the wave.
mask={(x,y) for y in range(800,im.height) for x in range(im.width)
      if (lambda c:c[0]<80 and c[1]>110 and c[2]>110)(im.getpixel((x,y)))}
edges={}
for x,y in mask:
 for neighbor,a,b in [((x,y-1),(x,y),(x+1,y)),((x+1,y),(x+1,y),(x+1,y+1)),
                      ((x,y+1),(x+1,y+1),(x,y+1)),((x-1,y),(x,y+1),(x,y))]:
  if neighbor not in mask:edges.setdefault(a,[]).append(b)
loops=[]
while edges:
 start=next(iter(edges));point=start;loop=[point]
 while True:
  candidates=edges[point];next_point=candidates.pop()
  if not candidates:del edges[point]
  point=next_point;loop.append(point)
  if point==start:break
 loops.append(loop)
def area(loop):return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(loop,loop[1:])))
contour=max(loops,key=area)
def distance(point,a,b):
 dx=b[0]-a[0];dy=b[1]-a[1]
 if dx==dy==0:return math.dist(point,a)
 t=max(0,min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy)))
 return math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy)
def simplify(points,tolerance=.75):
 if len(points)<3:return points
 distances=[distance(p,points[0],points[-1]) for p in points[1:-1]]
 furthest=max(distances,default=0)
 if furthest<=tolerance:return [points[0],points[-1]]
 index=distances.index(furthest)+1
 return simplify(points[:index+1],tolerance)[:-1]+simplify(points[index:],tolerance)
points=simplify(contour)
xmin=min(x for x,y in contour);xmax=max(x for x,y in contour);ymin=min(y for x,y in contour)
scale=650/(xmax-xmin)
# Restore the original width and increase the wave height by 25%.
coords=[(185+(x-xmin)*scale,705+(y-ymin)*scale*1.25) for x,y in points]
path='M'+' L'.join(f'{x:.3f},{y:.3f}' for x,y in coords)+' Z'
p=ROOT/'assets/branding/kairo-icon.svg'
s=p.read_text();s=re.sub(r'(<path id="wave" d=")[^"]+',lambda m:m[1]+path,s);p.write_text(s)
(ROOT/'assets/branding/wave-source.json').write_text(json.dumps({'source':'output/icon-concepts/sun-cloud.png','method':'cyan-component boundary trace','source_pixel_bounds':[xmin,ymin,xmax,max(y for x,y in contour)],'maximum_simplification_error_source_pixels':.75,'trace_points':len(coords),'scale':'original width retained; height increased by 25%','horizontal_stretch':1.0,'vertical_stretch':1.25,'top_offset_from_original':-33},indent=2)+'\n')
print(f'Traced actual original wave: {len(contour)} boundary points -> {len(coords)} vector points.')
