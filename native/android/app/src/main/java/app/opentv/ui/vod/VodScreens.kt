/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.ui.vod

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.opentv.R
import app.opentv.data.model.Movie
import app.opentv.data.model.Series
import app.opentv.data.model.Source
import app.opentv.data.parser.displayTitle
import app.opentv.ui.VodBrowse
import app.opentv.ui.VodViewModel
import app.opentv.data.repo.GenreGroup
import app.opentv.ui.theme.XtreamFocus
import coil.compose.AsyncImage
import kotlinx.coroutines.delay

/**
 * Movies: a modern, row-based home — Continue Watching, Recommended, Recently added and a row per
 * genre, each a horizontally-scrolling shelf of poster cards. A category chip strip along the top
 * keeps whole-category browsing one press away without a permanent rail eating the width. Clicking
 * a film opens its detail page rather than playing straight away, the streaming-app convention.
 */
@Composable
fun MoviesScreen(
    onOpenMovie: (Movie) -> Unit,
    onResume: (mediaKey: String, url: String, title: String) -> Unit,
    onOpenSearch: () -> Unit,
    hasSources: Boolean,
    isSyncing: Boolean,
    viewModel: VodViewModel = viewModel(),
) {
    val categories by viewModel.movieCategories.collectAsState()
    val resume by viewModel.continueWatching.collectAsState()
    val recommended by viewModel.recommendedMovies.collectAsState()
    val recentlyAdded by viewModel.recentlyAddedMovies.collectAsState()
    val genreRows by viewModel.movieGenreRows.collectAsState()
    val categoryMovies by viewModel.movies.collectAsState()
    val vodLoading by viewModel.moviesLoading.collectAsState()
    val sources by viewModel.sources.collectAsState()
    val selectedSource by viewModel.selectedVodSource.collectAsState()
    val favouriteMoviesRaw by viewModel.favouriteMovies.collectAsState()
    val favouriteMovies = remember(favouriteMoviesRaw, selectedSource) {
        if (selectedSource == null) favouriteMoviesRaw else favouriteMoviesRaw.filter { it.sourceId == selectedSource }
    }
    val browse by viewModel.movieBrowse.collectAsState()
    val returnId by viewModel.movieReturnId.collectAsState()

    // Pull the movie library the first time this tab is opened — movies only, never series.
    LaunchedEffect(Unit) {
        if (hasSources) viewModel.ensureMoviesLoaded()
        viewModel.loadMovieHomeFeeds()
    }

    BackHandler(enabled = browse !is VodBrowse.Home) {
        viewModel.setMovieBrowse(VodBrowse.Home)
    }

    val hasContent = resume.isNotEmpty() || favouriteMovies.isNotEmpty() ||
        recommended.isNotEmpty() || recentlyAdded.isNotEmpty() || genreRows.isNotEmpty()

    Column(Modifier.fillMaxSize()) {
        SearchAffordance(onOpenSearch, allowFocus = returnId == null)
        if (sources.size > 1) {
            ProviderChips(
                sources = sources,
                selected = selectedSource,
                allowFocus = returnId == null,
                onSelectAll = { viewModel.setMovieBrowse(VodBrowse.Home); viewModel.selectVodSource(null) },
                onSelectSource = { id -> viewModel.setMovieBrowse(VodBrowse.Home); viewModel.selectVodSource(id) },
            )
        }
        CategoryChips(
            entries = categories.map { it.id to it.name },
            homeSelected = browse is VodBrowse.Home,
            favouritesSelected = browse is VodBrowse.Favourites,
            selectedCategoryId = (browse as? VodBrowse.Category)?.id,
            allowFocus = returnId == null,
            onSelectHome = { viewModel.setMovieBrowse(VodBrowse.Home) },
            onSelectFavourites = { viewModel.setMovieBrowse(VodBrowse.Favourites) },
            onSelectCategory = { id -> viewModel.setMovieBrowse(VodBrowse.Category(id)) },
        )
        // Weighted so the shelves fill the space under the fixed search + chips header, exactly and
        // unambiguously — the same reason Live TV weights its guide grid.
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (browse) {
                is VodBrowse.Favourites -> when {
                    favouriteMovies.isNotEmpty() -> MovieCategoryGrid(favouriteMovies, viewModel, onOpenMovie)
                    else -> EmptyVod(
                        stringResource(R.string.guide_no_favourites_title),
                        stringResource(R.string.vod_no_favourites_movies_desc),
                    )
                }
                is VodBrowse.Category -> MovieCategoryGrid(categoryMovies, viewModel, onOpenMovie)
                VodBrowse.Home -> when {
                    !hasContent -> when {
                        vodLoading || isSyncing -> LoadingVod(stringResource(R.string.vod_loading_movies))
                        hasSources -> EmptyVod(stringResource(R.string.vod_no_movies), stringResource(R.string.vod_no_movies_provider))
                        else -> EmptyVod(stringResource(R.string.vod_no_movies), stringResource(R.string.vod_no_movies_add))
                    }
                    else -> {
                        val homeState = rememberLazyListState()
                        val restoreFocus = remember { FocusRequester() }
                        val restoreKey = movieHomeRestoreKey(returnId, favouriteMovies, recommended, recentlyAdded, genreRows)
                        LaunchedEffect(returnId, restoreKey) {
                            val id = returnId ?: return@LaunchedEffect
                            val index = movieHomeIndex(id, resume.isNotEmpty(), favouriteMovies, recommended, recentlyAdded, genreRows)
                            if (index >= 0) homeState.scrollToItem(index)
                            restoreFocus.focusWhenAttached()
                            viewModel.clearMovieReturnFocus()
                        }
                        LazyColumn(
                        state = homeState,
                        contentPadding = PaddingValues(vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        if (resume.isNotEmpty()) item(key = "cw") { ContinueWatchingRow(resume, onResume) }
                        if (favouriteMovies.isNotEmpty()) item(key = "favs") {
                            MoviePosterRow(
                                stringResource(R.string.guide_favourites),
                                favouriteMovies,
                                { movie -> viewModel.markMovieOpened(movie.id); onOpenMovie(movie) },
                                restoreId = if (restoreKey == "favs") returnId else null,
                                restoreFocus = restoreFocus,
                            )
                        }
                        if (recommended.isNotEmpty()) item(key = "rec") {
                            MoviePosterRow(
                                stringResource(R.string.vod_recommended),
                                recommended,
                                { movie -> viewModel.markMovieOpened(movie.id); onOpenMovie(movie) },
                                restoreId = if (restoreKey == "rec") returnId else null,
                                restoreFocus = restoreFocus,
                            )
                        }
                        if (recentlyAdded.isNotEmpty()) item(key = "recent") {
                            MoviePosterRow(
                                stringResource(R.string.vod_recently_added),
                                recentlyAdded,
                                { movie -> viewModel.markMovieOpened(movie.id); onOpenMovie(movie) },
                                restoreId = if (restoreKey == "recent") returnId else null,
                                restoreFocus = restoreFocus,
                            )
                        }
                        items(genreRows, key = { "g:${it.genre}" }) { group ->
                            MoviePosterRow(
                                group.genre,
                                group.items,
                                { movie -> viewModel.markMovieOpened(movie.id); onOpenMovie(movie) },
                                restoreId = if (restoreKey == "g:${group.genre}") returnId else null,
                                restoreFocus = restoreFocus,
                            )
                        }
                    }
                    }
                }
            }
        }
    }
}

