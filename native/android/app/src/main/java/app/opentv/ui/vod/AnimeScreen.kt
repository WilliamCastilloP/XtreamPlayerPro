/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.ui.vod

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import app.opentv.data.model.Channel
import app.opentv.data.model.Movie
import app.opentv.data.model.Series
import app.opentv.data.model.shownName
import app.opentv.data.parser.AnimeCatalog
import app.opentv.data.parser.AnimeFacet
import app.opentv.data.parser.AnimeHits
import app.opentv.data.parser.AnimeKind
import app.opentv.data.parser.AnimeSlide
import app.opentv.data.parser.displayTitle
import app.opentv.ui.VodViewModel
import app.opentv.ui.channels.OnScreenKeyboard
import app.opentv.ui.theme.CrunchyrollColors
import app.opentv.ui.theme.CrunchyrollTheme
import app.opentv.ui.theme.LocalShelfChrome
import coil.compose.AsyncImage
import kotlinx.coroutines.delay

private const val SAMPLE = 12
private const val SLIDE_MS = 10_000L

private sealed interface AnimeBrowse {
    data object Home : AnimeBrowse
    data object Movies : AnimeBrowse
    data object Series : AnimeBrowse
    data object Live : AnimeBrowse
    data class Category(val facet: AnimeFacet) : AnimeBrowse
    data class Year(val year: Int) : AnimeBrowse
    data class Genre(val token: String, val label: String) : AnimeBrowse
    data object Search : AnimeBrowse
}

/**
 * Anime tab. The home shows a sample of what the catalogue already has; categories, years and
 * genres open the rest, and search stays inside this tab. Recommendations are the carousel:
 * the current card and a peek of the next one. A click opens that title.
 */
@Composable
fun AnimeScreen(
    onOpenMovie: (Movie) -> Unit,
    onOpenSeries: (Series) -> Unit,
    onResume: (mediaKey: String, url: String, title: String) -> Unit,
    onPlayChannel: (Channel) -> Unit,
    hasSources: Boolean,
    isSyncing: Boolean,
    viewModel: VodViewModel = viewModel(),
) {
    val index by viewModel.animeIndex.collectAsState()
    val resume by viewModel.continueWatching.collectAsState()
    var animeKeys by remember { mutableStateOf<Set<String>>(emptySet()) }
    val moviesLoading by viewModel.moviesLoading.collectAsState()
    val seriesLoading by viewModel.seriesLoading.collectAsState()
    var browse by remember { mutableStateOf<AnimeBrowse>(AnimeBrowse.Home) }

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
    val loading = isSyncing || moviesLoading || seriesLoading

    BackHandler(enabled = browse !is AnimeBrowse.Home) { browse = AnimeBrowse.Home }

    CrunchyrollTheme {
        Column(Modifier.fillMaxSize().background(CrunchyrollColors.black)) {
            when (val page = browse) {
                AnimeBrowse.Home -> {
                    AnimeHeader(onSearch = { browse = AnimeBrowse.Search })
                    if (index.isEmpty && animeResume.isEmpty()) {
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
                    } else {
                        AnimeHomeFeed(
                            index = index,
                            resume = animeResume,
                            onOpenMovie = onOpenMovie,
                            onOpenSeries = onOpenSeries,
                            onResume = onResume,
                            onPlayChannel = onPlayChannel,
                            onBrowse = { browse = it },
                        )
                    }
                }
                AnimeBrowse.Search -> AnimeSearch(
                    index = index,
                    onOpenMovie = onOpenMovie,
                    onOpenSeries = onOpenSeries,
                    onPlayChannel = onPlayChannel,
                )
                else -> AnimeGrid(
                    title = page.title(),
                    cells = page.cells(index),
                    onOpenMovie = onOpenMovie,
                    onOpenSeries = onOpenSeries,
                    onPlayChannel = onPlayChannel,
                )
            }
        }
    }
}

