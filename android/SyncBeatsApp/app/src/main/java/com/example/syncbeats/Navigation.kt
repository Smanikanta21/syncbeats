package com.example.syncbeats

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.example.syncbeats.ui.AuthScreen
import com.example.syncbeats.ui.SplashScreen

@Composable
fun MainNavigation() {
  val context = androidx.compose.ui.platform.LocalContext.current
  val audioPlayer = androidx.compose.runtime.remember { com.example.syncbeats.ui.main.AudioPlayerManager(context) }
  androidx.compose.runtime.DisposableEffect(Unit) {
      onDispose {
          audioPlayer.release()
      }
  }

  val backStack = rememberNavBackStack(Splash)

  NavDisplay(
    backStack = backStack,
    onBack = { backStack.removeLastOrNull() },
    entryProvider =
      entryProvider {
        entry<Splash> {
          SplashScreen(
            onNavigateToNext = { isLoggedIn ->
              backStack.removeLastOrNull()
              if (isLoggedIn) {
                  backStack.add(Hub)
              } else {
                  backStack.add(Auth)
              }
            }
          )
        }
        entry<Auth> {
          AuthScreen(
            onLoginSuccess = {
              backStack.removeLastOrNull()
              backStack.add(Hub)
            }
          )
        }
        entry<Hub> {
          com.example.syncbeats.ui.main.MainScreen(
              audioPlayer = audioPlayer,
              onNavigateToProfile = { backStack.add(Profile) }
          )
        }
        entry<Profile> {
          com.example.syncbeats.ui.profile.ProfileScreen(
              onBack = { backStack.removeLastOrNull() }
          )
        }
      },
  )
}
