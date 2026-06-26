package com.example.syncbeats.network

import okhttp3.ResponseBody
import retrofit2.http.GET
import retrofit2.http.Query
import retrofit2.http.Streaming

interface SearchApi {
    @GET("search/youtube")
    suspend fun searchYouTube(@Query("q") query: String): SearchResponse

    @Streaming
    @GET("search/youtube/download")
    suspend fun downloadAudio(@Query("videoId") videoId: String): ResponseBody
}