@Composable
private fun AnimeBrowse.title(): String = when (this) {
    AnimeBrowse.Movies -> stringResource(R.string.nav_movies)
    AnimeBrowse.Series -> stringResource(R.string.nav_shows)
    AnimeBrowse.Live -> stringResource(R.string.nav_live_tv)
    is AnimeBrowse.Category -> facet.label
    is AnimeBrowse.Year -> year.toString()
    is AnimeBrowse.Genre -> label
    else -> stringResource(R.string.nav_anime)
}

private fun AnimeBrowse.cells(index: app.opentv.data.parser.AnimeIndex): List<AnimeCell> = when (this) {
    AnimeBrowse.Movies -> index.movies.map { AnimeCell.Film(it) }
    AnimeBrowse.Series -> index.series.map { AnimeCell.Show(it) }
    AnimeBrowse.Live -> index.channels.map { AnimeCell.Live(it) }
    is AnimeBrowse.Category -> when (facet.kind) {
        AnimeKind.MOVIE -> index.moviesIn(facet.key).map { AnimeCell.Film(it) }
        AnimeKind.SERIES -> index.seriesIn(facet.key).map { AnimeCell.Show(it) }
        AnimeKind.LIVE -> index.channelsIn(facet.key).map { AnimeCell.Live(it) }
    }
    is AnimeBrowse.Year -> mixed(
        films = index.moviesInYear(year),
        shows = index.seriesInYear(year),
    )
    is AnimeBrowse.Genre -> mixed(
        films = index.moviesInGenre(token),
        shows = index.seriesInGenre(token),
    )
    else -> emptyList()
}

private fun mixed(films: List<Movie>, shows: List<Series>): List<AnimeCell> = buildList {
    if (films.isNotEmpty()) {
        add(AnimeCell.Heading("movies"))
        addAll(films.map { AnimeCell.Film(it) })
    }
    if (shows.isNotEmpty()) {
        add(AnimeCell.Heading("series"))
        addAll(shows.map { AnimeCell.Show(it) })
    }
}

private sealed interface AnimeCell {
    data class Heading(val which: String) : AnimeCell
    data class Film(val movie: Movie) : AnimeCell
    data class Show(val series: Series) : AnimeCell
    data class Live(val channel: Channel) : AnimeCell
}

@Composable
private fun AnimeHeader(onSearch: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
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
            modifier = Modifier.weight(1f),
        )
        AnimeChip(stringResource(R.string.anime_search), onSearch)
    }
}

