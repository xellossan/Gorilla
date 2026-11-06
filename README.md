# 🦍 VR Gorillas 3D (1v1 Banana Blitz) - v6 Update

### 🆕 What Was Fixed in v6:
1. **Immediate Turn Switch on Depleted Bananas:**
   - As soon as either player throws their last banana, the turn ends immediately without waiting for the countdown timer to finish.
   - The countdown instantly resets back to the configured start setting (default: 30s) and starts fresh for the next player.
2. **Eliminated Desynced / Multiple Countdowns:**
   - Replaced independent local client intervals with an **authoritative host clock architecture**.
   - Only the Host runs the master countdown loop and broadcasts `TIMER_TICK` packets every second.
   - The guest player's HUD mirrors this authoritative clock, completely eliminating conflicting, overlapping, or multi-speed countdowns between players.
