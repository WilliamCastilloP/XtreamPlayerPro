/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

import java.io.File
import java.net.URI

/**
 * Local VOD session notes: title, episode, server, measured throughput, rebuffers.
 *
 * Stream URLs embed the panel username and password (`/movie/user/pass/id.ext`). Those segments
 * are never written. Live TV does not call this.
 */
object VodStreamLog {

    data class Event(
        val atMillis: Long,
        val title: String,
        val episode: String,
        val server: String,
        val throughputBps: Long?,
        val rebuffers: Int,
        val note: String,
    )

    /** Host, port, kind and file name. Credentials in the path are replaced. */
    fun describeServer(url: String): String {
        val uri = runCatching { URI(url) }.getOrNull() ?: return "unknown"
        val host = uri.host ?: return "unknown"
        val port = if (uri.port > 0) ":${uri.port}" else ""
        val parts = uri.path.orEmpty().split('/').filter { it.isNotEmpty() }
        val kind = parts.firstOrNull().orEmpty()
        val file = parts.lastOrNull().orEmpty()
        return if (parts.size >= 4 && kind in setOf("movie", "series", "live")) {
            "$host$port/$kind/…/$file"
        } else {
            "$host$port/${file.ifBlank { "" }}"
        }
    }

    fun format(event: Event): String = listOf(
        event.atMillis.toString(),
        sanitize(event.title),
        sanitize(event.episode),
        sanitize(event.server),
        event.throughputBps?.toString() ?: "-",
        event.rebuffers.toString(),
        sanitize(event.note),
    ).joinToString("\t")

    class Store(private val file: File, private val maxBytes: Long = VodPlaybackTuning.LOG_MAX_BYTES) {
        @Synchronized
        fun append(event: Event) {
            val parent = file.parentFile
            if (parent != null && !parent.exists()) parent.mkdirs()
            if (file.exists() && file.length() > maxBytes) {
                val tail = file.readText().takeLast((maxBytes / 2).toInt())
                file.writeText(tail.substringAfter('\n', tail))
            }
            file.appendText(format(event) + "\n")
        }
    }

    private fun sanitize(value: String): String =
        value.replace('\t', ' ').replace('\n', ' ').take(180)
}
