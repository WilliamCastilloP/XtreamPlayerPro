/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.data.parser

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * The year of the newest season or episode inside one `get_series_info` payload.
 *
 * Xtream puts that date on `seasons[].air_date` and on each episode's `info.releasedate`.
 * The series `year` / `releaseDate` is the premiere and is intentionally ignored here, so a
 * 2025 show with a 2026 season stays 2025 as its premiere and 2026 as its content year.
 */
object SeriesContentYear {

    private val YEAR = Regex("""\b(19|20)\d{2}\b""")
    private val DATE_KEYS = listOf("air_date", "airdate", "releaseDate", "release_date", "releasedate")

    /** Newest season/episode year in [body], or null when the panel sent no dates. */
    fun latest(body: JsonElement?): Int? {
        val root = body as? JsonObject ?: return null
        val years = ArrayList<Int>(8)
        when (val seasons = root["seasons"]) {
            is JsonArray -> seasons.forEach { readDates(it as? JsonObject, years) }
            else -> Unit
        }
        when (val episodes = root["episodes"]) {
            is JsonObject -> episodes.values.forEach { readBucket(it, years) }
            is JsonArray -> episodes.forEach { readBucket(it, years) }
            else -> Unit
        }
        return years.maxOrNull()
    }

    /**
     * True when a later year of episodes exists than the show's premiere year.
     * A show that premiered in the content year is not "new episodes".
     */
    fun hasNewEpisodes(premiereYear: Int?, contentYear: Int?): Boolean {
        val premiere = premiereYear?.takeIf { it >= 1900 } ?: return false
        val content = contentYear?.takeIf { it >= 1900 } ?: return false
        return content > premiere
    }

    /** Year used to file the show: the newer of the premiere and the latest season. */
    fun sortYear(premiereYear: Int?, contentYear: Int?): Int? =
        listOfNotNull(premiereYear?.takeIf { it >= 1900 }, contentYear?.takeIf { it >= 1900 }).maxOrNull()

    private fun readBucket(bucket: JsonElement, years: MutableList<Int>) {
        when (bucket) {
            is JsonArray -> bucket.forEach { readEpisode(it as? JsonObject, years) }
            is JsonObject -> readEpisode(bucket, years)
            else -> Unit
        }
    }

    private fun readEpisode(episode: JsonObject?, years: MutableList<Int>) {
        if (episode == null) return
        readDates(episode, years)
        readDates(episode["info"] as? JsonObject, years)
    }

    private fun readDates(obj: JsonObject?, years: MutableList<Int>) {
        if (obj == null) return
        for (key in DATE_KEYS) {
            val text = (obj[key] as? JsonPrimitive)?.contentOrNull ?: continue
            YEAR.find(text)?.value?.toIntOrNull()?.let { years += it }
        }
    }
}
