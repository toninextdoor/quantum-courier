# Quantum Courier

A cooperative, asymmetric browser game for 2–4 players. Requires Node.js 20+.

## Run

```sh
npm install
npm start
```

Open http://localhost:3000 in separate tabs or devices. On your LAN, other devices open http://YOUR-COMPUTER-IP:3000. The host creates a room and shares its four-letter code. `PORT` can override port 3000.

## Play

1. Join in order: Navigator, Spotter, Driver, Pilot. The host launches the round.
2. Talk aloud or use a separate voice call. Navigator sees red hazards and moving drones; Spotter sees solid purple barriers, cyan pickup and green drop-off. Coordinates/grid are shared between map views.
3. Hold arrows, WASD or touch buttons to accelerate. Collect the parcel and bring it to the target for one point. Deliver as many as possible in 60 seconds.

With two players the Spotter also drives. With four, Driver and Pilot share steering (opposite inputs cancel). Driver/Pilot see a flight deck with coordinates instead of the arena. Barrier contact blocks movement. Red hazards reset the cart, return cargo, and deduct five seconds; brief spawn protection prevents repeated penalties. Host can replay after a round. If anyone disconnects mid-round, the crew returns to the lobby and roles are reassigned. Reconnecting players must rejoin using the code.

## Implementation

Express serves the local assets, including Socket.io's browser client. A 20 Hz fixed-step server simulates acceleration, drag, barriers, moving obstacles, pickups, deliveries and penalties. Server monotonic time owns the countdown. Snapshots are sent every 50 ms; clients interpolate cart drawing without deciding physics. Private map layers are omitted from other roles' snapshots. Steering input expires after 350 ms without updates. Names are rendered as text, and room actions, capacity and input privileges are validated server-side.

Rooms are in memory, on one Node process, and disappear when empty or the server restarts. Public deployment requires a Node host supporting long-lived WebSockets; use HTTPS via your host/reverse proxy. No accounts, voice service, persistence or distributed room coordination are included.

## Verify

```sh
npm test
```

The integration test connects six real Socket.io clients and checks room capacity, host permissions, view isolation, input authority, stale-input expiration, pickup/delivery, hazard penalties, round ending, replay, disconnect cleanup and two-player steering.
