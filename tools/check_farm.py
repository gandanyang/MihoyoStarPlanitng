import json

with open('public/assets/maps/farm.json') as f:
    data = json.load(f)

w = data['width']
h = data['height']

for li, layer in enumerate(data['layers']):
    d = layer['data']
    print(f'=== Layer {li}: {layer.get("name","?")} ===')
    for y in range(h):
        row = []
        for x in range(w):
            gid = d[y * w + x]
            if gid == 0:
                row.append('.')
            else:
                row.append(str(gid))
        print(''.join(row))
    print()