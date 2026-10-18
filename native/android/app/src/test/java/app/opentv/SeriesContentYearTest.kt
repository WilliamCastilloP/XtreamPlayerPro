/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.model.Series
import app.opentv.data.parser.SeriesContentYear
import app.opentv.data.parser.SeriesReleaseOrder
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class SeriesContentYearTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `a 2026 season on a 2025 premiere is new episodes filed as 2026`() {
        val body = json.parseToJsonElement(
            """
            {
              "info": { "year": "2025", "releaseDate": "2025-03-01", "plot": "A 2024 flashback" },
              "seasons": [
                { "season_number": 1, "air_date": "2025-03-01" },
                { "season_number": 2, "air_date": "2026-01-12" }
              ],
              "episodes": {
                "1": [ { "id": "1", "title": "Pilot", "info": { "releasedate": "2025-03-01" } } ]
              }
            }
            """.trimIndent(),
        )

        assertThat(SeriesContentYear.latest(body)).isEqualTo(2026)
        assertThat(SeriesContentYear.hasNewEpisodes(2025, 2026)).isTrue()
        assertThat(SeriesContentYear.sortYear(2025, 2026)).isEqualTo(2026)
    }

    @Test
    fun `episode info releasedate counts when seasons omit air dates`() {
        val body = json.parseToJsonElement(
            """
            {
              "episodes": [
                { "id": "9", "season": 2, "info": { "releasedate": "2026-09-01", "plot": "shot in 2024" } }
              ]
            }
            """.trimIndent(),
        )

        assertThat(SeriesContentYear.latest(body)).isEqualTo(2026)
    }

    @Test
    fun `a show that premiered in its only content year is not new episodes`() {
        assertThat(SeriesContentYear.hasNewEpisodes(2026, 2026)).isFalse()
        assertThat(SeriesContentYear.hasNewEpisodes(2026, null)).isFalse()
        assertThat(SeriesContentYear.hasNewEpisodes(null, 2026)).isFalse()
        assertThat(SeriesContentYear.sortYear(2026, null)).isEqualTo(2026)
        assertThat(SeriesContentYear.sortYear(null, null)).isNull()
    }

    @Test
    fun `browse order is the newest release year, with premieres before later seasons`() {
        val premiere2026 = show("Premiere", year = 2026, added = 10)
        val returning2026 = show("Returning", year = 2018, content = 2026, added = 99)
        val premiere2025 = show("Older", year = 2025, added = 1_000)
        val returning2025 = show("Old Season", year = 2010, content = 2025, added = 5_000)
        val undated = show("Unknown", year = null, added = 9_000)
        val sorted = listOf(undated, returning2025, premiere2025, returning2026, premiere2026)
            .sortedWith(SeriesReleaseOrder.COMPARATOR)

        assertThat(sorted.map { it.name }).containsExactly(
            "Premiere",
            "Returning",
            "Older",
            "Old Season",
            "Unknown",
        ).inOrder()
    }

    @Test
    fun `the same year and the same kind of release use the panel edit only as a tie`() {
        val later = show("Later", year = 2026, added = 50)
        val earlier = show("Earlier", year = 2026, added = 10)
        val sorted = listOf(earlier, later).sortedWith(SeriesReleaseOrder.COMPARATOR)
        assertThat(sorted.map { it.name }).containsExactly("Later", "Earlier").inOrder()
    }

    @Test
    fun `plot and codec text are not scanned for a year`() {
        val body = json.parseToJsonElement(
            """
            { "episodes": { "1": { "id": "1", "title": "2026", "info": { "plot": "Set in 2026", "audio": "aac" } } } }
            """.trimIndent(),
        )

        assertThat(SeriesContentYear.latest(body)).isNull()
    }

    private fun show(name: String, year: Int?, content: Int? = null, added: Long) = Series(
        sourceId = 1,
        seriesId = name,
        name = name,
        categoryId = "s",
        posterUrl = null,
        rating = null,
        year = year,
        plot = null,
        addedMillis = added,
        contentYear = content,
    )
}
