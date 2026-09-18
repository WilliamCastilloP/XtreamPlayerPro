/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.update

import android.app.Application
import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import app.opentv.BuildConfig
import app.opentv.R
import app.opentv.core.ServiceLocator
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The one-line entry point: drop [UpdateGate] into the top-level layout and a sideloaded
 * install will notice and offer its own updates. It renders nothing until there is something
 * to say, so it is safe to place unconditionally over the whole app.
 *
 * The install is an upgrade in place — same package id, higher versionCode — so providers,
 * favourites and history stay on the Stick. Never uninstall to take an update.
 */
@Composable
fun UpdateGate(viewModel: UpdateViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()
    val primaryFocus = remember { FocusRequester() }

    when (val s = state) {
        UpdateUiState.Idle -> Unit

        is UpdateUiState.Available -> {
            LaunchedEffect(s.update.versionName) { runCatching { primaryFocus.requestFocus() } }
            AlertDialog(
            onDismissRequest = viewModel::dismiss,
            confirmButton = {
                TextButton(
                    onClick = viewModel::install,
                    modifier = Modifier.focusRequester(primaryFocus),
                ) { Text(stringResource(R.string.update_now)) }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismiss) { Text(stringResource(R.string.update_later)) }
            },
            title = { Text(stringResource(R.string.update_available_title)) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text(
                        stringResource(
                            R.string.update_available_body,
                            s.update.versionName,
                            BuildConfig.VERSION_NAME,
                        ),
                    )
                    if (s.update.notes.isNotBlank()) {
                        Text(
                            text = s.update.notes,
                            modifier = Modifier.padding(top = 12.dp),
                            maxLines = 12,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            },
            )
        }

        is UpdateUiState.Downloading -> AlertDialog(
            onDismissRequest = {}, // a download in flight should not be dismissed by a stray click
            confirmButton = {},
            title = { Text(stringResource(R.string.update_downloading)) },
            text = {
                Column {
                    if (s.fraction >= 0f) {
                        LinearProgressIndicator(
                            progress = { s.fraction },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Text("${(s.fraction * 100).toInt()}%", Modifier.padding(top = 8.dp))
                    } else {
                        LinearProgressIndicator(Modifier.fillMaxWidth())
                    }
                }
            },
        )

        is UpdateUiState.NeedsPermission -> {
            LaunchedEffect(Unit) { runCatching { primaryFocus.requestFocus() } }
            AlertDialog(
            onDismissRequest = viewModel::dismiss,
            confirmButton = {
                TextButton(
                    onClick = viewModel::install,
                    modifier = Modifier.focusRequester(primaryFocus),
                ) { Text(stringResource(R.string.update_now)) }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismiss) { Text(stringResource(R.string.update_later)) }
            },
            title = { Text(stringResource(R.string.update_allow_installs_title)) },
            text = { Text(stringResource(R.string.update_allow_installs_body)) },
            )
        }

        is UpdateUiState.Failed -> AlertDialog(
            onDismissRequest = viewModel::dismiss,
            confirmButton = {
                TextButton(onClick = viewModel::install) { Text(stringResource(R.string.update_retry)) }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismiss) { Text(stringResource(R.string.update_close)) }
            },
            title = { Text(stringResource(R.string.update_failed_title)) },
            text = { Text(stringResource(R.string.update_failed_body)) },
        )
    }
}

sealed interface UpdateUiState {
    data object Idle : UpdateUiState
    data class Available(val update: UpdateChecker.Update) : UpdateUiState
    data class Downloading(val update: UpdateChecker.Update, val fraction: Float) : UpdateUiState
    data class NeedsPermission(val update: UpdateChecker.Update) : UpdateUiState
    data class Failed(val update: UpdateChecker.Update) : UpdateUiState
}

/**
 * One shared update state so the manual "check for updates" (About) and the automatic gate speak
 * with one voice. A manual check that finds a build flips this, and [UpdateGate] — mounted over the
 * whole app — shows the dialog wherever the user is standing. Previously the two had separate state
 * (and the gate was throttled to a 6-hour check), so a manual find never actually prompted.
 */
object UpdateHub {
    val state = MutableStateFlow<UpdateUiState>(UpdateUiState.Idle)
}

class UpdateViewModel(app: Application) : AndroidViewModel(app) {
    private val graph = ServiceLocator.get(app)
    private val checker = UpdateChecker(graph.httpClient, BuildConfig.VERSION_NAME)
    private val installer = ApkInstaller(graph.httpClient)

    // Backed by the shared hub so a manual check from About lights up this same gate.
    private val _state = UpdateHub.state
    val state = _state.asStateFlow()

    init { checkThrottled() }

    /**
     * Hits GitHub at most once every [CHECK_INTERVAL_MS]. Frequent enough that a Stick left
     * on overnight sees the next cut, without a GitHub round-trip on every composition.
     */
    private fun checkThrottled() {
        viewModelScope.launch {
            val prefs = getApplication<Application>()
                .getSharedPreferences("opentv", Context.MODE_PRIVATE)
            val now = System.currentTimeMillis()
            if (now - prefs.getLong(KEY_LAST_CHECK, 0L) < CHECK_INTERVAL_MS) return@launch

            val update = checker.check()
            prefs.edit().putLong(KEY_LAST_CHECK, now).apply()
            if (update != null) _state.value = UpdateUiState.Available(update)
        }
    }

    fun install() {
        val update = when (val s = _state.value) {
            is UpdateUiState.Available -> s.update
            is UpdateUiState.Failed -> s.update
            is UpdateUiState.Downloading -> s.update
            is UpdateUiState.NeedsPermission -> s.update
            UpdateUiState.Idle -> return
        }
        viewModelScope.launch {
            _state.value = UpdateUiState.Downloading(update, 0f)
            runCatching {
                installer.downloadAndInstall(
                    context = getApplication(),
                    url = update.apkUrl,
                    expectedBytes = update.apkSizeBytes,
                ) { fraction -> _state.value = UpdateUiState.Downloading(update, fraction) }
            }.onSuccess {
                // The system installer is now front-and-centre; step our dialog aside.
                _state.value = UpdateUiState.Idle
            }.onFailure { error ->
                _state.value = if (error is NeedsUnknownSourcesException) {
                    UpdateUiState.NeedsPermission(update)
                } else {
                    UpdateUiState.Failed(update)
                }
            }
        }
    }

    fun dismiss() { _state.value = UpdateUiState.Idle }

    private companion object {
        const val KEY_LAST_CHECK = "last_update_check"
        const val CHECK_INTERVAL_MS = 30 * 60 * 1000L // 30 minutes
    }
}
