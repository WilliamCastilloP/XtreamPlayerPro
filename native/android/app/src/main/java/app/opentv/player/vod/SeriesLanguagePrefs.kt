/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

import android.content.Context

/**
 * Audio and subtitle choice for one series. SharedPreferences, not Room: a missing migration
 * would wipe favourites, and this is a preference rather than catalogue data.
 *
 * Keyed by provider and series, so two panels that share a series id do not overwrite each
 * other, and a movie (no series) is never stored.
 */
class SeriesLanguagePrefs(context: Context) {

    private val prefs =
        context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    data class Key(val sourceId: Long, val seriesId: String) {
        fun pref(): String = "series:$sourceId:$seriesId"
    }

    data class Choice(val audio: String?, val text: String?)

    fun read(key: Key): Choice {
        val base = key.pref()
        return Choice(
            audio = prefs.getString("$base:audio", null),
            text = prefs.getString("$base:text", null),
        )
    }

    fun saveAudio(key: Key, token: String) {
        prefs.edit().putString("${key.pref()}:audio", token).apply()
    }

    fun saveText(key: Key, token: String) {
        prefs.edit().putString("${key.pref()}:text", token).apply()
    }

    private companion object {
        const val FILE = "opentv_series_language"
    }
}
