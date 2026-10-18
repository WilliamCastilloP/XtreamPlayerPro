/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.data.parser

/**
 * Where a film or series was released, when the panel bothers to say so.
 *
 * Xtream does not send a studio field. Panels put it in the title (`NF - Stranger Things`,
 * `Stranger Things - Netflix`) or in the category name (`Netflix Series`). Anything else stays
 * blank rather than guessing.
 */
object ContentOrigin {

    fun from(rawTitle: String, categoryName: String?): String? {
        serviceInTitle(rawTitle)?.let { return it }
        return serviceInLabel(categoryName)
    }

    private fun serviceInTitle(raw: String): String? {
        var rest = raw.trim()
        while (rest.isNotEmpty()) {
            val match = LEADING.find(rest) ?: break
            val token = match.groupValues[1]
            labelForCode(token)?.let { return it }
            if (!isSkippablePrefix(token)) break
            rest = rest.substring(match.range.last + 1).trim()
        }
        val tail = segmentAfter(raw)
        if (tail != null) serviceInLabel(tail)?.let { return it }
        return null
    }

    private fun segmentAfter(raw: String): String? {
        val separators = listOf(" - ", " | ", " – ", " — ")
        for (separator in separators) {
            val index = raw.lastIndexOf(separator)
            if (index <= 0 || index + separator.length >= raw.length) continue
            val tail = raw.substring(index + separator.length).trim()
            if (tail.isNotEmpty() && tail.length <= 40) return tail
        }
        return null
    }

    private fun serviceInLabel(label: String?): String? {
        if (label.isNullOrBlank()) return null
        val folded = label.trim().lowercase()
        val tokens = folded.split(Regex("[^\\p{L}\\p{N}+]+")).filter { it.isNotEmpty() }
        for (service in SERVICES) {
            for (phrase in service.phrases) {
                if (phrase.contains(' ')) {
                    if (folded.contains(phrase)) return service.label
                } else if (phrase in tokens) {
                    return service.label
                }
            }
        }
        for (token in tokens) {
            labelForCode(token)?.let { return it }
        }
        return null
    }

    private fun labelForCode(token: String): String? {
        val upper = token.uppercase()
        return SERVICES.firstOrNull { upper in it.codes }?.label
    }

    private fun isSkippablePrefix(token: String): Boolean {
        if (labelForCode(token) != null) return true
        if (ChannelNameNormalizer.qualityRankOfToken(token) != null) return true
        if (ChannelNameNormalizer.isStreamMarker(token)) return true
        val upper = token.uppercase()
        return upper.length in 2..3 && upper.all { it.isLetter() }
    }

    private val LEADING = Regex("""^\s*[\[(]?\s*([A-Za-z0-9+]{2,12})\s*[\])]?\s*[|:\-–—]\s*""")

    private data class Service(val label: String, val codes: Set<String>, val phrases: List<String>)

    private val SERVICES = listOf(
        Service("Netflix", setOf("NF"), listOf("netflix")),
        Service("Prime Video", setOf("AMZ", "AMZN", "PMV"), listOf("prime video", "amazon prime", "prime")),
        Service("Disney+", setOf("DSNY", "DNSP", "D+"), listOf("disney+", "disney plus", "disney")),
        Service("Max", setOf("HBO", "HMAX"), listOf("hbo max", "hbo")),
        Service("Apple TV+", setOf("ATV", "ATVP"), listOf("apple tv+", "apple tv")),
        Service("Paramount+", setOf("PMT"), listOf("paramount+", "paramount plus", "paramount")),
        Service("Hulu", setOf("HULU"), listOf("hulu")),
        Service("Peacock", setOf("PCOK"), listOf("peacock")),
        Service("Crunchyroll", setOf("CR"), listOf("crunchyroll")),
    )
}