@Composable
private fun AnimeHomeFeed(
    index: app.opentv.data.parser.AnimeIndex,
    resume: List<VodViewModel.ResumeItem>,
    onOpenMovie: (Movie) -> Unit,
    onOpenSeries: (Series) -> Unit,
    onResume: (mediaKey: String, url: String, title: String) -> Unit,
    onPlayChannel: (Channel) -> Unit,
    onBrowse: (AnimeBrowse) -> Unit,
) {
    val movieSample = index.movies.take(SAMPLE)
    val seriesSample = index.series.take(SAMPLE)
    val liveSample = index.channels.take(SAMPLE)
    val categories = index.liveCategories + index.movieCategories + index.seriesCategories

    LazyColumn(
        contentPadding = PaddingValues(bottom = 36.dp),
        verticalArrangement = Arrangement.spacedBy(28.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        if (index.slides.isNotEmpty()) {
            item(key = "banner") {
                AnimeCarousel(index.slides) { slide ->
                    when (slide) {
                        is AnimeSlide.MovieSlide -> onOpenMovie(slide.movie)
                        is AnimeSlide.SeriesSlide -> onOpenSeries(slide.series)
                    }
                }
            }
        }
        if (resume.isNotEmpty()) {
            item(key = "cw") { ContinueWatchingRow(resume, onResume) }
        }
        if (categories.isNotEmpty()) {
            item(key = "cats") {
                FacetRow(stringResource(R.string.anime_categories), categories) { facet ->
                    onBrowse(AnimeBrowse.Category(facet))
                }
            }
        }
        if (index.years.isNotEmpty()) {
            item(key = "years") {
                FacetRow(stringResource(R.string.anime_years), index.years) { facet ->
                    facet.label.toIntOrNull()?.let { onBrowse(AnimeBrowse.Year(it)) }
                }
            }
        }
        if (index.genres.isNotEmpty()) {
            item(key = "genres") {
                FacetRow(stringResource(R.string.anime_genres), index.genres) { facet ->
                    onBrowse(AnimeBrowse.Genre(facet.key.removePrefix("genre:"), facet.label))
                }
            }
        }
        if (liveSample.isNotEmpty()) {
            item(key = "live") {
                ChannelRow(
                    title = stringResource(R.string.anime_live),
                    channels = liveSample,
                    seeAll = index.channels.size > SAMPLE,
                    onSeeAll = { onBrowse(AnimeBrowse.Live) },
                    onPlay = onPlayChannel,
                )
            }
        }
        if (movieSample.isNotEmpty()) {
            item(key = "movies") {
                Column {
                    SeeAllHeader(
                        stringResource(R.string.anime_featured),
                        index.movies.size > SAMPLE,
                    ) { onBrowse(AnimeBrowse.Movies) }
                    MoviePosterRow("", movieSample, onOpenMovie)
                }
            }
        }
        if (seriesSample.isNotEmpty()) {
            item(key = "series") {
                Column {
                    SeeAllHeader(
                        stringResource(R.string.anime_series),
                        index.series.size > SAMPLE,
                    ) { onBrowse(AnimeBrowse.Series) }
                    SeriesPosterRow("", seriesSample, onOpenSeries)
                }
            }
        }
    }
}

@Composable
private fun AnimeCarousel(slides: List<AnimeSlide>, onOpen: (AnimeSlide) -> Unit) {
    var page by remember { mutableIntStateOf(0) }
    val current = slides[page.coerceIn(slides.indices)]
    val upcoming = if (slides.size > 1) slides[(page + 1) % slides.size] else null
    var mainFocused by remember { mutableStateOf(false) }
    var peekFocused by remember { mutableStateOf(false) }
    val cardFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        runCatching { cardFocus.requestFocus() }
    }
    LaunchedEffect(page, slides.size, mainFocused, peekFocused) {
        if (mainFocused || peekFocused || slides.size <= 1) return@LaunchedEffect
        delay(SLIDE_MS)
        page = (page + 1) % slides.size
    }

    Row(
        Modifier
            .fillMaxWidth()
            .height(280.dp)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        CarouselCard(
            slide = current,
            showTitle = true,
            focusRequester = cardFocus,
            onFocused = { mainFocused = it },
            onClick = { onOpen(current) },
            modifier = Modifier.weight(1f).fillMaxHeight(),
        )
        if (upcoming != null) {
            CarouselCard(
                slide = upcoming,
                showTitle = false,
                onFocused = { peekFocused = it },
                onClick = { onOpen(upcoming) },
                modifier = Modifier.width(120.dp).fillMaxHeight(),
            )
        }
    }
}

@Composable
private fun CarouselCard(
    slide: AnimeSlide,
    showTitle: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
    onFocused: (Boolean) -> Unit = {},
) {
    var focused by remember { mutableStateOf(false) }
    Box(
        modifier
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .onFocusChanged {
                focused = it.isFocused
                onFocused(it.isFocused)
            }
            .clickable(onClick = onClick)
            .border(
                width = if (focused) 3.dp else 0.dp,
                color = if (focused) CrunchyrollColors.orange else Color.Transparent,
                shape = RoundedCornerShape(12.dp),
            )
            .clip(RoundedCornerShape(12.dp))
            .background(CrunchyrollColors.card),
    ) {
        if (slide.imageUrl != null) {
            AsyncImage(
                model = slide.imageUrl,
                contentDescription = slide.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (!showTitle) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)))
        } else {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            0f to Color.Transparent,
                            0.55f to Color.Black.copy(alpha = 0.2f),
                            1f to Color.Black.copy(alpha = 0.88f),
                        ),
                    ),
            )
            Text(
                slide.title,
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.align(Alignment.BottomStart).padding(20.dp),
            )
        }
    }
}

