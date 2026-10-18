/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.ui.vod

/**
 * Where a category or favourites grid was scrolled when the user opened a title.
 * Kept on the ViewModel so Back can rebuild the grid at the same row instead of the top.
 */
internal data class GridAnchor(val key: String, val index: Int, val offset: Int)

/** The saved anchor only applies to the browse surface it was captured on. */
internal fun matchingAnchor(saved: GridAnchor?, key: String): GridAnchor? =
    saved?.takeIf { it.key == key && it.index >= 0 }

/**
 * While a return target is set, only that card may take focus. Everything else
 * (search, chips, the posters above the one that was opened) stays unfocusable
 * so the d-pad cannot land on the top bar before the poster is back.
 */
internal fun cardCanFocus(blockedExcept: Long?, itemId: Long): Boolean =
    blockedExcept == null || blockedExcept == itemId

internal fun isMovieResume(mediaKey: String): Boolean = mediaKey.startsWith("movie:")

internal fun isEpisodeResume(mediaKey: String): Boolean = mediaKey.startsWith("ep:")
