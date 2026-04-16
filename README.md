# RoboMaze — Autonomous Maze-Solving Robot

**ECNG 4504 — Embedded Systems for Wireless Communications**  
AUC Spring 2026 | Team 2

---

## Team Members

| Name | Student ID | Email |
|---|---|---|
| Sameh Ahmed | 900211681 | samehahmedhakim@aucegypt.edu |
| Hamza El Meadawy | 900211560 | hamzaelmeadwy@aucegypt.edu |
| Mariam Moataz | 900213249 | mariammoataz@aucegypt.edu |
| Menna AbdelHamed | 900212035 | mennnaa12@aucegypt.edu |

---

## Project Overview

RoboMaze is a fully autonomous maze-solving robot built on the ESP32 microcontroller. It uses a 5-sensor infrared array to follow black lines and navigate a maze autonomously across four sequential runs with no human intervention after the initial start command:

1. **LHR (Run 1)** — Explores the maze using the Left-Hand Rule, recording all junctions and decisions
2. **Back (Run 2)** — Returns to start along a simplified reverse path
3. **Run 2 (Run 3)** — Re-navigates the maze on the shortest discovered path using Manhattan distance heuristic
4. **Back 2 (Run 4)** — Returns to start along the optimized path

A live web application visualizes the maze map in real time and allows full wireless control via WiFi or Bluetooth BLE.

---

## Repository Structure

RoboMaze/
├── Firmware/           # ESP32 C++ source code (PlatformIO + Arduino)
├── Hardware(KiCad)/    # KiCad hardware schematic
├── Webapp/             # React + TypeScript web application
└── Docs/               # Architecture diagrams, contribution docs, team details

---

## Hardware

| Component | Model | Role |
|---|---|---|
| Microcontroller | ESP32 DevKit V1 | Main compute, WiFi 802.11, BLE 4.2 |
| IR Sensors | TCRT5000 × 5 | Line detection array |
| Motor Driver | L298N | Dual H-bridge PWM motor control |
| DC Motors | 25GA370 130RPM × 2 | Differential drive |
| Wheel Encoders | Hall-effect × 2 | Corridor distance measurement |

---

## Firmware

**Platform:** PlatformIO + Arduino Framework  
**Language:** C++  

Key features:
- Left-Hand Rule maze exploration with junction recording
- Triplet path simplification algorithm
- Run 2 Manhattan distance navigation with axis-priority selection
- WebSocket server on port 81 with full JSON telemetry protocol
- BLE GATT server with TX notify and RX write characteristics
- Encoder-based corridor distance measurement with auto-calibration

```ini
lib_deps =
    links2004/WebSockets@^2.4.0
    bblanchon/ArduinoJson@^6.21.0
board_build.partitions = huge_app.csv
```

---

## Web Application

**Stack:** React + TypeScript + Vite (frontend), Express (backend)  
**URL:** robomaze.net

Features:
- Live maze map with proportional corridor rendering
- Real-time sensor display and robot state indicator
- Full robot control panel (start, back, run2, back2, pause, e-stop)
- WiFi mode: direct browser → `ws://172.20.10.9:81`
- BLE mode: Web Bluetooth API (Chrome desktop)

---

## Wireless Communication

| Channel | Details |
|---|---|
| WiFi | Static IP 172.20.10.9 · WebSocket port 81 |
| BLE | Device: RoboMaze · Service UUID: 12345678-1234-1234-1234-123456789abc |
| Telnet | Port 23 · Raw log streaming |
