/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.data.remote

import app.opentv.data.model.Movie
import app.opentv.data.model.Series
import app.opentv.data.model.Source
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Streaming catalogue parser for Xtream `get_vod_streams`.
 *
 * OpenTV used to slurp the whole response with `body.string()` and parse it as one
 * [JsonElement]. On a Fire TV Stick a 20–80k title VOD list is large enough that that
 * path OOMs or hits the catalogue timeout, and [CatalogRepository] then stores nothing —
 * which the UI reports as "this provider returned no movies".
 *
 * This reader walks the JSON as a stream and yields **one object at a time**, so peak
 * memory is a single title plus the current Room upsert batch. It also accepts the
 * three shapes real panels emit:
 * - a JSON array of movie objects (the spec)
 * - an object keyed by stream id (`{"123": {...}, "124": {...}}`)
 * - a wrapper object that hides the list under `vod` / `movies` / `streams` / `data`
 */
object XtreamCatalogJson {

    const val DEFAULT_BATCH_SIZE = 250

    fun movieObjects(input: InputStream, json: Json): Sequence<JsonObject> =
        catalogObjects(input, json, ::looksLikeMovie)

    /** Same streaming walk as [movieObjects], for `get_series` (keyed on `series_id`). */
    fun seriesObjects(input: InputStream, json: Json): Sequence<JsonObject> =
        catalogObjects(input, json, ::looksLikeSeries)

    private fun catalogObjects(
        input: InputStream,
        json: Json,
        looksLike: (JsonObject) -> Boolean,
    ): Sequence<JsonObject> = sequence {
        val reader = JsonTokenReader(input)
        reader.skipWs()
        when (reader.peek()) {
            '['.code -> yieldAll(readArray(reader, json, looksLike))
            '{'.code -> yieldAll(readObjectPayload(reader, json, looksLike))
            else -> { /* empty / HTML / not JSON — caller sees zero rows */ }
        }
    }

    fun toMovie(
        source: Source,
        obj: JsonObject,
        streamUrl: (streamId: String, extension: String?) -> String,
    ): Movie? {
        val streamId = obj["stream_id"].asStringOrNull ?: return null
        val name = obj["name"].asStringOrNull ?: return null
        val extension = obj["container_extension"].asStringOrNull?.takeIf { it.isNotBlank() }
        return Movie(
            sourceId = source.id,
            streamId = streamId,
            name = name,
            categoryId = obj["category_id"].asStringOrNull,
            posterUrl = obj["stream_icon"].asStringOrNull?.takeIf { it.isNotBlank() },
            rating = obj["rating"].asDoubleOrNull,
            year = obj["year"].asIntOrNull,
            plot = obj["plot"].asStringOrNull,
            durationSeconds = obj["duration_secs"].asIntOrNull,
            containerExtension = extension,
            streamUrl = streamUrl(streamId, extension),
            addedMillis = obj["added"].asLongOrNull?.times(1000) ?: 0L,
            backdropUrl = obj.asBackdropUrl("movie_image", "cover_big"),
            cast = obj["cast"].asStringOrNull ?: obj["actors"].asStringOrNull,
            director = obj["director"].asStringOrNull,
            genre = obj["genre"].asStringOrNull,
            tmdbId = obj["tmdb_id"].asStringOrNull ?: obj["tmdb"].asStringOrNull,
        )
    }

    fun toSeries(source: Source, obj: JsonObject): Series? {
        val seriesId = obj["series_id"].asStringOrNull ?: return null
        val name = obj["name"].asStringOrNull ?: return null
        return Series(
            sourceId = source.id,
            seriesId = seriesId,
            name = name,
            categoryId = obj["category_id"].asStringOrNull,
            posterUrl = obj["cover"].asStringOrNull?.takeIf { it.isNotBlank() },
            rating = obj["rating"].asDoubleOrNull,
            year = obj["year"].asIntOrNull ?: obj["releaseDate"].asStringOrNull?.take(4)?.toIntOrNull(),
            plot = obj["plot"].asStringOrNull,
            addedMillis = obj["last_modified"].asLongOrNull?.times(1000) ?: 0L,
            backdropUrl = obj.asBackdropUrl("cover_big", "cover"),
            cast = obj["cast"].asStringOrNull ?: obj["actors"].asStringOrNull,
            genre = obj["genre"].asStringOrNull,
            tmdbId = obj["tmdb_id"].asStringOrNull ?: obj["tmdb"].asStringOrNull,
        )
    }

    private fun readArray(
        reader: JsonTokenReader,
        json: Json,
        looksLike: (JsonObject) -> Boolean,
    ): Sequence<JsonObject> = sequence {
        reader.read() // '['
        while (true) {
            reader.skipWs()
            when (reader.peek()) {
                -1 -> return@sequence
                ']'.code -> {
                    reader.read()
                    return@sequence
                }
                ','.code -> reader.read()
                else -> {
                    val value = parseValue(reader, json)
                    yieldAll(objectsFrom(value, looksLike))
                }
            }
        }
    }

