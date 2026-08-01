import json

with open('public/assets/maps/town.json') as f:
    data = json.load(f)

print(f'Layers: {len(data["layers"])}')
for i, layer in enumerate(data['layers']):
    gids = sorted(set(g for g in layer['data'] if g > 0))
    print(f'  Layer {i}: name="{layer.get("name","?")}" type={layer["type"]} gids={gids}')

print()
print('=== FARM ===')
with open('public/assets/maps/farm.json') as f:
    data = json.load(f)
for i, layer in enumerate(data['layers']):
    gids = sorted(set(g for g in layer['data'] if g > 0))
    print(f'  Layer {i}: name="{layer.get("name","?")}" type={layer["type"]} gids={gids}')