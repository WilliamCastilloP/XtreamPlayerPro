/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

import app.opentv.data.model.PlaybackPosition

/**
 * How far a title has been watched, for bars on detail pages and the continue-watching shelf.
 * Finished watches draw as a full bar. No mark, or a mark with no duration, stays blank.
 */
object WatchProgress {

    fun fraction(position: PlaybackPosition): Float? =
        fraction(position.positionMillis, position.durationMillis, position.isFinished)

    fun fraction(positionMillis: Long, durationMillis: Long, finished: Boolean): Float? {
        if (durationMillis <= 0L || positionMillis <= 0L) return null
        if (finished) return 1f
        return (positionMillis.toFloat() / durationMillis).coerceIn(0f, 1f)
    }
}
