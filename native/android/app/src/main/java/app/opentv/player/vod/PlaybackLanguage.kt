/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

import java.util.Locale

/**
 * Remembers an audio or subtitle choice across episodes of one series.
 *
 * A panel often stamps the same language as `es` on one episode and `spa` on the next, and
 * sometimes only puts the language in the track label. Matching is on the language family, then
 * on the label when the file has no language code. Nothing here talks to the player, so a choice
 * can be decided before a track is selected.
 */
object PlaybackLanguage {

    const val OFF = "off"

    data class ListedTrack(
        val groupIndex: Int,
        val trackIndex: Int,
        val language: String?,
        val label: String?,
        val selected: Boolean,
    )

    sealed class Action {
        data object None : Action()
        data object DisableText : Action()
        data class Select(val groupIndex: Int, val trackIndex: Int) : Action()
    }

    /** A token worth storing, or null when the track has nothing we could recognise later. */
    fun token(language: String?, label: String?): String? {
        family(language)?.let { return "lang:$it" }
        val name = label?.trim()?.lowercase(Locale.ROOT)?.takeIf { it.isNotEmpty() } ?: return null
        return "label:$name"
    }

    fun textAction(stored: String?, tracks: List<ListedTrack>): Action {
        if (stored.isNullOrBlank()) return Action.None
        if (stored == OFF) {
            return if (tracks.any { it.selected }) Action.DisableText else Action.None
        }
        return selectIfNeeded(stored, tracks)
    }

    fun audioAction(stored: String?, tracks: List<ListedTrack>): Action {
        if (stored.isNullOrBlank() || stored == OFF) return Action.None
        return selectIfNeeded(stored, tracks)
    }

    private fun selectIfNeeded(stored: String, tracks: List<ListedTrack>): Action {
        val match = tracks.firstOrNull { matches(stored, it.language, it.label) } ?: return Action.None
        return if (match.selected) Action.None else Action.Select(match.groupIndex, match.trackIndex)
    }

    fun matches(stored: String, language: String?, label: String?): Boolean {
        if (stored == OFF || stored.isBlank()) return false
        if (stored.startsWith("lang:")) {
            val want = stored.removePrefix("lang:")
            val have = family(language)
            if (have != null) return have == want
            return labelMentions(want, label)
        }
        if (stored.startsWith("label:")) {
            val want = stored.removePrefix("label:")
            return !label.isNullOrBlank() && label.trim().lowercase(Locale.ROOT) == want
        }
        return false
    }

    /** ISO 639-1 family, so `es`, `spa` and `es-MX` are the same choice. */
    fun family(code: String?): String? {
        if (code.isNullOrBlank()) return null
        val primary = code.trim().lowercase(Locale.ROOT)
            .substringBefore('-')
            .substringBefore('_')
        if (primary.isEmpty() || primary in NON_LANGUAGES) return null
        return when (primary.length) {
            2 -> primary
            3 -> ISO3[primary] ?: primary
            else -> null
        }
    }

    private fun labelMentions(family: String, label: String?): Boolean {
        if (label.isNullOrBlank()) return false
        val names = LABEL_NAMES[family] ?: return false
        val tokens = label.lowercase(Locale.ROOT)
            .split(Regex("[^\\p{L}\\p{N}]+"))
            .filter { it.isNotEmpty() }
        return names.any { name -> tokens.any { it == name } }
    }

    private val NON_LANGUAGES = setOf("und", "undetermined", "zxx", "mul", "mis")

    private val ISO3 = mapOf(
        "spa" to "es",
        "eng" to "en",
        "por" to "pt",
        "fra" to "fr",
        "fre" to "fr",
        "deu" to "de",
        "ger" to "de",
        "ita" to "it",
        "jpn" to "ja",
        "kor" to "ko",
        "zho" to "zh",
        "chi" to "zh",
        "cmn" to "zh",
        "yue" to "zh",
        "ara" to "ar",
        "rus" to "ru",
        "nld" to "nl",
        "dut" to "nl",
        "pol" to "pl",
        "tur" to "tr",
        "hin" to "hi",
        "tha" to "th",
        "vie" to "vi",
        "swe" to "sv",
        "dan" to "da",
        "nor" to "no",
        "nob" to "no",
        "nno" to "no",
        "fin" to "fi",
        "ell" to "el",
        "gre" to "el",
        "heb" to "he",
        "ind" to "id",
        "ces" to "cs",
        "cze" to "cs",
        "hun" to "hu",
        "ron" to "ro",
        "rum" to "ro",
        "ukr" to "uk",
        "cat" to "ca",
        "glg" to "gl",
        "eus" to "eu",
        "baq" to "eu",
        "hrv" to "hr",
        "slk" to "sk",
        "slo" to "sk",
        "bul" to "bg",
        "fas" to "fa",
        "per" to "fa",
    )

    private val LABEL_NAMES = mapOf(
        "es" to listOf("español", "espanol", "spanish", "castellano"),
        "en" to listOf("english", "ingles", "inglés"),
        "pt" to listOf("portuguese", "portugues", "português", "brazilian", "brasileiro"),
        "fr" to listOf("french", "francais", "français", "frances", "francés"),
        "de" to listOf("german", "deutsch", "aleman", "alemán"),
        "it" to listOf("italian", "italiano"),
        "ja" to listOf("japanese", "japones", "japonés"),
        "ko" to listOf("korean", "coreano"),
        "zh" to listOf("chinese", "chino", "mandarin", "cantonese"),
        "ar" to listOf("arabic", "arabe", "árabe"),
        "ru" to listOf("russian", "ruso"),
        "nl" to listOf("dutch", "nederlands", "holandes", "holandés"),
        "pl" to listOf("polish", "polaco"),
        "tr" to listOf("turkish", "turco"),
        "hi" to listOf("hindi"),
        "th" to listOf("thai"),
        "vi" to listOf("vietnamese"),
        "sv" to listOf("swedish", "sueco"),
        "da" to listOf("danish", "danes", "danés"),
        "no" to listOf("norwegian", "noruego"),
        "fi" to listOf("finnish", "fines", "finés"),
        "el" to listOf("greek", "griego"),
        "he" to listOf("hebrew", "hebreo"),
        "id" to listOf("indonesian", "indonesio"),
        "cs" to listOf("czech", "checo"),
        "hu" to listOf("hungarian", "hungaro", "húngaro"),
        "ro" to listOf("romanian", "rumano"),
        "uk" to listOf("ukrainian", "ucraniano"),
    )
}