@Composable
private fun FacetRow(title: String, facets: List<AnimeFacet>, onOpen: (AnimeFacet) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        SectionHeader(title)
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(facets, key = { it.key }) { facet ->
                AnimeChip("${facet.label}  ${facet.count}") { onOpen(facet) }
            }
        }
    }
}

@Composable
private fun SeeAllHeader(title: String, seeAll: Boolean, onSeeAll: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (seeAll) {
            AnimeChip(stringResource(R.string.anime_see_all), onSeeAll)
        }
    }
}

@Composable
private fun ChannelRow(
    title: String,
    channels: List<Channel>,
    seeAll: Boolean,
    onSeeAll: () -> Unit,
    onPlay: (Channel) -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        SeeAllHeader(title, seeAll, onSeeAll)
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(channels, key = { it.id }) { channel ->
                ChannelCard(channel) { onPlay(channel) }
            }
        }
    }
}

@Composable
private fun ChannelCard(channel: Channel, rowWidth: Boolean = true, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val chrome = LocalShelfChrome.current
    Column(
        Modifier
            .then(if (rowWidth) Modifier.width(160.dp) else Modifier.fillMaxWidth())
            .onFocusChanged { focused = it.isFocused }
            .clickable(onClick = onClick),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(90.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(CrunchyrollColors.card)
                .border(
                    width = if (focused) 2.dp else 0.dp,
                    color = if (focused) chrome.focusFill else Color.Transparent,
                    shape = RoundedCornerShape(8.dp),
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (channel.logoUrl != null) {
                AsyncImage(
                    model = channel.logoUrl,
                    contentDescription = channel.shownName,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize().padding(8.dp),
                )
            }
        }
        Text(
            channel.shownName,
            color = if (focused) chrome.focusFill else Color.White,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 6.dp),
        )
    }
}

@Composable
private fun AnimeChip(label: String, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Text(
        label,
        color = if (focused) Color.White else CrunchyrollColors.orange,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .onFocusChanged { focused = it.isFocused }
            .clip(RoundedCornerShape(20.dp))
            .background(if (focused) CrunchyrollColors.orange else CrunchyrollColors.card)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

@Composable
private fun AnimeGrid(
    title: String,
    cells: List<AnimeCell>,
    onOpenMovie: (Movie) -> Unit,
    onOpenSeries: (Series) -> Unit,
    onPlayChannel: (Channel) -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Text(
            title,
            style = MaterialTheme.typography.headlineSmall,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
        )
        if (cells.isEmpty()) {
            EmptyVod(stringResource(R.string.anime_no_results), stringResource(R.string.anime_search_hint))
            return
        }
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 140.dp),
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            items(
                items = cells,
                key = { cell ->
                    when (cell) {
                        is AnimeCell.Heading -> "h-${cell.which}"
                        is AnimeCell.Film -> "m-${cell.movie.id}"
                        is AnimeCell.Show -> "s-${cell.series.id}"
                        is AnimeCell.Live -> "c-${cell.channel.id}"
                    }
                },
                span = { cell ->
                    if (cell is AnimeCell.Heading) GridItemSpan(maxLineSpan) else GridItemSpan(1)
                },
            ) { cell ->
                when (cell) {
                    is AnimeCell.Heading -> Text(
                        stringResource(
                            if (cell.which == "movies") R.string.nav_movies else R.string.nav_shows,
                        ),
                        style = MaterialTheme.typography.titleMedium,
                        color = CrunchyrollColors.orange,
                        fontWeight = FontWeight.SemiBold,
                    )
                    is AnimeCell.Film -> PosterCard(
                        title = cell.movie.displayTitle,
                        posterUrl = cell.movie.posterUrl,
                        subtitle = cell.movie.year?.toString(),
                        rating = cell.movie.rating,
                        favourite = cell.movie.favourite,
                        onClick = { onOpenMovie(cell.movie) },
                    )
                    is AnimeCell.Show -> PosterCard(
                        title = cell.series.displayTitle,
                        posterUrl = cell.series.posterUrl,
                        subtitle = cell.series.listedYear?.toString(),
                        rating = cell.series.rating,
                        favourite = cell.series.favourite,
                        newEpisodes = cell.series.hasNewEpisodes,
                        onClick = { onOpenSeries(cell.series) },
                    )
                    is AnimeCell.Live -> ChannelCard(cell.channel, rowWidth = false) { onPlayChannel(cell.channel) }
                }
            }
        }
    }
}

