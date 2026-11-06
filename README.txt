GORILLAS 3D & VR - MULTIPLAYER VOICE & MOVEMENT UPDATE
======================================================

KEY FIXES IN THIS BUILD:
1. FIXED VOICE CHAT BETWEEN QUEST AND PC:
   - Modern browsers block incoming audio streams until an explicit user gesture occurs.
   - Now, clicking either 'PLAY IN BROWSER' or 'ENTER VR' directly awakens and unlocks an AudioContext pipeline.
   - The remote incoming stream is routed through both HTML5 audio and the Web Audio API output destination.
   - Status indicators dynamically confirm: "🔊 Voice Connected (Hearing Opponent)" and "🟢 Mic Ready (Transmitting)".

2. PROMINENT GUI TURN BANNER & 3D BILLBOARD:
   - Added a high-contrast top-center neon banner:
     "CURRENT TURN: PLAYER 1 (RED GORILLA) - 👉 YOUR TURN (AIM & MOVE) 👈"
     or "CURRENT TURN: PLAYER 2 (BLUE GORILLA) - ⏳ OPPONENT'S TURN (WAITING...)"
   - Includes real-time 30s countdown, wind vector arrow, and remaining movement stamina.
   - Also placed a huge retro 3D holographic billboard suspended between skyscrapers so both players see the active turn inside VR.

3. ACTIVE PLAYER ROOFTOP MOVEMENT:
   - On Meta Quest: Move with the Touch Controller thumbsticks (`axes[2]` & `axes[3]`).
   - On PC / Browser: Move with `W, A, S, D` or `Arrow Keys`.
   - Bounded by rooftop dimensions (3.5 meters) with a live Movement Fuel Gauge that recharges at the start of each turn.
   - Inactive players are frozen during the opponent's turn.

HOW TO RUN:
-----------
Run with HTTPS (required for WebXR and microphone):
1. python -m http.server 8000
2. npx cloudflared tunnel --url http://localhost:8000
3. Open on PC, click 'PLAY IN BROWSER'. Click 'COPY LINK' and open on Quest, then click 'ENTER VR'.
