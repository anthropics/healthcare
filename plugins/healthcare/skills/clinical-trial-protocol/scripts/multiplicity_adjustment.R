#!/usr/bin/env Rscript
#
# Multiplicity Adjustment Calculator for Clinical Trial Design
#
# Adjusts p-values for multiple comparisons using Bonferroni, Holm (step-down),
# and Hochberg (step-up) procedures.
#

if (!requireNamespace("jsonlite", quietly = TRUE)) {
  message("ERROR: jsonlite package not installed. Run: install.packages('jsonlite')")
  quit(status = 1)
}

bonferroni_adjust <- function(p_values, alpha) {
  m <- length(p_values)
  adjusted <- pmin(p_values * m, 1.0)
  rejected <- adjusted <= alpha
  list(adjusted = adjusted, rejected = rejected)
}

holm_adjust <- function(p_values, alpha) {
  m <- length(p_values)
  ord <- order(p_values)

  adjusted <- numeric(m)
  cummax_val <- 0.0
  for (i in seq_along(ord)) {
    adj_p <- min(p_values[ord[i]] * (m - i + 1), 1.0)
    cummax_val <- max(cummax_val, adj_p)
    adjusted[ord[i]] <- cummax_val
  }

  rejected <- adjusted <= alpha
  list(adjusted = adjusted, rejected = rejected)
}

hochberg_adjust <- function(p_values, alpha) {
  m <- length(p_values)
  ord <- order(p_values, decreasing = TRUE)

  adjusted <- numeric(m)
  cummin_val <- 1.0
  for (i in seq_along(ord)) {
    adj_p <- min(p_values[ord[i]] * i, 1.0)
    cummin_val <- min(cummin_val, adj_p)
    adjusted[ord[i]] <- cummin_val
  }

  rejected <- adjusted <= alpha
  list(adjusted = adjusted, rejected = rejected)
}

parse_args <- function(args) {
  defaults <- list(
    p_values = NULL, method = NULL, alpha = 0.05,
    labels = NULL, output = NULL
  )

  i <- 1
  while (i <= length(args)) {
    key <- args[i]
    if (i + 1 > length(args)) stop(paste("Missing value for argument:", key))
    val <- args[i + 1]

    switch(key,
      "--p-values" = { defaults$p_values <- as.numeric(strsplit(val, ",")[[1]]) },
      "--method" = { defaults$method <- val },
      "--alpha" = { defaults$alpha <- as.numeric(val) },
      "--labels" = { defaults$labels <- strsplit(val, ",")[[1]] },
      "--output" = { defaults$output <- val },
      stop(paste("Unknown argument:", key))
    )
    i <- i + 2
  }

  if (is.null(defaults$p_values)) stop("--p-values is required")
  if (is.null(defaults$method)) stop("--method is required")
  defaults
}

main <- function() {
  args <- parse_args(commandArgs(trailingOnly = TRUE))

  p_values <- args$p_values
  m <- length(p_values)

  if (any(p_values < 0 | p_values > 1)) {
    message("ERROR: All p-values must be between 0 and 1")
    quit(status = 1)
  }

  if (!is.null(args$labels)) {
    labels <- args$labels
    if (length(labels) != m) {
      message("ERROR: Number of labels must match number of p-values")
      quit(status = 1)
    }
  } else {
    labels <- paste0("H", seq_len(m))
  }

  methods_map <- list(
    bonferroni = bonferroni_adjust,
    holm = holm_adjust,
    hochberg = hochberg_adjust
  )

  if (args$method == "all") {
    method_names <- names(methods_map)
  } else {
    method_names <- args$method
  }

  adjustments <- list()
  for (method_name in method_names) {
    res <- methods_map[[method_name]](p_values, args$alpha)
    adjustments[[method_name]] <- list(
      adjusted_p_values = round(res$adjusted, 10),
      rejected = as.logical(res$rejected),
      n_rejected = as.integer(sum(res$rejected))
    )
  }

  result <- list(
    analysis = "multiplicity_adjustment",
    n_hypotheses = as.integer(m),
    alpha = args$alpha,
    hypotheses = labels,
    original_p_values = p_values,
    adjustments = adjustments,
    assumptions = c(
      "P-values are valid (uniformly distributed under H0)",
      paste0("Family-wise error rate controlled at ", args$alpha),
      "Bonferroni: valid for any dependency structure",
      "Holm: valid for any dependency structure (uniformly more powerful than Bonferroni)",
      "Hochberg: requires non-negative dependency (e.g., independent or positively correlated tests)"
    ),
    disclaimers = c(
      "Multiplicity adjustment is preliminary",
      "Final analysis plan requires biostatistician review",
      "Consider graphical procedures (Bretz et al.) for complex endpoint hierarchies"
    )
  )

  json_str <- jsonlite::toJSON(result, auto_unbox = TRUE, pretty = FALSE, digits = NA)
  json_str <- jsonlite::prettify(json_str, indent = 2)

  if (!is.null(args$output)) {
    writeLines(json_str, args$output)
    cat(paste0("Results written to ", args$output, "\n"))
  } else {
    cat(json_str)
    cat("\n")
  }
}

main()