/**
 * Shows: the same row-based home as Movies (Continue Watching, Recently added, genre rows) with the
 * category chip strip for whole-category browsing. A show opens its detail page — where episodes are
 * fetched on demand, since pulling every episode of every series up front is what makes a first sync
 * take forever.
 */
@Composable
fun SeriesScreen(
    onOpenSeries: (Series) -> Unit,
    onResume: (mediaKey: String, url: String, title: String) -> Unit,
    onOpenSearch: () -> Unit,
    hasSources: Boolean,
    isSyncing: Boolean,
    viewModel: VodViewModel = viewModel(),
) {
    val categories by viewModel.seriesCategories.collectAsState()
    val resume by viewModel.continueWatching.collectAsState()
    val recentlyAdded by viewModel.recentlyAddedSeries.collectAsState()
    val genreRows by viewModel.seriesGenreRows.collectAsState()
    val categorySeries by viewModel.series.collectAsState()
    val vodLoading by viewModel.seriesLoading.collectAsState()
    val sources by viewModel.sources.collectAsState()
    val selectedSource by viewModel.selectedVodSource.collectAsState()
    val favouriteSeriesRaw by viewModel.favouriteSeries.collectAsState()
    val favouriteSeries = remember(favouriteSeriesRaw, selectedSource) {
        if (selectedSource == null) favouriteSeriesRaw else favouriteSeriesRaw.filter { it.sourceId == selectedSource }
    }
    val browse by viewModel.seriesBrowse.collectAsState()
    val returnId by viewModel.seriesReturnId.collectAsState()

    LaunchedEffect(Unit) {
        if (hasSources) viewModel.ensureSeriesLoaded()
        viewModel.loadSeriesHomeFeeds()
    }

    BackHandler(enabled = browse !is VodBrowse.Home) {
        viewModel.setSeriesBrowse(VodBrowse.Home)
    }

    val hasContent = resume.isNotEmpty() || favouriteSeries.isNotEmpty() ||
        recentlyAdded.isNotEmpty() || genreRows.isNotEmpty()

    Column(Modifier.fillMaxSize()) {
        SearchAffordance(onOpenSearch, allowFocus = returnId == null)
        if (sources.size > 1) {
            ProviderChips(
                sources = sources,
                selected = selectedSource,
                allowFocus = returnId == null,
                onSelectAll = { viewModel.setSeriesBrowse(VodBrowse.Home); viewModel.selectVodSource(null) },
                onSelectSource = { id -> viewModel.setSeriesBrowse(VodBrowse.Home); viewModel.selectVodSource(id) },
            )
        }
        CategoryChips(
            entries = categories.map { it.id to it.name },
            homeSelected = browse is VodBrowse.Home,
            favouritesSelected = browse is VodBrowse.Favourites,
            selectedCategoryId = (browse as? VodBrowse.Category)?.id,
            allowFocus = returnId == null,
            onSelectHome = { viewModel.setSeriesBrowse(VodBrowse.Home) },
            onSelectFavourites = { viewModel.setSeriesBrowse(VodBrowse.Favourites) },
            onSelectCategory = { id -> viewModel.setSeriesBrowse(VodBrowse.Category(id)) },
        )
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (browse) {
                is VodBrowse.Favourites -> when {
                    favouriteSeries.isNotEmpty() -> SeriesCategoryGrid(favouriteSeries, viewModel, onOpenSeries)
                    else -> EmptyVod(
                        stringResource(R.string.guide_no_favourites_title),
                        stringResource(R.string.vod_no_favourites_shows_desc),
                    )
                }
                is VodBrowse.Category -> SeriesCategoryGrid(categorySeries, viewModel, onOpenSeries)
                VodBrowse.Home -> when {
                    !hasContent -> when {
                        vodLoading || isSyncing -> LoadingVod(stringResource(R.string.vod_loading_shows))
                        hasSources -> EmptyVod(stringResource(R.string.vod_no_shows), stringResource(R.string.vod_no_shows_provider))
                        else -> EmptyVod(stringResource(R.string.vod_no_shows), stringResource(R.string.vod_no_shows_add))
                    }
                    else -> {
                        val homeState = rememberLazyListState()
                        val restoreFocus = remember { FocusRequester() }
                        val restoreKey = seriesHomeRestoreKey(returnId, favouriteSeries, recentlyAdded, genreRows)
                        LaunchedEffect(returnId, restoreKey) {
                            val id = returnId ?: return@LaunchedEffect
                            val index = seriesHomeIndex(id, resume.isNotEmpty(), favouriteSeries, recentlyAdded, genreRows)
                            if (index >= 0) homeState.scrollToItem(index)
                            restoreFocus.focusWhenAttached()
                            viewModel.clearSeriesReturnFocus()
                        }
                        LazyColumn(
                        state = homeState,
                        contentPadding = PaddingValues(vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        if (resume.isNotEmpty()) item(key = "cw") { ContinueWatchingRow(resume, onResume) }
                        if (favouriteSeries.isNotEmpty()) item(key = "favs") {
                            SeriesPosterRow(
                                stringResource(R.string.guide_favourites),
                                favouriteSeries,
                                { show -> viewModel.markSeriesOpened(show.id); onOpenSeries(show) },
                                restoreId = if (restoreKey == "favs") returnId else null,
                                restoreFocus = restoreFocus,
                            )
                        }
                        if (recentlyAdded.isNotEmpty()) item(key = "recent") {
                            SeriesPosterRow(
                                stringResource(R.string.vod_recently_added),
                                recentlyAdded,
                                { show -> viewModel.markSeriesOpened(show.id); onOpenSeries(show) },
                                restoreId = if (restoreKey == "recent") returnId else null,
                                restoreFocus = restoreFocus,
                            )
                        }
                        items(genreRows, key = { "g:${it.genre}" }) { group ->
                            SeriesPosterRow(
                                group.genre,
                                group.items,
                                { show -> viewModel.markSeriesOpened(show.id); onOpenSeries(show) },
                                restoreId = if (restoreKey == "g:${group.genre}") returnId else null,
                                restoreFocus = restoreFocus,
                            )
                        }
                    }
                    }
                }
            }
        }
    }
}

