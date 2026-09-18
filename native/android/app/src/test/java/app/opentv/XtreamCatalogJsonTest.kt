/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.model.Source
import app.opentv.data.model.SourceKind
import app.opentv.data.remote.XtreamCatalogJson
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class XtreamCatalogJsonTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val source = Source(
        id = 7,
        name = "Test",
        kind = SourceKind.XTREAM,
        url = "http://example.com:8080",
        username = "u",
        password = "p",
    )

    @Test
    fun `parses a standard vod array`() {
        val movies = parse(
            """
            [
              {"stream_id": 1, "name": "Alpha", "container_extension": "mkv", "category_id": "10"},
              {"stream_id": "2", "name": "Beta", "container_extension": "mp4"}
            ]
            """.trimIndent(),
        )

        assertThat(movies.map { it.name }).containsExactly("Alpha", "Beta").inOrder()
        assertThat(movies[0].streamId).isEqualTo("1")
        assertThat(movies[0].streamUrl).isEqualTo("http://example.com:8080/movie/u/p/1.mkv")
        assertThat(movies[1].streamUrl).isEqualTo("http://example.com:8080/movie/u/p/2.mp4")
    }

    @Test
    fun `parses an object keyed by stream id`() {
        val movies = parse(
            """
            {
              "1": {"stream_id": "1", "name": "Keyed One"},
              "2": {"stream_id": 2, "name": "Keyed Two"}
            }
            """.trimIndent(),
        )

        assertThat(movies.map { it.name }).containsExactly("Keyed One", "Keyed Two").inOrder()
    }

    @Test
    fun `parses a wrapper object with a nested array`() {
        val movies = parse(
            """
            {
              "status": "ok",
              "vod": [
                {"stream_id": "9", "name": "Wrapped"}
              ]
            }
            """.trimIndent(),
        )

        assertThat(movies.map { it.name }).containsExactly("Wrapped")
    }

    @Test
    fun `skips entries without a name or stream id`() {
        val movies = parse(
            """
            [
              {"stream_id": "1"},
              {"name": "No Id"},
              {"stream_id": "3", "name": "Good"}
            ]
            """.trimIndent(),
        )

        assertThat(movies.map { it.name }).containsExactly("Good")
    }

    @Test
    fun `streams thousands of titles without needing one giant JsonElement`() {
        val body = buildString {
            append('[')
            repeat(3_000) { i ->
                if (i > 0) append(',')
                append("""{"stream_id":$i,"name":"Movie $i"}""")
            }
            append(']')
        }

        val movies = parse(body)
        assertThat(movies).hasSize(3_000)
        assertThat(movies.first().name).isEqualTo("Movie 0")
        assertThat(movies.last().name).isEqualTo("Movie 2999")
    }

    @Test
    fun `handles escaped quotes in titles`() {
        val movies = parse("""[{"stream_id":"1","name":"The \"Godfather\""}]""")
        assertThat(movies.single().name).isEqualTo("The \"Godfather\"")
    }

    private fun parse(raw: String) =
        XtreamCatalogJson.movieObjects(raw.byteInputStream(), json).mapNotNull { obj ->
            XtreamCatalogJson.toMovie(source, obj) { id, ext ->
                "${source.url}/movie/${source.username}/${source.password}/$id.${ext ?: "mp4"}"
            }
        }.toList()
}