@Composable
private fun AnimeSearch(
    index: app.opentv.data.parser.AnimeIndex,
    onOpenMovie: (Movie) -> Unit,
    onOpenSeries: (Series) -> Unit,
    onPlayChannel: (Channel) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val hits = remember(index, query) { AnimeCatalog.search(index, query) }
    Column(
        Modifier
            .fillMaxSize()
            .padding(horizontal = 28.dp, vertical = 16.dp),
    ) {
        Text(
            query.ifEmpty { stringResource(R.string.anime_search_hint) },
            style = MaterialTheme.typography.titleLarge,
            color = if (query.isEmpty()) MaterialTheme.colorScheme.onSurfaceVariant
            else CrunchyrollColors.orange,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxSize()) {
            OnScreenKeyboard(
                onKey = { if (query.length < 40) query += it },
                onSpace = { if (query.length < 40) query += " " },
                onBackspace = { query = query.dropLast(1) },
                onClear = { query = "" },
            )
            Spacer(Modifier.width(28.dp))
            SearchHits(query, hits, onOpenMovie, onOpenSeries, onPlayChannel)
        }
    }
}

@Composable
private fun SearchHits(
    query: String,
    hits: AnimeHits,
    onOpenMovie: (Movie) -> Unit,
    onOpenSeries: (Series) -> Unit,
    onPlayChannel: (Channel) -> Unit,
) {
    when {
        query.isBlank() -> SearchHint(stringResource(R.string.anime_search_hint))
        query.trim().length < 2 -> SearchHint(stringResource(R.string.common_keep_typing))
        hits.isEmpty -> SearchHint(stringResource(R.string.search_no_results, query))
        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (hits.channels.isNotEmpty()) {
                item { HitHeader(stringResource(R.string.nav_live_tv)) }
                items(hits.channels, key = { "c${it.id}" }) { channel ->
                    HitRow(channel.shownName, channel.logoUrl) { onPlayChannel(channel) }
                }
            }
            if (hits.movies.isNotEmpty()) {
                item { HitHeader(stringResource(R.string.nav_movies)) }
                items(hits.movies, key = { "m${it.id}" }) { movie ->
                    HitRow(movie.displayTitle, movie.posterUrl, movie.year?.toString()) {
                        onOpenMovie(movie)
                    }
                }
            }
            if (hits.series.isNotEmpty()) {
                item { HitHeader(stringResource(R.string.nav_shows)) }
                items(hits.series, key = { "s${it.id}" }) { show ->
                    HitRow(show.displayTitle, show.posterUrl, show.listedYear?.toString()) {
                        onOpenSeries(show)
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchHint(text: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun HitHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleMedium,
        color = CrunchyrollColors.orange,
        modifier = Modifier.padding(top = 8.dp, bottom = 2.dp),
    )
}

@Composable
private fun HitRow(title: String, imageUrl: String?, subtitle: String? = null, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (focused) CrunchyrollColors.orange else CrunchyrollColors.card)
            .onFocusChanged { focused = it.isFocused }
            .clickable(onClick = onClick)
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(Color.Black),
        ) {
            if (imageUrl != null) {
                AsyncImage(
                    model = imageUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                title,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontWeight = FontWeight.SemiBold,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(subtitle, color = if (focused) Color.White else CrunchyrollColors.ring, maxLines = 1)
            }
        }
    }
}