// ---- Whole-category browse grids ---------------------------------------------------------------

/** One category's films as a poster grid. Quality variants collapse to one card, badged. */
@Composable
private fun MovieCategoryGrid(movies: List<Movie>, viewModel: VodViewModel, onOpenMovie: (Movie) -> Unit) {
    if (movies.isEmpty()) { LoadingVod(stringResource(R.string.vod_loading_movies)); return }
    val groups = remember(movies) { viewModel.collapseVariants(movies) }
    val returnId by viewModel.movieReturnId.collectAsState()
    val gridState = rememberLazyGridState()
    val restoreFocus = remember { FocusRequester() }
    LaunchedEffect(returnId, groups) {
        val id = returnId ?: return@LaunchedEffect
        val index = groups.indexOfFirst { it.primary.id == id }
        if (index >= 0) gridState.scrollToItem(index)
        restoreFocus.focusWhenAttached()
        viewModel.clearMovieReturnFocus()
    }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 140.dp),
        state = gridState,
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        gridItems(groups, key = { it.primary.id }) { group ->
            val quality = group.variants.firstOrNull()?.qualityLabel?.takeIf { it.isNotBlank() }
            val badge = quality
                ?: if (group.hasMultipleQualities) {
                    stringResource(R.string.guide_qualities_count, group.variants.size)
                } else {
                    null
                }
            PosterCard(
                title = group.primary.displayTitle,
                posterUrl = group.primary.posterUrl,
                subtitle = group.primary.year?.toString(),
                rating = group.primary.rating,
                qualityBadge = badge,
                favourite = group.primary.favourite,
                modifier = if (group.primary.id == returnId) Modifier.focusRequester(restoreFocus) else Modifier,
                onClick = {
                    viewModel.markMovieOpened(group.primary.id)
                    onOpenMovie(group.primary)
                },
            )
        }
    }
}

