/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.data.parser

/**
 * Favourites sorted by the most recent watch. Titles never opened sink to the end, then by name.
 */
object FavouriteWatchOrder {

    fun <T> sort(
        items: List<T>,
        lastWatchedMillis: (T) -> Long,
        name: (T) -> String,
    ): List<T> = items.sortedWith(
        compareByDescending<T> { lastWatchedMillis(it) }
            .thenBy { name(it).lowercase() },
    )
}
