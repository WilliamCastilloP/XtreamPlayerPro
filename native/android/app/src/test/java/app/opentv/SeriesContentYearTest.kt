/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.parser.SeriesContentYear
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
    fun `plot and codec text are not scanned for a year`() {
        val body = json.parseToJsonElement(
            """
            { "episodes": { "1": { "id": "1", "title": "2026", "info": { "plot": "Set in 2026", "audio": "aac" } } } }
            """.trimIndent(),
        )

        assertThat(SeriesContentYear.latest(body)).isNull()
    }
}
