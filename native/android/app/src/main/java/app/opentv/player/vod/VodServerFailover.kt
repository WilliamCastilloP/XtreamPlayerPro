/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

/**
 * One playable URL for the same title: a quality file on the panel, or an add-on stream.
 * Xtream usually exposes a single host; extra rows appear when the catalogue has HD/SD copies
 * or the viewer already loaded add-on streams.
 */
data class VodServerOption(
    val label: String,
    val url: String,
)

/**
 * Add-on URLs the detail page already resolved, handed to the player for failover.
 * Cleared when that player leaves. Not used by Live TV.
 */
object VodPlaybackExtras {
    @Volatile
    var options: List<VodServerOption> = emptyList()
}

object VodServerFailover {

    /**
     * Next URL that has not been tried, skipping the one currently playing.
     * Order is the order of [options] (best quality first when they came from the catalogue).
     */
    fun next(
        currentUrl: String,
        options: List<VodServerOption>,
        triedUrls: Set<String>,
    ): VodServerOption? {
        val blocked = triedUrls + currentUrl
        return options.firstOrNull { it.url.isNotBlank() && it.url !in blocked }
    }
}