/** One category's shows as a poster grid, newest release year first. */
@Composable
private fun SeriesCategoryGrid(series: List<Series>, viewModel: VodViewModel, onOpenSeries: (Series) -> Unit) {
    if (series.isEmpty()) { LoadingVod(stringResource(R.string.vod_loading_shows)); return }
    val returnId by viewModel.seriesReturnId.collectAsState()
    val gridState = rememberLazyGridState()
    val restoreFocus = remember { FocusRequester() }
    LaunchedEffect(returnId, series) {
        val id = returnId ?: return@LaunchedEffect
        val index = series.indexOfFirst { it.id == id }
        if (index >= 0) gridState.scrollToItem(index)
        restoreFocus.focusWhenAttached()
        viewModel.clearSeriesReturnFocus()
    }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 140.dp),
        state = gridState,
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        gridItems(series, key = { it.id }) { item ->
            PosterCard(
                title = item.displayTitle,
                posterUrl = item.posterUrl,
                subtitle = item.year?.toString(),
                rating = item.rating,
                favourite = item.favourite,
                modifier = if (item.id == returnId) Modifier.focusRequester(restoreFocus) else Modifier,
                onClick = {
                    viewModel.markSeriesOpened(item.id)
                    onOpenSeries(item)
                },
            )
        }
    }
}

// ---- Shared shelves ----------------------------------------------------------------------------

