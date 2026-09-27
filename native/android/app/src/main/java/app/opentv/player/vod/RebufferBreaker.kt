/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

/**
 * Counts VOD rebuffers inside a short window. Once it trips, callers stop the
 * stall-recover-stall loop and offer another server instead of retrying harder.
 */
class RebufferBreaker(
    private val windowMs: Long = VodPlaybackTuning.REBUFFER_WINDOW_MS,
    private val tripCount: Int = VodPlaybackTuning.REBUFFER_TRIP_COUNT,
) {
    private val stamps = ArrayDeque<Long>()
    var tripped: Boolean = false
        private set

    /** @return true when this event is the one that opens the breaker. */
    fun onRebuffer(nowMs: Long): Boolean {
        if (tripped) return false
        val cutoff = nowMs - windowMs
        while (stamps.isNotEmpty() && stamps.first() < cutoff) stamps.removeFirst()
        stamps.addLast(nowMs)
        if (stamps.size >= tripCount) {
            tripped = true
            return true
        }
        return false
    }

    fun countInWindow(nowMs: Long): Int {
        val cutoff = nowMs - windowMs
        return stamps.count { it >= cutoff }
    }

    fun reset() {
        stamps.clear()
        tripped = false
    }
}
