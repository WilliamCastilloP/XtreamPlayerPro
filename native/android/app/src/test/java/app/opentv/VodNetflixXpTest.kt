/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.model.Movie
import app.opentv.data.repo.movieServerOptions
import app.opentv.player.PlaybackBuffers
import app.opentv.player.vod.RebufferBreaker
import app.opentv.player.vod.StreamThroughputProbe
import app.opentv.player.vod.VodBufferMath
import app.opentv.player.vod.VodPlaybackTuning
import app.opentv.player.vod.VodPreloadGate
import app.opentv.player.vod.VodResumePlanner
import app.opentv.player.vod.VodServerFailover
import app.opentv.player.vod.VodServerOption
import app.opentv.player.vod.VodStreamLog
import com.google.common.truth.Truth.assertThat
import java.io.File
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test

class VodNetflixXpTest {

    private fun ep(id: String, season: Int, number: Int) = VodResumePlanner.EpisodeCandidate(
        mediaKey = id,
        season = season,
        episodeNumber = number,
        title = id,
        streamUrl = "http://panel.example:8080/series/user/secret/$id.mp4",
    )

    private fun mark(key: String, position: Long, duration: Long, updated: Long) = VodResumePlanner.WatchMark(
        mediaKey = key,
        positionMillis = position,
        durationMillis = duration,
        updatedAtMillis = updated,
    )

    @Test
    fun `in progress episode wins and the newest activity wins ties`() {
        val episodes = listOf(ep("ep:1", 1, 1), ep("ep:2", 1, 2))
        val marks = listOf(
            mark("ep:1", 10_000, 100_000, updated = 1),
            mark("ep:2", 20_000, 100_000, updated = 5),
        )
        val target = VodResumePlanner.seriesTarget(episodes, marks)
        assertThat(target!!.mediaKey).isEqualTo("ep:2")
        assertThat(target.startPositionMillis).isEqualTo(20_000)
        assertThat(target.reason).isEqualTo(VodResumePlanner.TargetReason.IN_PROGRESS)
    }

    @Test
    fun `1b is the first unfinished in order not the one after the highest finished`() {
        // S1E5 finished, S1E1 never started, S1E2 finished. Out-of-order viewing must warm S1E1.
        val episodes = listOf(ep("ep:5", 1, 5), ep("ep:1", 1, 1), ep("ep:2", 1, 2))
        val marks = listOf(
            mark("ep:5", 98_000, 100_000, updated = 9),
            mark("ep:2", 99_000, 100_000, updated = 8),
        )
        val target = VodResumePlanner.seriesTarget(episodes, marks)
        assertThat(target!!.mediaKey).isEqualTo("ep:1")
        assertThat(target.startPositionMillis).isEqualTo(0)
        assertThat(target.reason).isEqualTo(VodResumePlanner.TargetReason.FIRST_UNFINISHED_IN_ORDER)
    }

    @Test
    fun `a fully finished series is not preloaded`() {
        val episodes = listOf(ep("ep:1", 1, 1), ep("ep:2", 1, 2))
        val marks = episodes.map { mark(it.mediaKey, 96_000, 100_000, updated = 1) }
        assertThat(VodResumePlanner.seriesTarget(episodes, marks)).isNull()
    }

    @Test
    fun `no marks warms the first episode from zero`() {
        val episodes = listOf(ep("ep:2", 1, 2), ep("ep:1", 1, 1))
        val target = VodResumePlanner.seriesTarget(episodes, emptyList())
        assertThat(target!!.mediaKey).isEqualTo("ep:1")
        assertThat(target.startPositionMillis).isEqualTo(0)
        assertThat(target.reason).isEqualTo(VodResumePlanner.TargetReason.FIRST_EPISODE)
    }

    @Test
    fun `next episode excludes the one playing and still uses 1b`() {
        val episodes = listOf(ep("ep:1", 1, 1), ep("ep:5", 1, 5), ep("ep:2", 1, 2))
        val marks = listOf(mark("ep:5", 50_000, 100_000, updated = 3))
        val next = VodResumePlanner.nextAfter("ep:5", episodes, marks)
        assertThat(next!!.mediaKey).isEqualTo("ep:1")
        assertThat(next.startPositionMillis).isEqualTo(0)
    }

    @Test
    fun `movie in progress resumes and a finished movie is not warmed`() {
        val mid = mark("movie:7", 40_000, 100_000, updated = 1)
        val done = mark("movie:7", 97_000, 100_000, updated = 1)
        val resume = VodResumePlanner.movieTarget("movie:7", "Film", "http://h/movie/u/p/7.mp4", mid)
        val finished = VodResumePlanner.movieTarget("movie:7", "Film", "http://h/movie/u/p/7.mp4", done)
        val fresh = VodResumePlanner.movieTarget("movie:7", "Film", "http://h/movie/u/p/7.mp4", null)
        assertThat(resume!!.startPositionMillis).isEqualTo(40_000)
        assertThat(finished).isNull()
        assertThat(fresh!!.startPositionMillis).isEqualTo(0)
    }

    @Test
    fun `buffer grows when the link is tight and shrinks when it is comfortable`() {
        val tight = VodBufferMath.targetBufferMs(4_000_000, 4_000_000)
        val easy = VodBufferMath.targetBufferMs(12_000_000, 4_000_000)
        assertThat(tight).isEqualTo(VodPlaybackTuning.BUFFER_CEILING_MS)
        assertThat(easy).isEqualTo(VodPlaybackTuning.BUFFER_FLOOR_MS)
        val policy = VodBufferMath.policyFor(5_000_000, 4_000_000)
        assertThat(policy.maxMs).isAtMost(VodPlaybackTuning.BUFFER_CEILING_MS)
        assertThat(policy.maxMs).isAtLeast(VodPlaybackTuning.BUFFER_FLOOR_MS)
        assertThat(policy.minMs).isAtLeast(policy.forPlaybackMs)
        assertThat(policy.minMs).isAtLeast(policy.afterRebufferMs)
        assertThat(policy.maxMs).isAtLeast(policy.minMs)
    }

