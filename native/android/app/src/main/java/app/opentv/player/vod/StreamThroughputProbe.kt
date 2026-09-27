/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Measures sustained throughput against the stream's own URL with a small ranged GET.
 * A speed-test host would not tell us what this panel can deliver.
 */
class StreamThroughputProbe(
    httpClient: OkHttpClient,
    private val byteBudget: Int = VodPlaybackTuning.PROBE_BYTES,
    timeoutMs: Int = VodPlaybackTuning.PROBE_TIMEOUT_MS,
) {
    data class Sample(
        val url: String,
        val bytes: Int,
        val elapsedMs: Long,
        val bitsPerSecond: Long,
        val httpCode: Int,
    )

    private val client: OkHttpClient = httpClient.newBuilder()
        .connectTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .readTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .callTimeout((timeoutMs * 2).toLong(), TimeUnit.MILLISECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    /**
     * @param rangeStart first byte to ask for. The read stops at [byteBudget] even if the panel
     * ignores Range and starts sending the whole file.
     */
    fun measure(url: String, userAgent: String, rangeStart: Long = 0L): Sample? {
        if (!url.startsWith("http://") && !url.startsWith("https://")) return null
        val end = rangeStart + byteBudget - 1
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", userAgent)
            .header("Range", "bytes=$rangeStart-$end")
            .build()
        val started = System.nanoTime()
        return try {
            client.newCall(request).execute().use { response ->
                if (response.code != 200 && response.code != 206) return null
                val body = response.body ?: return null
                val buffer = ByteArray(8 * 1024)
                var total = 0
                val stream = body.byteStream()
                while (total < byteBudget) {
                    val n = stream.read(buffer, 0, minOf(buffer.size, byteBudget - total))
                    if (n < 0) break
                    total += n
                }
                val elapsedMs = ((System.nanoTime() - started) / 1_000_000L).coerceAtLeast(1L)
                val bps = total.toLong() * 8_000L / elapsedMs
                Sample(
                    url = url,
                    bytes = total,
                    elapsedMs = elapsedMs,
                    bitsPerSecond = bps,
                    httpCode = response.code,
                )
            }
        } catch (_: Exception) {
            null
        }
    }
}
