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
 * Languages a catalogue title advertises, without opening the media file.
 *
 * IPTV panels stamp codes on the name (`ES|LAT - Dune`, `Movie (2024) (KR)`) and sometimes
 * put an audio-track language inside `get_vod_info` / `get_series_info`. Both are best-effort:
 * a file whose languages exist only inside the container is not probed here, because that would
 * open a second connection.
 */
object VodLanguages {

    private val BRACKET = Regex("""^\s*[\[(]\s*([A-Za-z0-9+]{2,12})\s*[\])]\s*[|:\-–—]?\s*""")
    private val BARE = Regex("""^\s*([A-Za-z0-9+]{2,12})\s*([|:\-–—])\s*""")
    private val PAREN = Regex("""[\[(]\s*([A-Za-z]{2,12})\s*[\])]""")
    private val WORD = Regex(
        """(?i)\b(LATINO|CASTELLANO|SUBTITULADO|SUBTITULADA|SUBTITLES|DUBBED|MULTI)\b""",
    )

    private val SERVICE = setOf(
        "NF", "AMZ", "AMZN", "PMV", "DSNY", "DNSP", "D+", "HBO", "HMAX",
        "ATV", "ATVP", "PMT", "HULU", "PCOK",
    )

    /** Title/info token → stable code. Country tags that panels use as the audio region map too. */
    private val TOKEN = mapOf(
        "EN" to "en", "ENG" to "en", "US" to "en", "USA" to "en", "UK" to "en", "GB" to "en",
        "AU" to "en", "CA" to "en", "NZ" to "en", "IE" to "en",
        "ES" to "es", "ESP" to "es", "SPA" to "es", "CASTELLANO" to "es",
        "LAT" to "lat", "LATINO" to "lat", "MX" to "lat", "MEX" to "lat",
        "PT" to "pt", "POR" to "pt", "BR" to "pt-BR", "BRA" to "pt-BR",
        "FR" to "fr", "FRA" to "fr", "FRE" to "fr",
        "DE" to "de", "GER" to "de", "DEU" to "de",
        "IT" to "it", "ITA" to "it",
        "NL" to "nl", "DUT" to "nl", "NLD" to "nl",
        "PL" to "pl", "POL" to "pl",
        "RU" to "ru", "RUS" to "ru",
        "AR" to "ar", "ARA" to "ar",
        "TR" to "tr", "TUR" to "tr",
        "SV" to "sv", "SWE" to "sv", "SE" to "sv",
        "NO" to "no", "NOR" to "no",
        "DA" to "da", "DAN" to "da", "DK" to "da",
        "FI" to "fi", "FIN" to "fi",
        "EL" to "el", "GRE" to "el", "GR" to "el",
        "RO" to "ro", "RON" to "ro",
        "CS" to "cs", "CZE" to "cs", "CZ" to "cs",
        "HU" to "hu", "HUN" to "hu",
        "HR" to "hr", "HRV" to "hr",
        "JA" to "ja", "JP" to "ja", "JPN" to "ja",
        "KO" to "ko", "KR" to "ko", "KOR" to "ko",
        "ZH" to "zh", "CN" to "zh", "CHI" to "zh", "ZHO" to "zh",
        "HI" to "hi", "HIN" to "hi",
        "HE" to "he", "HEB" to "he", "IL" to "he",
        "TH" to "th", "THA" to "th",
        "VI" to "vi", "VIE" to "vi", "VN" to "vi",
        "ID" to "id",
        "MULTI" to "multi",
        "SUB" to "sub", "SUBTITULADO" to "sub", "SUBTITULADA" to "sub", "SUBTITLES" to "sub",
        "DUB" to "dub", "DUBBED" to "dub",
        "VO" to "vo",
    )

    private val SKIP_VALUES = setOf(
        "und", "unknown", "nil", "null", "mis", "zxx", "aac", "ac3", "eac3", "mp3", "mp2",
        "opus", "vorbis", "flac", "dts", "truehd", "mp4a",
    )

    /** Language codes advertised by a provider title, in the order they appear. */
    fun codesInTitle(raw: String): List<String> {
        if (raw.isBlank()) return emptyList()
        val found = LinkedHashSet<String>()
        var rest = raw.trim()
        var guard = 0
        while (guard++ < 8) {
            val bracket = BRACKET.find(rest)
            if (bracket != null && consumeLeading(bracket.groupValues[1], found)) {
                rest = rest.substring(bracket.range.last + 1).trimStart()
                continue
            }
            val bare = BARE.find(rest)
            if (bare != null && consumeLeading(bare.groupValues[1], found)) {
                rest = rest.substring(bare.range.last + 1).trimStart()
                continue
            }
            break
        }
        PAREN.findAll(raw).forEach { match ->
            canonical(match.groupValues[1])?.let { found += it }
        }
        WORD.findAll(raw).forEach { match ->
            canonical(match.groupValues[1])?.let { found += it }
        }
        return found.toList()
    }

    /**
     * Audio languages from a `get_vod_info` / `get_series_info` object. Reads `language` fields
     * and a string `audio` value when it is a language code rather than a codec name.
     */
    fun codesInJson(element: JsonElement?): List<String> {
        if (element == null) return emptyList()
        val found = LinkedHashSet<String>()
        walk(element, found, 0)
        return found.toList()
    }

    private fun consumeLeading(token: String, found: MutableSet<String>): Boolean {
        val upper = token.uppercase()
        if (ChannelNameNormalizer.qualityRankOfToken(token) != null) return true
        if (ChannelNameNormalizer.isStreamMarker(token)) return true
        if (upper in SERVICE) return true
        val code = canonical(token) ?: return false
        found += code
        return true
    }

    private fun canonical(token: String): String? {
        val upper = token.trim().uppercase()
        if (upper.isEmpty() || upper in SKIP_VALUES) return null
        if (upper.all { it.isDigit() }) return null
        return TOKEN[upper]
    }

    private fun walk(element: JsonElement, found: MutableSet<String>, depth: Int) {
        if (depth > 8) return
        when (element) {
            is JsonObject -> {
                for ((key, value) in element) {
                    val name = key.lowercase()
                    if (name == "language" || name == "languages") {
                        collectValue(value, found)
                    } else if (name == "audio" && value is JsonPrimitive) {
                        canonical(value.contentOrNull.orEmpty())?.let { found += it }
                    } else {
                        walk(value, found, depth + 1)
                    }
                }
            }
            is JsonArray -> element.forEach { walk(it, found, depth + 1) }
            else -> Unit
        }
    }

    private fun collectValue(value: JsonElement, found: MutableSet<String>) {
        when (value) {
            is JsonPrimitive -> value.contentOrNull.orEmpty()
                .split(',', '/', '|', ' ')
                .forEach { part -> canonical(part)?.let { found += it } }
            is JsonArray -> value.forEach { collectValue(it, found) }
            is JsonObject -> walk(value, found, 0)
        }
    }
}