/** A titled horizontal shelf of movie poster cards. Shared by the home and the detail's "more like this". */
@Composable
internal fun MoviePosterRow(
    title: String,
    movies: List<Movie>,
    onOpenMovie: (Movie) -> Unit,
    restoreId: Long? = null,
    restoreFocus: FocusRequester? = null,
) {
    Column(Modifier.fillMaxWidth()) {
        SectionHeader(title)
        val rowState = rememberLazyListState()
        LaunchedEffect(restoreId, movies) {
            val id = restoreId ?: return@LaunchedEffect
            val index = movies.indexOfFirst { it.id == id }
            if (index >= 0) rowState.scrollToItem(index)
        }
        LazyRow(
            state = rowState,
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(movies, key = { it.id }) { movie ->
                PosterCard(
                    title = movie.displayTitle,
                    posterUrl = movie.posterUrl,
                    subtitle = movie.year?.toString(),
                    rating = movie.rating,
                    favourite = movie.favourite,
                    modifier = if (movie.id == restoreId && restoreFocus != null) {
                        Modifier.focusRequester(restoreFocus)
                    } else {
                        Modifier
                    },
                    onClick = { onOpenMovie(movie) },
                )
            }
        }
    }
}

/** A titled horizontal shelf of series poster cards. */
@Composable
internal fun SeriesPosterRow(
    title: String,
    series: List<Series>,
    onOpenSeries: (Series) -> Unit,
    restoreId: Long? = null,
    restoreFocus: FocusRequester? = null,
) {
    Column(Modifier.fillMaxWidth()) {
        SectionHeader(title)
        val rowState = rememberLazyListState()
        LaunchedEffect(restoreId, series) {
            val id = restoreId ?: return@LaunchedEffect
            val index = series.indexOfFirst { it.id == id }
            if (index >= 0) rowState.scrollToItem(index)
        }
        LazyRow(
            state = rowState,
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(series, key = { it.id }) { item ->
                PosterCard(
                    title = item.displayTitle,
                    posterUrl = item.posterUrl,
                    subtitle = item.year?.toString(),
                    rating = item.rating,
                    favourite = item.favourite,
                    modifier = if (item.id == restoreId && restoreFocus != null) {
                        Modifier.focusRequester(restoreFocus)
                    } else {
                        Modifier
                    },
                    onClick = { onOpenSeries(item) },
                )
            }
        }
    }
}

@Composable
internal fun SectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurface,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 4.dp),
    )
}

/**
 * The reusable poster card: art, title and an optional year, with a rating chip, a quality badge and
 * a resume progress bar drawn over the art where the data is there. The focused card scales up and
 * gains a primary border — the app's established focus cue — and, being focusable, the lazy row
 * brings it into view on its own.
 */
@Composable
internal fun PosterCard(
    title: String,
    posterUrl: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    rating: Double? = null,
    qualityBadge: String? = null,
    progress: Float? = null,
    favourite: Boolean = false,
) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (focused) 1.06f else 1f, label = "posterScale")
    Column(
        modifier
            .width(POSTER_WIDTH)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .onFocusChanged { focused = it.isFocused }
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(4.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .then(
                    if (focused) Modifier.border(4.dp, XtreamFocus.fill, RoundedCornerShape(8.dp))
                    else Modifier,
                ),
        ) {
            AsyncImage(
                model = posterUrl,
                contentDescription = title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            rating?.takeIf { it > 0.0 }?.let {
                Badge(
                    text = "★ ${formatRating(it)}",
                    modifier = Modifier.align(Alignment.BottomStart).padding(6.dp),
                )
            }
            if (favourite) {
                Badge(
                    text = "★",
                    highlight = true,
                    modifier = Modifier.align(Alignment.TopStart).padding(6.dp),
                )
            }
            qualityBadge?.let {
                Badge(
                    text = it,
                    highlight = true,
                    modifier = Modifier.align(Alignment.TopEnd).padding(6.dp),
                )
            }
            progress?.let {
                LinearProgressIndicator(
                    progress = { it },
                    modifier = Modifier.fillMaxWidth().height(4.dp).align(Alignment.BottomCenter),
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            title,
            style = MaterialTheme.typography.bodyMedium,
            color = if (focused) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        subtitle?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
    }
}

/** A small rounded chip drawn over poster art — a rating or a quality label. */
@Composable
private fun Badge(text: String, modifier: Modifier = Modifier, highlight: Boolean = false) {
    val bg = if (highlight) MaterialTheme.colorScheme.primary
    else androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.66f)
    val fg = if (highlight) MaterialTheme.colorScheme.onPrimary else androidx.compose.ui.graphics.Color.White
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = fg,
        maxLines = 1,
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bg)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

// ---- Continue watching -------------------------------------------------------------------------

@Composable
internal fun ContinueWatchingRow(
    items: List<VodViewModel.ResumeItem>,
    onResume: (mediaKey: String, url: String, title: String) -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        SectionHeader(stringResource(R.string.vod_continue_watching))
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(items, key = { it.mediaKey }) { item ->
                ResumeCard(item) { onResume(item.mediaKey, item.streamUrl, item.title) }
            }
        }
    }
}

