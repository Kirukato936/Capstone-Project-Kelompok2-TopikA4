from ultralytics import YOLO
import json
import sys

model = YOLO("model/best.pt")

image_path = sys.argv[1]

results = model(image_path)

count = 0

for r in results:
    count += len(r.boxes)

print(json.dumps({
    "count": count
}))