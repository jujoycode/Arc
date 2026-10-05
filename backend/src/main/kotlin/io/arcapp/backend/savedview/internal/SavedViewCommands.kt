package io.arcapp.backend.savedview.internal

data class SavedViewInput(val name: String, val filters: String = "{}", val options: String = "{}")