/** A landscape resume thumbnail with a progress fill — a movie or an episode part-way through. */
@Composable
private fun ResumeCard(item: VodViewModel.ResumeItem, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (focused) 1.06f else 1f, label = "resumeScale")
    Column(
        Modifier
            .width(190.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .onFocusChanged { focused = it.isFocused }
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(4.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(107.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .then(
                    if (focused) Modifier.border(4.dp, XtreamFocus.fill, RoundedCornerShape(6.dp))
                    else Modifier,
                ),
        ) {
            AsyncImage(
                model = item.posterUrl,
                contentDescription = item.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            LinearProgressIndicator(
                progress = { item.progress },
                modifier = Modifier.fillMaxWidth().height(4.dp).align(Alignment.BottomStart),
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            item.title,
            style = MaterialTheme.typography.bodyMedium,
            color = if (focused) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ---- Category chips ----------------------------------------------------------------------------

/**
 * A horizontal chip strip along the top of the home: an "All" chip returns to the curated rows, and
 * each following chip opens that category's full grid. Keeps whole-category browsing reachable on a
 * d-pad without a permanent side rail taking the width.
 */
@Composable
private fun CategoryChips(
    entries: List<Pair<String, String>>,
    homeSelected: Boolean,
    favouritesSelected: Boolean,
    selectedCategoryId: String?,
    allowFocus: Boolean = true,
    onSelectHome: () -> Unit,
    onSelectFavourites: () -> Unit,
    onSelectCategory: (String) -> Unit,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        item(key = "label") {
            Text(
                stringResource(R.string.vod_categories),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(end = 4.dp),
            )
        }
        item(key = "all") { Chip(stringResource(R.string.vod_all), homeSelected, onSelectHome, allowFocus) }
        item(key = "favs") {
            Chip(stringResource(R.string.guide_favourites), favouritesSelected, onSelectFavourites, allowFocus)
        }
        items(entries, key = { it.first }) { (id, name) ->
            Chip(name, selectedCategoryId == id, { onSelectCategory(id) }, allowFocus)
        }
    }
}

/**
 * A provider filter above the category chips, shown only when more than one source is configured —
 * pick a provider to browse just its Movies/Shows categories, or "All sources" to fold them.
 */
@Composable
private fun ProviderChips(
    sources: List<Source>,
    selected: Long?,
    allowFocus: Boolean = true,
    onSelectAll: () -> Unit,
    onSelectSource: (Long) -> Unit,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        item(key = "plabel") {
            Text(
                stringResource(R.string.channels_manager_source_header),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(end = 4.dp),
            )
        }
        item(key = "pall") {
            Chip(stringResource(R.string.channels_manager_all_sources), selected == null, onSelectAll, allowFocus)
        }
        items(sources, key = { it.id }) { source ->
            Chip(source.name, selected == source.id, { onSelectSource(source.id) }, allowFocus)
        }
    }
}

@Composable
private fun Chip(label: String, selected: Boolean, onClick: () -> Unit, allowFocus: Boolean = true) {
    var focused by remember { mutableStateOf(false) }
    val bg = when {
        focused -> XtreamFocus.fill
        selected -> MaterialTheme.colorScheme.primaryContainer
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val fg = when {
        focused -> XtreamFocus.onFill
        selected -> MaterialTheme.colorScheme.onPrimaryContainer
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Text(
        label,
        style = MaterialTheme.typography.labelLarge,
        color = fg,
        maxLines = 1,
        modifier = Modifier
            .onFocusChanged { focused = it.isFocused }
            .focusProperties { canFocus = allowFocus }
            .clip(RoundedCornerShape(20.dp))
            .background(bg)
            .then(
                if (focused) Modifier.border(2.dp, XtreamFocus.ring, RoundedCornerShape(20.dp))
                else Modifier,
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

// ---- Search / loading / empty ------------------------------------------------------------------

/**
 * The search entry at the top of the Movies and Shows home. The rail's global search already covers
 * movies and series; this makes it reachable without leaving the tab. Focusable for d-pad on TV and
 * tappable on touch, it just opens the existing search screen.
 */
@Composable
private fun SearchAffordance(onOpenSearch: () -> Unit, allowFocus: Boolean = true) {
    var focused by remember { mutableStateOf(false) }
    Row(
        Modifier
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(if (focused) XtreamFocus.fill else MaterialTheme.colorScheme.surfaceVariant)
            .onFocusChanged { focused = it.isFocused }
            .focusProperties { canFocus = allowFocus }
            .clickable(onClick = onOpenSearch)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val tint = if (focused) XtreamFocus.onFill else MaterialTheme.colorScheme.onSurfaceVariant
        Icon(Icons.Filled.Search, contentDescription = null, tint = tint)
        Spacer(Modifier.width(12.dp))
        Text(
            stringResource(R.string.vod_search_hint),
            style = MaterialTheme.typography.titleMedium,
            color = tint,
        )
    }
}

@Composable
private fun EmptyVod(title: String, body: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun LoadingVod(message: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Spacer(Modifier.height(16.dp))
            Text(message, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.vod_large_provider_note),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * Ask for focus until the poster is in the tree. This Compose version's [FocusRequester.requestFocus]
 * throws while the lazy item is still off-screen and returns [Unit] once the node is attached.
 */
private suspend fun FocusRequester.focusWhenAttached(attempts: Int = 24) {
    repeat(attempts) {
        delay(50)
        if (runCatching { requestFocus() }.isSuccess) return
    }
}

/** Poster shelf card width; the grid uses an adaptive min size close to this. */
private val POSTER_WIDTH = 140.dp

private fun movieHomeRestoreKey(
    id: Long?,
    favourites: List<Movie>,
    recommended: List<Movie>,
    recent: List<Movie>,
    genres: List<GenreGroup<Movie>>,
): String? {
    if (id == null) return null
    if (favourites.any { it.id == id }) return "favs"
    if (recommended.any { it.id == id }) return "rec"
    if (recent.any { it.id == id }) return "recent"
    return genres.firstOrNull { group -> group.items.any { it.id == id } }?.let { "g:${it.genre}" }
}

private fun movieHomeIndex(
    id: Long,
    hasResume: Boolean,
    favourites: List<Movie>,
    recommended: List<Movie>,
    recent: List<Movie>,
    genres: List<GenreGroup<Movie>>,
): Int {
    var index = if (hasResume) 1 else 0
    if (favourites.isNotEmpty()) {
        if (favourites.any { it.id == id }) return index
        index++
    }
    if (recommended.isNotEmpty()) {
        if (recommended.any { it.id == id }) return index
        index++
    }
    if (recent.isNotEmpty()) {
        if (recent.any { it.id == id }) return index
        index++
    }
    for (group in genres) {
        if (group.items.any { it.id == id }) return index
        index++
    }
    return -1
}

private fun seriesHomeRestoreKey(
    id: Long?,
    favourites: List<Series>,
    recent: List<Series>,
    genres: List<GenreGroup<Series>>,
): String? {
    if (id == null) return null
    if (favourites.any { it.id == id }) return "favs"
    if (recent.any { it.id == id }) return "recent"
    return genres.firstOrNull { group -> group.items.any { it.id == id } }?.let { "g:${it.genre}" }
}

private fun seriesHomeIndex(
    id: Long,
    hasResume: Boolean,
    favourites: List<Series>,
    recent: List<Series>,
    genres: List<GenreGroup<Series>>,
): Int {
    var index = if (hasResume) 1 else 0
    if (favourites.isNotEmpty()) {
        if (favourites.any { it.id == id }) return index
        index++
    }
    if (recent.isNotEmpty()) {
        if (recent.any { it.id == id }) return index
        index++
    }
    for (group in genres) {
        if (group.items.any { it.id == id }) return index
        index++
    }
    return -1
}

/** Rating to one decimal place, locale-independent (the "★" is drawn beside it). */
internal fun formatRating(rating: Double): String = String.format(java.util.Locale.US, "%.1f", rating)