    @Test
    fun `live buffer is untouched by the vod tuning ceiling`() {
        val live = PlaybackBuffers.live()
        assertThat(live.minMs).isEqualTo(15_000)
        assertThat(live.maxMs).isEqualTo(60_000)
        assertThat(live.forPlaybackMs).isEqualTo(2_500)
        assertThat(VodPreloadGate.appliesTo(isLive = true)).isFalse()
        assertThat(VodPreloadGate.appliesTo(isLive = false)).isTrue()
        val vodMode = PlaybackBuffers.forMode(preview = false, dvr = false, liveRecording = false, vod = false)
        assertThat(vodMode).isEqualTo(live)
    }

    @Test
    fun `preload yields when playback buffer is low and skips a slow link`() {
        assertThat(VodPreloadGate.mayStart(null)).isTrue()
        assertThat(VodPreloadGate.mayStart(25_000)).isTrue()
        assertThat(VodPreloadGate.mayStart(5_000)).isFalse()
        assertThat(VodPreloadGate.mustPause(5_000)).isTrue()
        assertThat(VodPreloadGate.mustPause(null)).isFalse()
        assertThat(VodPreloadGate.bandwidthAllows(4_000_000, 4_000_000)).isFalse()
        assertThat(VodPreloadGate.bandwidthAllows(6_000_000, 4_000_000)).isTrue()
    }

    @Test
    fun `circuit breaker trips inside the window and then stays open`() {
        val breaker = RebufferBreaker(windowMs = 60_000, tripCount = 3)
        assertThat(breaker.onRebuffer(1_000)).isFalse()
        assertThat(breaker.onRebuffer(2_000)).isFalse()
        assertThat(breaker.onRebuffer(3_000)).isTrue()
        assertThat(breaker.tripped).isTrue()
        assertThat(breaker.onRebuffer(4_000)).isFalse()
        val later = RebufferBreaker(windowMs = 1_000, tripCount = 3)
        later.onRebuffer(0)
        later.onRebuffer(10)
        assertThat(later.onRebuffer(5_000)).isFalse()
        assertThat(later.tripped).isFalse()
    }

    @Test
    fun `failover skips the current url and ones already tried`() {
        val options = listOf(
            VodServerOption("HD", "http://a/hd"),
            VodServerOption("SD", "http://a/sd"),
            VodServerOption("addon", "http://b/x"),
        )
        assertThat(VodServerFailover.next("http://a/hd", options, emptySet())!!.url).isEqualTo("http://a/sd")
        assertThat(VodServerFailover.next("http://a/sd", options, setOf("http://a/hd"))!!.url).isEqualTo("http://b/x")
        assertThat(VodServerFailover.next("http://b/x", options, setOf("http://a/hd", "http://a/sd"))).isNull()
    }

    @Test
    fun `quality copies of one film become server options`() {
        val hd = movie(1, "The Godfather HD", "http://cdn-a.example/movie/u/p/1.mkv")
        val sd = movie(2, "The Godfather SD", "http://cdn-b.example/movie/u/p/2.mp4")
        val other = movie(3, "Heat", "http://cdn-a.example/movie/u/p/3.mp4")
        val options = movieServerOptions(hd, listOf(sd, other), listOf(VodServerOption("addon", "http://addon/x")))
        assertThat(options.map { it.url }).containsExactly(
            "http://cdn-a.example/movie/u/p/1.mkv",
            "http://cdn-b.example/movie/u/p/2.mp4",
            "http://addon/x",
        ).inOrder()
    }

    @Test
    fun `session log strips panel credentials`() {
        val server = VodStreamLog.describeServer("http://panel.example:8080/series/alice/s3cret/55.mkv")
        assertThat(server).doesNotContain("alice")
        assertThat(server).doesNotContain("s3cret")
        assertThat(server).contains("panel.example:8080")
        assertThat(server).contains("55.mkv")
        val file = File.createTempFile("vod-log", ".txt")
        val store = VodStreamLog.Store(file, maxBytes = 10_000)
        store.append(
            VodStreamLog.Event(1, "Show", "ep:5", server, 5_000_000, 2, "rebuffer"),
        )
        val text = file.readText()
        assertThat(text).contains("Show")
        assertThat(text).contains("5000000")
        assertThat(text).doesNotContain("s3cret")
    }

    @Test
    fun `probe reads the stream url itself and stops at the byte budget`() {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("x".repeat(2_000_000)).setResponseCode(200))
        server.start()
        try {
            val url = server.url("/movie/user/secret/9.mp4").toString()
            val sample = StreamThroughputProbe(OkHttpClient(), byteBudget = 32 * 1024).measure(url, "XTREAM-test")
            val recorded = server.takeRequest()
            assertThat(recorded.path).contains("/movie/user/secret/9.mp4")
            assertThat(recorded.getHeader("Range")).isEqualTo("bytes=0-${32 * 1024 - 1}")
            assertThat(sample).isNotNull()
            assertThat(sample!!.bytes).isAtMost(32 * 1024)
            assertThat(sample.bitsPerSecond).isGreaterThan(0)
        } finally {
            server.shutdown()
        }
    }

    private fun movie(id: Long, name: String, url: String) = Movie(
        id = id,
        sourceId = 1,
        streamId = id.toString(),
        name = name,
        categoryId = "1",
        posterUrl = null,
        rating = null,
        year = 1972,
        plot = null,
        durationSeconds = null,
        containerExtension = "mkv",
        streamUrl = url,
    )
}
