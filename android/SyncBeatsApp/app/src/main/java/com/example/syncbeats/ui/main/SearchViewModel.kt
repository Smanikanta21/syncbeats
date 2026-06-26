package com.example.syncbeats.ui.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.syncbeats.network.RetrofitClient
import com.example.syncbeats.network.SearchResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

class SearchViewModel(application: Application) : AndroidViewModel(application) {
    private val _searchResults = MutableStateFlow<List<SearchResult>>(emptyList())
    val searchResults: StateFlow<List<SearchResult>> = _searchResults.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _downloadingIds = MutableStateFlow<Set<String>>(emptySet())
    val downloadingIds: StateFlow<Set<String>> = _downloadingIds.asStateFlow()

    private val prefs = application.getSharedPreferences("syncbeats_prefs", android.content.Context.MODE_PRIVATE)

    private val _recentlyAdded = MutableStateFlow<List<SearchResult>>(emptyList())
    val recentlyAdded: StateFlow<List<SearchResult>> = _recentlyAdded.asStateFlow()

    init {
        loadRecentlyAdded()
    }

    private fun loadRecentlyAdded() {
        val json = prefs.getString("recently_added", "[]") ?: "[]"
        try {
            val list = Json.decodeFromString<List<SearchResult>>(json)
            _recentlyAdded.value = list
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun addRecentlyAdded(result: SearchResult) {
        val current = _recentlyAdded.value.toMutableList()
        current.removeAll { it.id == result.id }
        current.add(0, result)
        if (current.size > 3) {
            current.removeAt(current.size - 1)
        }
        _recentlyAdded.value = current
        try {
            val json = Json.encodeToString<List<SearchResult>>(current.toList())
            prefs.edit().putString("recently_added", json).apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun search(query: String) {
        if (query.isBlank()) {
            _searchResults.value = emptyList()
            return
        }

        viewModelScope.launch {
            _isLoading.value = true
            try {
                val response = RetrofitClient.searchApi.searchYouTube(query)
                _searchResults.value = response.results
            } catch (e: Exception) {
                e.printStackTrace()
                _searchResults.value = emptyList()
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun downloadAndPlay(result: SearchResult, onDownloadComplete: (File) -> Unit) {
        if (_downloadingIds.value.contains(result.id)) return

        val app = getApplication<Application>()
        val outputFile = File(app.filesDir, "${result.id}.mp3")
        
        if (outputFile.exists()) {
            addRecentlyAdded(result)
            onDownloadComplete(outputFile)
            return
        }

        viewModelScope.launch {
            _downloadingIds.value = _downloadingIds.value + result.id
            try {
                val responseBody = RetrofitClient.searchApi.downloadAudio(result.id)
                withContext(Dispatchers.IO) {
                    var inputStream: InputStream? = null
                    var outputStream: FileOutputStream? = null
                    try {
                        inputStream = responseBody.byteStream()
                        outputStream = FileOutputStream(outputFile)
                        val buffer = ByteArray(4096)
                        var bytesRead: Int
                        while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                            outputStream.write(buffer, 0, bytesRead)
                        }
                        outputStream.flush()
                    } finally {
                        inputStream?.close()
                        outputStream?.close()
                    }
                }
                addRecentlyAdded(result)
                onDownloadComplete(outputFile)
            } catch (e: Exception) {
                e.printStackTrace()
                if (outputFile.exists()) outputFile.delete()
            } finally {
                _downloadingIds.value = _downloadingIds.value - result.id
            }
        }
    }
}