    private fun readObjectPayload(
        reader: JsonTokenReader,
        json: Json,
        looksLike: (JsonObject) -> Boolean,
    ): Sequence<JsonObject> = sequence {
        reader.read() // '{'
        while (true) {
            reader.skipWs()
            when (reader.peek()) {
                -1 -> return@sequence
                '}'.code -> {
                    reader.read()
                    return@sequence
                }
                ','.code -> reader.read()
                else -> {
                    reader.skipWs()
                    if (reader.peek() != '"'.code) {
                        return@sequence
                    }
                    reader.readValueBytes() // key
                    reader.skipWs()
                    if (reader.peek() == ':'.code) reader.read()
                    reader.skipWs()
                    when (reader.peek()) {
                        '['.code -> yieldAll(readArray(reader, json, looksLike))
                        '{'.code -> {
                            // One keyed record (typical `{"123": {movie}}`) — small.
                            val value = parseValue(reader, json)
                            yieldAll(objectsFrom(value, looksLike))
                        }
                        else -> parseValue(reader, json) // skip primitives
                    }
                }
            }
        }
    }

    private fun parseValue(reader: JsonTokenReader, json: Json): JsonElement =
        json.parseToJsonElement(String(reader.readValueBytes(), Charsets.UTF_8))

    private fun objectsFrom(
        value: JsonElement,
        looksLike: (JsonObject) -> Boolean,
    ): Sequence<JsonObject> = sequence {
        when (value) {
            is JsonObject -> {
                if (looksLike(value)) {
                    yield(value)
                } else {
                    for ((_, child) in value) yieldAll(objectsFrom(child, looksLike))
                }
            }
            is JsonArray -> {
                for (el in value) {
                    val obj = el as? JsonObject ?: continue
                    if (looksLike(obj)) yield(obj)
                }
            }
            else -> {}
        }
    }

    private fun looksLikeMovie(obj: JsonObject): Boolean =
        obj["stream_id"].asStringOrNull != null && obj["name"].asStringOrNull != null

    private fun looksLikeSeries(obj: JsonObject): Boolean =
        obj["series_id"].asStringOrNull != null && obj["name"].asStringOrNull != null
}

/** Byte-level JSON scanner. Structural tokens are ASCII; string bodies stay UTF-8. */
internal class JsonTokenReader(input: InputStream) {
    private val buf = BufferedInputStream(input, 64 * 1024)

    fun peek(): Int {
        buf.mark(1)
        val c = buf.read()
        buf.reset()
        return c
    }

    fun read(): Int = buf.read()

    fun skipWs() {
        while (true) {
            buf.mark(1)
            val c = buf.read()
            if (c < 0) return
            if (c != ' '.code && c != '\n'.code && c != '\r'.code && c != '\t'.code) {
                buf.reset()
                return
            }
        }
    }

        fun readValueBytes(): ByteArray {
        skipWs()
        return when (peek()) {
            '"'.code -> readStringLiteral()
            '{'.code, '['.code -> readBalanced()
            else -> readBare()
        }
    }

    private fun readStringLiteral(): ByteArray {
        val out = ByteArrayOutputStream()
        val first = read()
        if (first != '"'.code) error("expected string")
        out.write(first)
        var escape = false
        while (true) {
            val c = read()
            if (c < 0) error("unterminated string")
            out.write(c)
            if (escape) {
                escape = false
                continue
            }
            when (c) {
                '\\'.code -> escape = true
                '"'.code -> return out.toByteArray()
            }
        }
    }

    private fun readBalanced(): ByteArray {
        val out = ByteArrayOutputStream()
        val start = read()
        out.write(start)
        var depth = 1
        var inString = false
        var escape = false
        while (depth > 0) {
            val c = read()
            if (c < 0) error("unterminated JSON value")
            out.write(c)
            if (inString) {
                if (escape) {
                    escape = false
                } else when (c) {
                    '\\'.code -> escape = true
                    '"'.code -> inString = false
                }
                continue
            }
            when (c) {
                '"'.code -> inString = true
                '{'.code, '['.code -> depth++
                '}'.code, ']'.code -> depth--
            }
        }
        return out.toByteArray()
    }

    private fun readBare(): ByteArray {
        val out = ByteArrayOutputStream()
        while (true) {
            buf.mark(1)
            val c = buf.read()
            if (c < 0) break
            if (c == ','.code || c == '}'.code || c == ']'.code ||
                c == ' '.code || c == '\n'.code || c == '\r'.code || c == '\t'.code
            ) {
                buf.reset()
                break
            }
            out.write(c)
        }
        return out.toByteArray()
    }
}

private val JsonElement?.asPrimitiveOrNull: JsonPrimitive?
    get() = this as? JsonPrimitive

private val JsonElement?.asStringOrNull: String?
    get() = asPrimitiveOrNull?.contentOrNull?.takeIf { it.isNotEmpty() && it != "null" }

private val JsonElement?.firstStringOrNull: String?
    get() = when (this) {
        is JsonArray -> firstNotNullOfOrNull { it.asStringOrNull }
        else -> asStringOrNull
    }

private fun JsonObject.asBackdropUrl(vararg fallbackKeys: String): String? {
    this["backdrop_path"].firstStringOrNull?.let { return it }
    this["backdrop"].firstStringOrNull?.let { return it }
    for (key in fallbackKeys) this[key].asStringOrNull?.takeIf { it.isNotBlank() }?.let { return it }
    return null
}

private val JsonElement?.asIntOrNull: Int?
    get() = asStringOrNull?.substringBefore('.')?.toIntOrNull()

private val JsonElement?.asLongOrNull: Long?
    get() = asStringOrNull?.substringBefore('.')?.toLongOrNull()

private val JsonElement?.asDoubleOrNull: Double?
    get() = asStringOrNull?.toDoubleOrNull()
