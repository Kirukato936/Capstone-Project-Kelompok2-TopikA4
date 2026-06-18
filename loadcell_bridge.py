import serial
import requests
import re

# COM port ESP32
ser = serial.Serial('COM5', 115200)

# URL backend dashboard
API_URL = "http://localhost:3001/api/sensor/weight"

print("Menunggu data dari ESP32...")

while True:
    line = ser.readline().decode('utf-8').strip()

    print(line)

    if "FINAL_WEIGHT:" in line:

        match = re.search(r"FINAL_WEIGHT:(\d+\.?\d*)", line)

        if match:

            weight = float(match.group(1))

            payload = {
                "weight": weight,
                "stable": True
            }

            try:
                response = requests.post(
                    API_URL,
                    json=payload,
                    timeout=5
                )

                print(
                    f"[DASHBOARD] Berat {weight} g dikirim "
                    f"(status {response.status_code})"
                )

            except Exception as e:
                print(f"[ERROR] {e}")