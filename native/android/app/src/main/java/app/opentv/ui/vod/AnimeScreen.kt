/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.ui.vod

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.opentv.R
import app.opentv.data.model.Movie
import app.opentv.data.model.Series
import app.opentv.data.parser.displayTitle
import app.opentv.ui.VodViewModel
import app.opentv.ui.theme.CrunchyrollColors
import app.opentv.ui.theme.CrunchyrollTheme
import app.opentv.ui.theme.LocalShelfChrome
import coil.compose.AsyncImage

/**
 * Anime shelf. Same catalogue and the same player as Movies and Shows; only the titles that
 * the provider filed as anime, drawn in the orange-on-black shelf.
 */
@Composable
fun AnimeScreen(
    onOpenMovie: (Movie) -> Unit,
    onOpenSeries: (Series) -> Unit,
    onResume: (mediaKey: String, url: String, title: String) -> Unit,
    hasSources: Boolean,
    isSyncing: Boolean,
    viewModel: VodViewModel = viewModel(),
) {
    val home by viewModel.animeHome.collectAsState()
    val resume by viewModel.continueWatching.collectAsState()
    var animeKeys by remember { mutableStateOf<Set<String>>(emptySet()) }
    val moviesLoading by viewModel.moviesLoading.collectAsState()
    val seriesLoading by viewModel.seriesLoading.collectAsState()

    LaunchedEffect(Unit) {
        if (hasSources) {
            viewModel.ensureMoviesLoaded()
            viewModel.ensureSeriesLoaded()
        }
    }
    LaunchedEffect(isSyncing, moviesLoading, seriesLoading) {
        viewModel.loadAnimeHome()
    }
    LaunchedEffect(resume) {
        animeKeys = viewModel.animeMediaKeys(resume.map { it.mediaKey })
    }

    val animeResume = remember(resume, animeKeys) { resume.filter { it.mediaKey in animeKeys } }
    val heroMovie = home.movies.firstOrNull()
    val heroSeries = if (heroMovie == null) home.series.firstOrNull() else null
    val hasRows = animeResume.isNotEmpty() || home.movies.isNotEmpty() ||
        home.series.isNotEmpty() || home.recommended.isNotEmpty()

    CrunchyrollTheme {
        Column(Modifier.fillMaxSize().background(CrunchyrollColors.black)) {
            Row(
                Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "ア",
                    color = CrunchyrollColors.orange,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Black,
                )
                Spacer(Modifier.size(10.dp))
                Text(
                    stringResource(R.string.nav_anime),
                    style = MaterialTheme.typography.headlineSmall,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                )
            }
            if (!hasRows) {
                val loading = isSyncing || moviesLoading || seriesLoading
                if (loading) {
                    LoadingVod(stringResource(R.string.vod_loading_shows))
                } else {
                    EmptyVod(
                        stringResource(R.string.anime_empty_title),
                        stringResource(
                            if (hasSources) R.string.anime_empty_body else R.string.vod_no_shows_add,
                        ),
                    )
                }
                return@Column
            }
            LazyColumn(
                contentPadding = PaddingValues(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                if (heroMovie != null || heroSeries != null) {
                    item(key = "hero") {
                        AnimeHero(
                            title = heroMovie?.displayTitle ?: heroSeries?.displayTitle.orEmpty(),
                            imageUrl = heroMovie?.backdropUrl ?: heroMovie?.posterUrl
                                ?: heroSeries?.backdropUrl ?: heroSeries?.posterUrl,
                            onPlay = {
                                when {
                                    heroMovie != null -> onOpenMovie(heroMovie)
                                    heroSeries != null -> onOpenSeries(heroSeries)
                                }
                            },
                        )
                    }
                }
                if (animeResume.isNotEmpty()) {
                    item(key = "cw") { ContinueWatchingRow(animeResume, onResume) }
                }
                if (home.movies.isNotEmpty()) {
                    item(key = "movies") {
                        MoviePosterRow(
                            stringResource(R.string.anime_featured),
                            home.movies,
                            onOpenMovie,
                        )
                    }
                }
                if (home.series.isNotEmpty()) {
                    item(key = "series") {
                        SeriesPosterRow(
                            stringResource(R.string.anime_series),
                            home.series,
                            onOpenSeries,
                        )
                    }
                }
                if (home.recommended.isNotEmpty()) {
                    item(key = "rec") {
                        SeriesPosterRow(
                            stringResource(R.string.anime_recommended),
                            home.recommended,
                            onOpenSeries,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AnimeHero(title: String, imageUrl: String?, onPlay: () -> Unit) {
    val playFocus = remember { FocusRequester() }
    var focused by remember { mutableStateOf(false) }
    val chrome = LocalShelfChrome.current
    LaunchedEffect(title) {
        runCatching { playFocus.requestFocus() }
    }
    Box(
        Modifier
            .fillMaxWidth()
            .height(300.dp)
            .padding(horizontal = 16.dp)
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
            .background(CrunchyrollColors.card),
    ) {
        if (imageUrl != null) {
            AsyncImage(
                model = imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        0.55f to Color.Black.copy(alpha = 0.25f),
                        1f to Color.Black.copy(alpha = 0.92f),
                    ),
                ),
        )
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .padding(20.dp),
        ) {
            Text(
                title,
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(12.dp))
            Box(
                Modifier
                    .size(52.dp)
                    .focusRequester(playFocus)
                    .onFocusChanged { focused = it.isFocused }
                    .clip(CircleShape)
                    .background(if (focused) Color.White else CrunchyrollColors.orange)
                    .clickable(onClick = onPlay),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.PlayArrow,
                    contentDescription = stringResource(R.string.vod_watch_now),
                    tint = if (focused) chrome.focusFill else Color.White,
                    modifier = Modifier.size(32.dp),
                )
            }
        }
    }
}
