# Room 905 v3.5.0 · Flux Faults and Sentinel automaton

Upload full contents of room-905-v3.5.0.zip to repository root, preserving public. Render npm ci / npm start; existing account/database configuration unchanged. Verify /health reports 3.5.0 and reload all players.

Signal gaps become EM Flux Faults: damaged power circuits generate sensor-disrupting electromagnetic fields. Navigator sees blue circuit fields with EMF identifiers. Guardian and Recovery still do not receive field locations. Player reset and difficulty penalties are preserved.

Sentinel now shares that hazard: entering a field forces a 4-second reboot, with no movement or player resets. Staying in the same field does not extend the reboot; the field rearms for that robot after it leaves. A new field can disrupt it again. Guardian pulse cannot shorten a longer field reboot. Robot disruption does not subtract crew time. Coordinate Navigator directions and Guardian tracking to lure it into a field.

Replaced the beacon/vacuum-like model with an original biped security automaton: articulated arms and legs, industrial torso, scanner head, antenna and status optics. Walking animates; optics turn blue while disabled. No weapons, injuries or graphic effects are added. Help and briefing terminology updated.

Server authority and private role views are covered by tests; robot proportions/animation and field visuals need an in-browser playtest.
