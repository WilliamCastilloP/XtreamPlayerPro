/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import app.opentv.player.vod.VodResumePlanner.PreloadTarget
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient

/**
 * Bounded VOD preload into the shared disk cache. Never a second player while the real one is
 * active: a detail-page warm uses one short-lived player and releases it, and a "next episode"
 * warm is a ranged download that is cancelled the moment the active buffer drops.
 *
 * Xtream `max_connections` is often 1. The download is closed as soon as the prefix is cached.
 */
@UnstableApi
class VodPreloader(
    private val context: Context,
    private val cache: Cache?,
    httpClient: OkHttpClient,
    private val probe: StreamThroughputProbe,
    private val log: VodStreamLog.Store,
    private val scope: CoroutineScope,
) {
    private val httpFactory = OkHttpDataSource.Factory(httpClient)
    private val upstream = DefaultDataSource.Factory(context, httpFactory)
    private val job = AtomicReference<Job?>(null)

    /** Null while no VOD player is on screen. */
    private val activeAheadMs = AtomicReference<Long?>(null)
    private val activeUrl = AtomicReference<String?>(null)

    /** Last good sample, keyed by server description so the next file on that host can reuse it. */
    private val throughputByServer = AtomicReference<Pair<String, Long>?>(null)
    private val probeInFlight = AtomicReference(false)

    fun notePlayback(url: String?, bufferedAheadMs: Long) {
        activeUrl.set(url)
        activeAheadMs.set(if (url == null) null else bufferedAheadMs)
        if (url != null && VodPreloadGate.mustPause(bufferedAheadMs)) {
            job.get()?.cancel()
        }
    }

    /** One ranged read while playback is healthy, so the buffer can adapt without a second movie. */
    fun sampleWhenHealthy(url: String, userAgent: String) {
        if (rememberedThroughput(url) != null) return
        if (!VodPreloadGate.mayStart(activeAheadMs.get())) return
        if (!probeInFlight.compareAndSet(false, true)) return
        scope.launch(Dispatchers.IO) {
            val sample = try {
                probe.measure(url, userAgent)
            } finally {
                probeInFlight.set(false)
            }
            val server = VodStreamLog.describeServer(url)
            if (sample == null) {
                throughputByServer.set(server to 0L)
                return@launch
            }
            throughputByServer.set(server to sample.bitsPerSecond)
            log.append(
                VodStreamLog.Event(
                    atMillis = System.currentTimeMillis(),
                    title = "",
                    episode = "",
                    server = VodStreamLog.describeServer(url),
                    throughputBps = sample.bitsPerSecond,
                    rebuffers = 0,
                    note = "probe ${sample.bytes}B in ${sample.elapsedMs}ms",
                ),
            )
        }
    }

    fun rememberedThroughput(url: String): Long? {
        val known = throughputByServer.get() ?: return null
        return if (known.first == VodStreamLog.describeServer(url)) known.second else null
    }

    fun preload(target: PreloadTarget, userAgent: String, bitrateBps: Long = VodPlaybackTuning.ASSUMED_BITRATE_BPS) {
        if (cache == null) return
        if (activeUrl.get() == target.streamUrl) return
        job.get()?.cancel()
        val launched = scope.launch {
            run(target, userAgent, bitrateBps)
        }
        job.set(launched)
    }

    fun cancel() {
        job.get()?.cancel()
    }

    suspend fun stopForPlayback() {
        val running = job.get()
        running?.cancel()
        running?.join()
    }

    private suspend fun run(target: PreloadTarget, userAgent: String, bitrateBps: Long) {
        if (!VodPreloadGate.mayStart(activeAheadMs.get())) {
            write(target, null, "preload skipped: active buffer low")
            return
        }
        val sample = withContext(Dispatchers.IO) {
            probe.measure(target.streamUrl, userAgent)
        }
        if (!coroutineContext.isActive) return
        if (sample == null) {
            write(target, null, "probe failed")
            return
        }
        throughputByServer.set(VodStreamLog.describeServer(target.streamUrl) to sample.bitsPerSecond)
        val bitrate = bitrateBps.coerceAtLeast(1L)
        if (!VodPreloadGate.bandwidthAllows(sample.bitsPerSecond, bitrate)) {
            write(target, sample.bitsPerSecond, "preload skipped: throughput ${sample.bitsPerSecond} < bitrate $bitrate")
            return
        }
        if (!VodPreloadGate.mayStart(activeAheadMs.get())) {
            write(target, sample.bitsPerSecond, "preload skipped after probe: active buffer low")
            return
        }
        httpFactory.setDefaultRequestProperties(mapOf("User-Agent" to userAgent))
        val fromResume = target.startPositionMillis > 0L && activeUrl.get() == null
        if (fromResume) {
            warmWithPlayer(target)
        } else {
            warmPrefix(target, bitrate)
        }
        write(target, sample.bitsPerSecond, "preload done reason=${target.reason} start=${target.startPositionMillis}")
    }

    private suspend fun warmPrefix(target: PreloadTarget, bitrateBps: Long) {
        val cache = cache ?: return
        val bytes = VodBufferMath.preloadBytes(bitrateBps)
        withContext(Dispatchers.IO) {
            val source = cacheSource(cache).createDataSourceForDownloading()
            val spec = DataSpec(Uri.parse(target.streamUrl), 0L, bytes)
            val writerRef = AtomicReference<CacheWriter?>(null)
            val writer = CacheWriter(source, spec, null) { _, _, _ ->
                if (!isActive || VodPreloadGate.mustPause(activeAheadMs.get())) {
                    writerRef.get()?.cancel()
                }
            }
            writerRef.set(writer)
            try {
                writer.cache()
            } catch (_: Exception) {
                // Cancelled or the panel closed the range. Cached bytes stay.
            } finally {
                runCatching { source.close() }
            }
        }
    }

    /**
     * Detail page only: one muted player seeks to the saved position so the cache stores the
     * bytes ExoPlayer will actually ask for, then releases before the real player starts.
     */
    private suspend fun warmWithPlayer(target: PreloadTarget) {
        val cache = cache ?: return
        withContext(Dispatchers.Main) {
            val player = ExoPlayer.Builder(context)
                .setMediaSourceFactory(DefaultMediaSourceFactory(cacheSource(cache)))
                .build()
            try {
                player.playWhenReady = false
                player.setMediaItem(
                    MediaItem.Builder().setUri(target.streamUrl).build(),
                )
                player.prepare()
                player.seekTo(target.startPositionMillis)
                val deadline = System.currentTimeMillis() + VodPlaybackTuning.PRELOAD_PLAYER_TIMEOUT_MS
                while (isActive && System.currentTimeMillis() < deadline) {
                    if (VodPreloadGate.mustPause(activeAheadMs.get())) break
                    val ahead = player.bufferedPosition - player.currentPosition
                    if (ahead >= VodPlaybackTuning.PRELOAD_AHEAD_MS) break
                    delay(200)
                }
            } finally {
                player.release()
            }
        }
    }

    private fun cacheSource(cache: Cache): CacheDataSource.Factory =
        CacheDataSource.Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(upstream)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

    private fun write(target: PreloadTarget, throughput: Long?, note: String) {
        log.append(
            VodStreamLog.Event(
                atMillis = System.currentTimeMillis(),
                title = target.title,
                episode = target.mediaKey,
                server = VodStreamLog.describeServer(target.streamUrl),
                throughputBps = throughput,
                rebuffers = 0,
                note = note,
            ),
        )
    }
}
