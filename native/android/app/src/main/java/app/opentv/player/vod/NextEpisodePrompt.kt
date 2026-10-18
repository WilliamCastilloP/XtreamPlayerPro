/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

/** When the on-screen "next episode" control should come forward on its own. */
internal object NextEpisodePrompt {
    const val WINDOW_MS = 60_000L

    fun remainingInWindow(durationMs: Long, positionMs: Long): Boolean {
        if (durationMs <= 0L) return false
        val remaining = durationMs - positionMs
        return remaining in 1L..WINDOW_MS
    }
}
